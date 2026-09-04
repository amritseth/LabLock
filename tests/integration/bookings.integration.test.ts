import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import {
  bookSlot,
  cancelBooking,
  blockSlot,
  unblockSlot,
  type Actor,
  type Outcome,
} from "@/lib/bookings";
import { isAlignedToKolkataHour, kolkataHourToUtc, KOLKATA_TZ } from "@/lib/slots";

/**
 * Invariant tests — handbook §17 "Planned invariant tests" (Slice B).
 *
 * These run the REAL ten-step transaction (lib/bookings.ts) against a real
 * PostgreSQL 17 database prepared by scripts/prepare-local-db.sh.
 *
 *   TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/lablock_test \
 *     pnpm test:integration
 */

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.SUPABASE_DB_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/lablock_test";

const pool = new Pool({ connectionString: DATABASE_URL, max: 20 });

const STUDENT_A: Actor = { userId: "11111111-1111-1111-1111-111111111111", role: "student" };
const STUDENT_B: Actor = { userId: "22222222-2222-2222-2222-222222222222", role: "student" };
const STUDENT_C: Actor = { userId: "33333333-3333-3333-3333-333333333333", role: "student" };
const OPERATOR: Actor = { userId: "44444444-4444-4444-4444-444444444444", role: "operator" };

const RESOURCE_ID = "00000000-0000-0000-0000-000000000001";

function kolkataSlot(hoursFromNow: number, hour: number): Date {
  const now = new Date();
  const day = new Date(now.getTime() + hoursFromNow * 86_400_000);
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOLKATA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(day);
  return kolkataHourToUtc(dateStr, hour);
}

function ok(outcome: Outcome): Record<string, unknown> {
  expect(outcome.kind).toBe("ok");
  return outcome.body;
}

function conflictCode(outcome: Outcome): string {
  expect(outcome.kind).toBe("conflict");
  return outcome.body.reason as string;
}

let requestSeq = 0;
function ctx(key?: string) {
  requestSeq += 1;
  return {
    idempotencyKey: key ?? `it-${requestSeq}-${Math.random().toString(36).slice(2)}`,
    requestId: `req-${requestSeq}`,
  };
}

/** Explicitly NO idempotency key (tests the 400 contract). */
function ctxMissingKey() {
  requestSeq += 1;
  return { idempotencyKey: undefined, requestId: `req-${requestSeq}` };
}

beforeAll(async () => {
  await pool.query("SELECT 1"); // fail fast when the DB is unreachable
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE idempotency_records, availability_events, audit_events, slot_blocks, bookings, profiles CASCADE`,
  );
  await pool.query(
    `INSERT INTO resources (id, slug, name, tz, slot_length_minutes, is_active)
     VALUES ($1, 'project-lab', 'Project Lab', 'Asia/Kolkata', 60, true)
     ON CONFLICT (slug) DO UPDATE SET is_active = true`,
    [RESOURCE_ID],
  );
  for (const actor of [STUDENT_A, STUDENT_B, STUDENT_C, OPERATOR]) {
    await pool.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [actor.userId, `${actor.userId.slice(0, 8)}@pilot.local`],
    );
  }
});

describe("invariant: at most one confirmed booking per (resource_id, starts_at)", () => {
  it("20 users target one slot → exactly one winner, 19 conflicts", async () => {
    const startsAt = kolkataSlot(1, 11);
    const actors = Array.from({ length: 20 }, (_, i) => ({
      userId: `99999999-9999-9999-9999-${String(i).padStart(12, "0")}`,
      role: "student" as const,
    }));
    for (const actor of actors) {
      await pool.query(`INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [
        actor.userId,
      ]);
    }

    const outcomes = await Promise.all(
      actors.map((actor, i) =>
        bookSlot(actor, { startsAt: startsAt.toISOString() }, ctx(`race-${i}`)),
      ),
    );

    const winners = outcomes.filter((o) => o.kind === "ok");
    const losers = outcomes.filter((o) => o.kind === "conflict");
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(19);
    expect(losers.every((o) => conflictCode(o) === "slot_already_confirmed")).toBe(true);

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM bookings WHERE resource_id = $1 AND starts_at = $2 AND status = 'confirmed'`,
      [RESOURCE_ID, startsAt.toISOString()],
    );
    expect(rows[0].n).toBe(1);
  });

  it("cancel/book race on the same slot → the invariant still holds", async () => {
    const startsAt = kolkataSlot(1, 14);
    const first = ok(await bookSlot(STUDENT_A, { startsAt: startsAt.toISOString() }, ctx()));
    expect(first.status).toBe("confirmed");

    // Student B attempts to book while A's cancellation is in flight.
    const [cancel, book] = await Promise.all([
      cancelBooking(STUDENT_A, String(first.bookingId), ctx()),
      bookSlot(STUDENT_B, { startsAt: startsAt.toISOString() }, ctx()),
    ]);
    expect(cancel.kind).toBe("ok");

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n, bool_and(status = 'confirmed') AS all_confirmed
       FROM bookings WHERE resource_id = $1 AND starts_at = $2`,
      [RESOURCE_ID, startsAt.toISOString()],
    );
    const confirmed = await pool.query(
      `SELECT count(*)::int AS n FROM bookings WHERE resource_id = $1 AND starts_at = $2 AND status = 'confirmed'`,
      [RESOURCE_ID, startsAt.toISOString()],
    );
    // Whatever the ordering, at most one CONFIRMED row may exist.
    expect(confirmed.rows[0].n).toBeLessThanOrEqual(1);
    expect(rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it("a cancellation frees the slot for the next person", async () => {
    const startsAt = kolkataSlot(2, 9);
    const first = ok(await bookSlot(STUDENT_A, { startsAt: startsAt.toISOString() }, ctx()));
    await cancelBooking(STUDENT_A, String(first.bookingId), ctx());
    const second = ok(await bookSlot(STUDENT_B, { startsAt: startsAt.toISOString() }, ctx()));
    expect(second.status).toBe("confirmed");
    expect(second.startsAt).toBe(startsAt.toISOString());
  });
});

describe("idempotency (handbook §10 behavior table)", () => {
  it("same key + same payload 20 times → one booking, identical stored responses", async () => {
    const startsAt = kolkataSlot(1, 10);
    const key = "key-same-payload";
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, () =>
        bookSlot(STUDENT_A, { startsAt: startsAt.toISOString() }, ctx(key)),
      ),
    );
    const bodies = outcomes.map((o) => ok(o));
    const bookingIds = new Set(bodies.map((b) => b.bookingId));
    expect(bookingIds.size).toBe(1);

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM bookings WHERE user_id = $1 AND status = 'confirmed'`,
      [STUDENT_A.userId],
    );
    expect(rows[0].n).toBe(1);
  });

  it("same key + different payload → 409 idempotency_key_reuse, original result untouched", async () => {
    const firstStartsAt = kolkataSlot(1, 15);
    const otherStartsAt = kolkataSlot(1, 16);
    const key = "key-reuse";
    await bookSlot(STUDENT_A, { startsAt: firstStartsAt.toISOString() }, ctx(key));
    const reuse = await bookSlot(STUDENT_A, { startsAt: otherStartsAt.toISOString() }, ctx(key));
    expect(reuse.kind).toBe("conflict");
    expect(conflictCode(reuse)).toBe("idempotency_key_reuse");
    // Only the original slot may have a booking row.
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM bookings WHERE user_id = $1 AND status = 'confirmed'`,
      [STUDENT_A.userId],
    );
    expect(rows[0].n).toBe(1);
  });

  it("response lost after commit → retry replays the original committed response", async () => {
    const startsAt = kolkataSlot(1, 12);
    const key = "key-lost-response";
    const first = await bookSlot(STUDENT_A, { startsAt: startsAt.toISOString() }, ctx(key));
    const retry = await bookSlot(STUDENT_A, { startsAt: startsAt.toISOString() }, ctx(key));
    expect(ok(first)).toEqual(ok(retry));
  });

  it("key not provided on a state-changing route → 400 missing_idempotency_key", async () => {
    const outcome = await bookSlot(
      STUDENT_A,
      { startsAt: kolkataSlot(1, 13).toISOString() },
      ctxMissingKey(),
    );
    expect(outcome.kind).toBe("client_error");
    expect(outcome.body.code).toBe("missing_idempotency_key");
  });
});

describe("slot rules (handbook §4 product rules v1)", () => {
  it("rejects a slot in the past", async () => {
    const past = kolkataHourToUtc(
      new Intl.DateTimeFormat("en-CA", { timeZone: KOLKATA_TZ }).format(
        new Date(Date.now() - 86_400_000),
      ),
      10,
    );
    const outcome = await bookSlot(STUDENT_A, { startsAt: past.toISOString() }, ctx());
    expect(outcome.kind).toBe("client_error");
    expect(outcome.body.code).toBe("slot_in_past");
  });

  it("rejects a slot not aligned to the hour (Kolkata)", async () => {
    const aligned = kolkataSlot(1, 11);
    const offAligned = new Date(aligned.getTime() + 15 * 60 * 1000);
    expect(isAlignedToKolkataHour(offAligned)).toBe(false);
    const outcome = await bookSlot(STUDENT_A, { startsAt: offAligned.toISOString() }, ctx());
    expect(outcome.kind).toBe("client_error");
    expect(outcome.body.code).toBe("invalid_alignment");
  });

  it("rejects a slot outside the 7-day window", async () => {
    const far = kolkataSlot(8, 10);
    const outcome = await bookSlot(STUDENT_A, { startsAt: far.toISOString() }, ctx());
    expect(outcome.kind).toBe("client_error");
    expect(outcome.body.code).toBe("outside_window");
  });
});

describe("operator blocks (handbook §8, §12)", () => {
  it("a blocked slot cannot be booked; unblocking restores it", async () => {
    const startsAt = kolkataSlot(2, 16);
    const blocked = ok(
      await blockSlot(
        OPERATOR,
        { startsAt: startsAt.toISOString(), cancelReason: "maintenance" },
        ctx(),
      ),
    );
    expect(blocked.status).toBe("blocked");

    const attempt = await bookSlot(STUDENT_A, { startsAt: startsAt.toISOString() }, ctx());
    expect(attempt.kind).toBe("conflict");
    expect(conflictCode(attempt)).toBe("slot_blocked");

    await unblockSlot(OPERATOR, String(blocked.blockId), ctx());
    const booked = ok(await bookSlot(STUDENT_A, { startsAt: startsAt.toISOString() }, ctx()));
    expect(booked.status).toBe("confirmed");
  });

  it("an existing confirmed booking blocks the operator's block", async () => {
    const startsAt = kolkataSlot(2, 17);
    await bookSlot(STUDENT_A, { startsAt: startsAt.toISOString() }, ctx());
    const block = await blockSlot(
      OPERATOR,
      { startsAt: startsAt.toISOString(), cancelReason: "event" },
      ctx(),
    );
    expect(block.kind).toBe("conflict");
    expect(conflictCode(block)).toBe("booking_exists");
  });

  it("only operators may block", async () => {
    const startsAt = kolkataSlot(2, 18);
    const outcome = await blockSlot(
      STUDENT_A,
      { startsAt: startsAt.toISOString(), cancelReason: "x" },
      ctx(),
    );
    expect(outcome.kind).toBe("forbidden");
  });
});

describe("one transaction, ten steps (handbook §9.4)", () => {
  it("audit + availability events + idempotency response commit atomically with the booking", async () => {
    const startsAt = kolkataSlot(1, 12);
    const key = "atomic";
    await bookSlot(STUDENT_A, { startsAt: startsAt.toISOString() }, ctx(key));

    const audit = await pool.query(
      `SELECT count(*)::int AS n FROM audit_events WHERE action = 'created'`,
    );
    expect(audit.rows[0].n).toBe(1);

    const events = await pool.query(
      `SELECT count(*)::int AS n FROM availability_events WHERE new_state = 'booked'`,
    );
    expect(events.rows[0].n).toBe(1);

    const idem = await pool.query(
      `SELECT status, response IS NOT NULL AS has_response FROM idempotency_records WHERE "key" = $1`,
      [key],
    );
    expect(idem.rows[0].status).toBe("committed");
    expect(idem.rows[0].has_response).toBe(true);
  });

  it("a failed step rolls back everything (no partial state)", async () => {
    const startsAt = kolkataSlot(1, 13);
    const key = "rollback";
    // Force the invariant violation: pre-insert a confirmed booking outside
    // the service (simulates a crashed second writer), then the service call
    // must fail and leave NO audit / event / idempotency 'committed' side
    // effects for the failed request.
    await pool.query(
      `INSERT INTO bookings (resource_id, user_id, starts_at, status) VALUES ($1, $2, $3, 'confirmed')`,
      [RESOURCE_ID, STUDENT_B.userId, startsAt.toISOString()],
    );
    const outcome = await bookSlot(STUDENT_A, { startsAt: startsAt.toISOString() }, ctx(key));
    expect(outcome.kind).toBe("conflict");

    const audit = await pool.query(`SELECT count(*)::int AS n FROM audit_events`);
    expect(audit.rows[0].n).toBe(0);
    const events = await pool.query(`SELECT count(*)::int AS n FROM availability_events`);
    expect(events.rows[0].n).toBe(0);
    const idem = await pool.query(`SELECT status FROM idempotency_records WHERE "key" = $1`, [key]);
    expect(idem.rows[0].status).toBe("rejected");
  });
});
