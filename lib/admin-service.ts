import "server-only";
import { withTransaction } from "./db";
import { listAuditEvents, listMyBookings } from "./bookings";

/**
 * Operator console data access. The operator may read all bookings, all
 * blocks, and the audit trail (handbook §12 roles table).
 */

export interface BlockRow {
  id: string;
  starts_at: string;
  reason: string | null;
}

export async function listBlocks(): Promise<BlockRow[]> {
  return withTransaction(async (tx) => {
    const { rows } = await tx.query<BlockRow>(
      `SELECT id, starts_at, reason FROM slot_blocks ORDER BY starts_at`,
    );
    return rows;
  });
}

export { listAuditEvents, listMyBookings };
