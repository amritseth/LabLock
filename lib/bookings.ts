import "server-only";
import { withTransaction, sha256Hex, type Tx } from "./db";
import { BOOKING_WINDOW_DAYS, DEFAULT_RESOURCE_SLUG } from "./slots";
import { canonicalBookingPayload, checkBookingRules } from "./availability";

/**
 * The booking transaction — handbook §9 "Transaction boundary — ten steps,
 * one commit" and §10 idempotency flows.
 *
 * Invariant enforced by Postgres (not application code):
 *   CREATE UNIQUE INDEX bookings_one_confirmed_per_slot
 *   ON bookings (resource_id, starts_at) WHERE status = 'confirmed';
 *
 * All business outcomes are returned as discriminated results (never thrown
 * across the transaction boundary) so the rejected/idempotency bookkeeping
 * commits atomically with the outcome that produced it.
 */

export interface Actor {
  userId: string;
  role: "student" | "operator";
}

export interface BookingInput {
  /** v1 has exactly one resource; slug optional, defaults to project-lab. */
  resourceSlug?: string;
  /** UTC ISO instant of the start (Kolkata-hour aligned). */
  startsAt: string;
  cancelReason?: string;
}

export interface IdempotencyContext {
  idempotencyKey?: string;
  requestId: string;
}

export type Outcome =
  | { kind: "ok"; httpStatus: 200; body: Record<string, unknown> }
  | { kind: "conflict"; httpStatus: 409; body: Record<string, unknown> }
  | { kind: "client_error"; httpStatus: 400; body: Record<string, unknown> }
  | { kind: "not_found"; httpStatus: 404; body: Record<string, unknown> }
  | { kind: "forbidden"; httpStatus: 403; body: Record<string, unknown> }
  | { kind: "unauthorized"; httpStatus: 401; body: Record<string, unknown> };

export function toHttp(outcome: Outcome): { status: number; body: Record<string, unknown> } {
  return { status: outcome.httpStatus, body: outcome.body };
}

const MISSING_KEY: Outcome = {
  kind: "client_error",
  httpStatus: 400,
  body: { status: "error", code: "missing_idempotency_key" },
};

interface IdempotencyRow {
  status: "pending" | "committed" | "rejected";
  request_hash: string;
  response: Record<string, unknown> | null;
}

/**
 * Steps 1 + 8 of the transaction: claim-or-read the idempotency record.
 * - committed + same hash  → replay the stored response, no side effects.
 * - committed + diff hash  → idempotency_key_reuse (409).
 * - pending/new + diff hash → idempotency_key_reuse (409): the record is
 *   bound to the original payload.
 * - pending/new + same hash → the caller owns the claim; proceed.
 */
async function claimIdempotency(
  tx: Tx,
  actor: Actor,
  operation: "book" | "cancel" | "block" | "unblock",
  idempotencyKey: string,
  requestHash: string,
  requestId: string,
): Promise<{ owned: boolean; replayed?: Record<string, unknown> } | Outcome> {
  // The ON CONFLICT branch deliberately keeps the ORIGINAL request_hash
  // (self-assignment). Overwriting it with the new payload's hash would
  // defeat the reuse check below — the handbook's pseudocode writes
  // `EXCLUDED.request_hash` here; that ordering makes the reuse comparison
  // always pass. We keep the stored hash so a replayed-or-reused key is
  // detectable, while the row lock still serializes concurrent claims.
  const { rows } = await tx.query<IdempotencyRow>(
    `INSERT INTO idempotency_records ("key", user_id, operation, request_hash, status)
     VALUES ($1, $2, $3, $4, 'pending')
     ON CONFLICT ("key") DO UPDATE SET request_hash = idempotency_records.request_hash
     RETURNING status, request_hash, response`,
    [idempotencyKey, actor.userId, operation, requestHash],
  );
  const record = rows[0];
  if (!record) {
    return {
      kind: "client_error",
      httpStatus: 400,
      body: { status: "error", code: "idempotency_claim_failed" },
    };
  }
  if (record.status === "committed") {
    if (record.request_hash !== requestHash) {
      return {
        kind: "conflict",
        httpStatus: 409,
        body: { status: "conflict", reason: "idempotency_key_reuse", requestId },
      };
    }
    return { owned: false, replayed: record.response ?? {} };
  }
  if (record.request_hash !== requestHash) {
    return {
      kind: "conflict",
      httpStatus: 409,
      body: { status: "conflict", reason: "idempotency_key_reuse", requestId },
    };
  }
  return { owned: true };
}

async function markTerminal(
  tx: Tx,
  idempotencyKey: string,
  status: "committed" | "rejected",
  response: Record<string, unknown>,
): Promise<void> {
  await tx.query(
    `UPDATE idempotency_records
     SET status = $1, response = $2::jsonb, committed_at = now()
     WHERE "key" = $3`,
    [status, JSON.stringify(response), idempotencyKey],
  );
}

interface ResourceRow {
  id: string;
  slug: string;
  name: string;
  tz: string;
  slot_length_minutes: number;
  is_active: boolean;
}

async function requireActiveResource(tx: Tx, slug: string): Promise<ResourceRow> {
  const { rows } = await tx.query<ResourceRow>(
    `SELECT id, slug, name, tz, slot_length_minutes, is_active
     FROM resources WHERE slug = $1`,
    [slug],
  );
  const resource = rows[0];
  if (!resource || !resource.is_active) {
    throw new ResourceNotFound();
  }
  return resource;
}

export class ResourceNotFound extends Error {}

function auditHash(userId: string): string {
  const pepper = process.env.AUDIT_PEPPER ?? "dev-pepper-unset";
  return sha256Hex(`${userId}:${pepper}`);
}

/**
 * Steps 2–10: Auth (caller) → idempotency claim → request hash → slot rules →
 * booking insert → audit → availability event → save response → commit.
 */
export async function bookSlot(
  actor: Actor,
  input: BookingInput,
  ctx: IdempotencyContext,
): Promise<Outcome> {
  if (!ctx.idempotencyKey) return MISSING_KEY;
  const idempotencyKey = ctx.idempotencyKey;
  const resourceSlug = input.resourceSlug || DEFAULT_RESOURCE_SLUG;
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return {
      kind: "client_error",
      httpStatus: 400,
      body: { status: "error", code: "invalid_input", requestId: ctx.requestId },
    };
  }
  const requestHash = sha256Hex(canonicalBookingPayload(resourceSlug, startsAt.toISOString()));

  return withTransaction(async (tx) => {
    const claim = await claimIdempotency(
      tx,
      actor,
      "book",
      idempotencyKey,
      requestHash,
      ctx.requestId,
    );
    if (!("owned" in claim)) return claim;
    if (!claim.owned) {
      return { kind: "ok", httpStatus: 200, body: claim.replayed! } as Outcome;
    }

    // Step 4 — slot rules (rules described in handbook §4 Product rules v1).
    const rules = checkBookingRules(startsAt, new Date(), BOOKING_WINDOW_DAYS);
    if (!rules.ok) {
      const body = { status: "error", code: rules.reason, requestId: ctx.requestId };
      await markTerminal(tx, idempotencyKey, "rejected", body);
      return { kind: "client_error", httpStatus: 400, body };
    }

    let resource: ResourceRow;
    try {
      resource = await requireActiveResource(tx, resourceSlug);
    } catch (error) {
      if (error instanceof ResourceNotFound) {
        const body = {
          status: "error",
          code: "resource_not_found",
          resourceSlug,
          requestId: ctx.requestId,
        };
        await markTerminal(tx, idempotencyKey, "rejected", body);
        return { kind: "not_found", httpStatus: 404, body };
      }
      throw error;
    }

    // Step 5 — operator blackouts win over bookings.
    const blocked = await tx.query(
      `SELECT 1 FROM slot_blocks WHERE resource_id = $1 AND starts_at = $2`,
      [resource.id, startsAt.toISOString()],
    );
    if (blocked.rowCount && blocked.rowCount > 0) {
      const body = {
        status: "conflict",
        reason: "slot_blocked",
        resourceId: resource.id,
        startsAt: startsAt.toISOString(),
        requestId: ctx.requestId,
      };
      await markTerminal(tx, idempotencyKey, "rejected", body);
      return { kind: "conflict", httpStatus: 409, body };
    }

    // Step 6 — the correctness wall: Postgres decides the winner.
    // A unique violation aborts the whole transaction in Postgres, so the
    // insert runs inside a savepoint: on 23505 we roll back to the savepoint
    // (the idempotency claim survives) and record the terminal 'rejected'
    // state with the 409 response.
    await tx.query("SAVEPOINT booking_insert");
    let bookingInsert;
    try {
      bookingInsert = await tx.query(
        `INSERT INTO bookings (resource_id, user_id, starts_at, status)
         VALUES ($1, $2, $3, 'confirmed')
         RETURNING id, created_at`,
        [resource.id, actor.userId, startsAt.toISOString()],
      );
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") {
        await tx.query("ROLLBACK TO SAVEPOINT booking_insert");
        // Partial unique index bookings_one_confirmed_per_slot fired.
        const body: Record<string, unknown> = {
          status: "conflict",
          reason: "slot_already_confirmed",
          resourceId: resource.id,
          startsAt: startsAt.toISOString(),
          requestId: ctx.requestId,
        };
        await markTerminal(tx, idempotencyKey, "rejected", body);
        return { kind: "conflict", httpStatus: 409, body };
      }
      throw error;
    }

    const booking = bookingInsert.rows[0] as { id: string; created_at: string };

    // Steps 7–8 — audit + PII-free realtime event, same commit.
    await tx.query(
      `INSERT INTO audit_events (booking_id, actor_id, action, request_id, hashed_user_ref, metadata)
       VALUES ($1, $2, 'created', $3, $4, $5::jsonb)`,
      [
        booking.id,
        actor.userId,
        ctx.requestId,
        auditHash(actor.userId),
        JSON.stringify({ resourceSlug, startsAt: startsAt.toISOString() }),
      ],
    );
    await tx.query(
      `INSERT INTO availability_events (resource_id, starts_at, new_state)
       VALUES ($1, $2, 'booked')`,
      [resource.id, startsAt.toISOString()],
    );

    // Step 9 — save response, mark committed; step 10 — commit/return.
    const body: Record<string, unknown> = {
      status: "confirmed",
      bookingId: booking.id,
      resourceId: resource.id,
      startsAt: startsAt.toISOString(),
      confirmedAt: new Date(booking.created_at).toISOString(),
      requestId: ctx.requestId,
    };
    await markTerminal(tx, idempotencyKey, "committed", body);
    return { kind: "ok", httpStatus: 200, body };
  });
}

/**
 * Cancel: students may cancel their own future bookings; the operator may
 * cancel any booking. Cancellations free the slot for everyone (the partial
 * unique index only counts status = 'confirmed').
 */
export async function cancelBooking(
  actor: Actor,
  bookingId: string,
  ctx: IdempotencyContext & { cancelReason?: string },
): Promise<Outcome> {
  if (!ctx.idempotencyKey) return MISSING_KEY;
  const idempotencyKey = ctx.idempotencyKey;
  const requestHash = sha256Hex(
    JSON.stringify({ operation: "cancel", bookingId, reason: ctx.cancelReason ?? null }),
  );

  return withTransaction(async (tx) => {
    const claim = await claimIdempotency(
      tx,
      actor,
      "cancel",
      idempotencyKey,
      requestHash,
      ctx.requestId,
    );
    if (!("owned" in claim)) return claim;
    if (!claim.owned) return { kind: "ok", httpStatus: 200, body: claim.replayed! } as Outcome;

    const { rows } = await tx.query<{
      id: string;
      resource_id: string;
      user_id: string;
      starts_at: string;
      status: string;
    }>(
      `SELECT id, resource_id, user_id, starts_at, status FROM bookings WHERE id = $1 FOR UPDATE`,
      [bookingId],
    );
    const booking = rows[0];
    if (!booking) {
      const body = { status: "error", code: "booking_not_found", requestId: ctx.requestId };
      await markTerminal(tx, idempotencyKey, "rejected", body);
      return { kind: "not_found", httpStatus: 404, body };
    }
    if (actor.role !== "operator" && booking.user_id !== actor.userId) {
      const body = { status: "error", code: "forbidden", requestId: ctx.requestId };
      await markTerminal(tx, idempotencyKey, "rejected", body);
      return { kind: "forbidden", httpStatus: 403, body };
    }
    // Students cancel future slots only; the operator may cancel any past booking.
    if (actor.role !== "operator" && new Date(booking.starts_at).getTime() <= Date.now()) {
      const body = { status: "error", code: "slot_in_past", requestId: ctx.requestId };
      await markTerminal(tx, idempotencyKey, "rejected", body);
      return { kind: "client_error", httpStatus: 400, body };
    }
    if (booking.status === "cancelled") {
      const body = {
        status: "conflict",
        reason: "booking_already_cancelled",
        bookingId,
        requestId: ctx.requestId,
      };
      await markTerminal(tx, idempotencyKey, "rejected", body);
      return { kind: "conflict", httpStatus: 409, body };
    }

    const { rows: updated } = await tx.query<{ cancelled_at: string }>(
      `UPDATE bookings
       SET status = 'cancelled', cancelled_at = now(), cancel_reason = $2
       WHERE id = $1
       RETURNING cancelled_at`,
      [bookingId, ctx.cancelReason ?? null],
    );

    await tx.query(
      `INSERT INTO audit_events (booking_id, actor_id, action, request_id, hashed_user_ref, metadata)
       VALUES ($1, $2, 'cancelled', $3, $4, $5::jsonb)`,
      [
        bookingId,
        actor.userId,
        ctx.requestId,
        auditHash(actor.userId),
        JSON.stringify({ reason: ctx.cancelReason ?? null }),
      ],
    );
    await tx.query(
      `INSERT INTO availability_events (resource_id, starts_at, new_state)
       VALUES ($1, $2, 'free')`,
      [booking.resource_id, booking.starts_at],
    );

    const body: Record<string, unknown> = {
      status: "cancelled",
      bookingId,
      resourceId: booking.resource_id,
      startsAt: booking.starts_at,
      cancelledAt: updated[0]?.cancelled_at ? new Date(updated[0].cancelled_at).toISOString() : null,
      requestId: ctx.requestId,
    };
    await markTerminal(tx, idempotencyKey, "committed", body);
    return { kind: "ok", httpStatus: 200, body };
  });
}

/**
 * Operator: block a slot (maintenance / blackout). A confirmed booking that
 * already exists must be cancelled first — blocks never override bookings
 * silently.
 */
export async function blockSlot(
  actor: Actor,
  input: BookingInput,
  ctx: IdempotencyContext,
): Promise<Outcome> {
  if (actor.role !== "operator") {
    return {
      kind: "forbidden",
      httpStatus: 403,
      body: { status: "error", code: "forbidden", requestId: ctx.requestId },
    };
  }
  if (!ctx.idempotencyKey) return MISSING_KEY;
  const idempotencyKey = ctx.idempotencyKey;
  const resourceSlug = input.resourceSlug || DEFAULT_RESOURCE_SLUG;
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return {
      kind: "client_error",
      httpStatus: 400,
      body: { status: "error", code: "invalid_input", requestId: ctx.requestId },
    };
  }
  const requestHash = sha256Hex(
    JSON.stringify({ operation: "block", startsAt: startsAt.toISOString() }),
  );

  return withTransaction(async (tx) => {
    const claim = await claimIdempotency(
      tx,
      actor,
      "block",
      idempotencyKey,
      requestHash,
      ctx.requestId,
    );
    if (!("owned" in claim)) return claim;
    if (!claim.owned) return { kind: "ok", httpStatus: 200, body: claim.replayed! } as Outcome;

    const rules = checkBookingRules(startsAt, new Date(), BOOKING_WINDOW_DAYS);
    if (!rules.ok) {
      const body = { status: "error", code: rules.reason, requestId: ctx.requestId };
      await markTerminal(tx, idempotencyKey, "rejected", body);
      return { kind: "client_error", httpStatus: 400, body };
    }

    let resource: ResourceRow;
    try {
      resource = await requireActiveResource(tx, resourceSlug);
    } catch (error) {
      if (error instanceof ResourceNotFound) {
        const body = {
          status: "error",
          code: "resource_not_found",
          resourceSlug,
          requestId: ctx.requestId,
        };
        await markTerminal(tx, idempotencyKey, "rejected", body);
        return { kind: "not_found", httpStatus: 404, body };
      }
      throw error;
    }

    const existing = await tx.query(
      `SELECT 1 FROM bookings WHERE resource_id = $1 AND starts_at = $2 AND status = 'confirmed'`,
      [resource.id, startsAt.toISOString()],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      const body = {
        status: "conflict",
        reason: "booking_exists",
        resourceId: resource.id,
        startsAt: startsAt.toISOString(),
        requestId: ctx.requestId,
      };
      await markTerminal(tx, idempotencyKey, "rejected", body);
      return { kind: "conflict", httpStatus: 409, body };
    }

    // Same savepoint pattern as the booking insert (see Step 6).
    await tx.query("SAVEPOINT slot_block_insert");
    let inserted;
    try {
      inserted = await tx.query(
        `INSERT INTO slot_blocks (resource_id, starts_at, reason, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
        [resource.id, startsAt.toISOString(), input.cancelReason ?? null, actor.userId],
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        await tx.query("ROLLBACK TO SAVEPOINT slot_block_insert");
        const body = {
          status: "conflict",
          reason: "slot_already_blocked",
          resourceId: resource.id,
          startsAt: startsAt.toISOString(),
          requestId: ctx.requestId,
        };
        await markTerminal(tx, idempotencyKey, "rejected", body);
        return { kind: "conflict", httpStatus: 409, body };
      }
      throw error;
    }

    const block = inserted.rows[0] as { id: string; created_at: string };
    await tx.query(
      `INSERT INTO audit_events (booking_id, actor_id, action, request_id, hashed_user_ref, metadata)
       VALUES (NULL, $1, 'blocked', $2, $3, $4::jsonb)`,
      [
        actor.userId,
        ctx.requestId,
        auditHash(actor.userId),
        JSON.stringify({ blockId: block.id, startsAt: startsAt.toISOString() }),
      ],
    );
    await tx.query(
      `INSERT INTO availability_events (resource_id, starts_at, new_state)
       VALUES ($1, $2, 'blocked')`,
      [resource.id, startsAt.toISOString()],
    );

    const body: Record<string, unknown> = {
      status: "blocked",
      blockId: block.id,
      resourceId: resource.id,
      startsAt: startsAt.toISOString(),
      requestId: ctx.requestId,
    };
    await markTerminal(tx, idempotencyKey, "committed", body);
    return { kind: "ok", httpStatus: 200, body };
  });
}

/**
 * Operator: remove a block. The slot returns to free and the change is
 * broadcast as a PII-free availability event.
 */
export async function unblockSlot(
  actor: Actor,
  blockId: string,
  ctx: IdempotencyContext,
): Promise<Outcome> {
  if (actor.role !== "operator") {
    return {
      kind: "forbidden",
      httpStatus: 403,
      body: { status: "error", code: "forbidden", requestId: ctx.requestId },
    };
  }
  if (!ctx.idempotencyKey) return MISSING_KEY;
  const idempotencyKey = ctx.idempotencyKey;
  const requestHash = sha256Hex(JSON.stringify({ operation: "unblock", blockId }));

  return withTransaction(async (tx) => {
    const claim = await claimIdempotency(
      tx,
      actor,
      "unblock",
      idempotencyKey,
      requestHash,
      ctx.requestId,
    );
    if (!("owned" in claim)) return claim;
    if (!claim.owned) return { kind: "ok", httpStatus: 200, body: claim.replayed! } as Outcome;

    const { rows } = await tx.query(
      `DELETE FROM slot_blocks WHERE id = $1 RETURNING id, resource_id, starts_at`,
      [blockId],
    );
    const block = rows[0] as { id: string; resource_id: string; starts_at: string } | undefined;
    if (!block) {
      const body = { status: "error", code: "block_not_found", requestId: ctx.requestId };
      await markTerminal(tx, idempotencyKey, "rejected", body);
      return { kind: "not_found", httpStatus: 404, body };
    }

    await tx.query(
      `INSERT INTO audit_events (booking_id, actor_id, action, request_id, hashed_user_ref, metadata)
       VALUES (NULL, $1, 'unblocked', $2, $3, $4::jsonb)`,
      [
        actor.userId,
        ctx.requestId,
        auditHash(actor.userId),
        JSON.stringify({ blockId: block.id, startsAt: block.starts_at }),
      ],
    );
    await tx.query(
      `INSERT INTO availability_events (resource_id, starts_at, new_state)
       VALUES ($1, $2, 'free')`,
      [block.resource_id, block.starts_at],
    );

    const body: Record<string, unknown> = {
      status: "unblocked",
      blockId: block.id,
      resourceId: block.resource_id,
      startsAt: block.starts_at,
      requestId: ctx.requestId,
    };
    await markTerminal(tx, idempotencyKey, "committed", body);
    return { kind: "ok", httpStatus: 200, body };
  });
}

/**
 * Occupancy feed for the availability view: confirmed starts and blocked
 * starts in the window. Never returns booker identity (see handbook §3/§4:
 * occupancy is public, identity is private).
 */
export async function fetchOccupancy(
  tx: Tx,
  resourceId: string,
  fromIso: string,
  toIso: string,
): Promise<{ confirmedStarts: string[]; blockedStarts: string[] }> {
  const confirmed = await tx.query<{ starts_at: string }>(
    `SELECT starts_at FROM bookings
     WHERE resource_id = $1 AND status = 'confirmed' AND starts_at >= $2 AND starts_at < $3
     ORDER BY starts_at`,
    [resourceId, fromIso, toIso],
  );
  const blocked = await tx.query<{ starts_at: string }>(
    `SELECT starts_at FROM slot_blocks
     WHERE resource_id = $1 AND starts_at >= $2 AND starts_at < $3
     ORDER BY starts_at`,
    [resourceId, fromIso, toIso],
  );
  return {
    confirmedStarts: confirmed.rows.map((r) => r.starts_at),
    blockedStarts: blocked.rows.map((r) => r.starts_at),
  };
}

/**
 * Server-side rows for "My bookings": own bookings (any status) plus
 * everything when the caller is the operator.
 */
export async function listMyBookings(actor: Actor, limit = 50): Promise<unknown[]> {
  return withTransaction(async (tx) => {
    if (actor.role === "operator") {
      const { rows } = await tx.query(
        `SELECT b.id, b.user_id, b.starts_at, b.status, b.cancel_reason, b.created_at, b.cancelled_at,
                r.slug AS resource_slug, r.name AS resource_name
         FROM bookings b JOIN resources r ON r.id = b.resource_id
         ORDER BY b.starts_at DESC LIMIT $1`,
        [limit],
      );
      return rows;
    }
    const { rows } = await tx.query(
      `SELECT b.id, b.user_id, b.starts_at, b.status, b.cancel_reason, b.created_at, b.cancelled_at,
              r.slug AS resource_slug, r.name AS resource_name
       FROM bookings b JOIN resources r ON r.id = b.resource_id
       WHERE b.user_id = $1
       ORDER BY b.starts_at DESC LIMIT $2`,
      [actor.userId, limit],
    );
    return rows;
  });
}

/**
 * Operator audit trail: immutable state-changing actions, newest first.
 */
export async function listAuditEvents(actor: Actor, limit = 100): Promise<unknown[]> {
  if (actor.role !== "operator") {
    return [];
  }
  return withTransaction(async (tx) => {
    const { rows } = await tx.query(
      `SELECT id, booking_id, action, request_id, metadata, created_at
       FROM audit_events
       ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return rows;
  });
}
