import "server-only";
import { randomUUID } from "node:crypto";
import { requestIdPattern } from "./validation";

/**
 * Resolve the request correlation id:
 * - accept a caller-supplied x-request-id that matches ^[a-zA-Z0-9._-]{1,64}$
 * - otherwise generate a random UUID.
 */
export function resolveRequestId(incoming: string | null | undefined): string {
  if (incoming && requestIdPattern.test(incoming)) {
    return incoming;
  }
  return randomUUID();
}
