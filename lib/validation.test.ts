import { describe, expect, it } from "vitest";
import { healthEnvironmentSchema, healthResponseSchema, requestIdPattern } from "./validation";

describe("healthEnvironmentSchema", () => {
  it("accepts a configured pair", () => {
    const parsed = healthEnvironmentSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key-abc123",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects missing values (fail-closed precondition)", () => {
    expect(healthEnvironmentSchema.safeParse({}).success).toBe(false);
    expect(
      healthEnvironmentSchema.safeParse({
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "",
      }).success,
    ).toBe(false);
  });
});

describe("healthResponseSchema", () => {
  it("round-trips the sanitized success shape and strips extras", () => {
    const parsed = healthResponseSchema.safeParse({
      status: "ok",
      version: "abc",
      checkedAt: "2026-07-13T10:00:00.000Z",
      checks: { database: { status: "ok", latencyMs: 12 } },
      connectionString: "postgres://secret", // must never appear
    });
    expect(parsed.success).toBe(true);
    expect((parsed.data as Record<string, unknown>).connectionString).toBeUndefined();
  });
});

describe("requestIdPattern", () => {
  it("accepts allowed request ids", () => {
    expect(requestIdPattern.test("req_a1b2c3")).toBe(true);
    expect(requestIdPattern.test("a".repeat(64))).toBe(true);
  });

  it("rejects unsafe or oversized ids", () => {
    expect(requestIdPattern.test("contains spaces")).toBe(false);
    expect(requestIdPattern.test("a".repeat(65))).toBe(false);
    expect(requestIdPattern.test("bad;input")).toBe(false);
  });
});
