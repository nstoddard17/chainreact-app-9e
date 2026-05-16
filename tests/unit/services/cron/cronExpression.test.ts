/**
 * @jest-environment node
 *
 * Tests for services/cron/cronExpression — Native-nodes Slice 2 Commit 2.
 *
 * Validates the 5-field UTC contract:
 *   - isValidCronExpression accepts 5-field expressions cron-parser
 *     understands, rejects presets / 6-field / nonsense.
 *   - computeNextFireTime returns deterministic next-fire instants and
 *     returns null for invalid input.
 */

import {
  computeNextFireTime,
  isValidCronExpression,
} from "@/services/cron/cronExpression";

describe("isValidCronExpression — accepts", () => {
  it("every-5-minutes", () => {
    expect(isValidCronExpression("*/5 * * * *")).toBe(true);
  });

  it("weekday morning (9am UTC Mon-Fri)", () => {
    expect(isValidCronExpression("0 9 * * 1-5")).toBe(true);
  });

  it("weekday morning via three-letter dow alias (MON-FRI)", () => {
    expect(isValidCronExpression("0 9 * * MON-FRI")).toBe(true);
  });

  it("monthly first-of-month at midnight UTC", () => {
    expect(isValidCronExpression("0 0 1 * *")).toBe(true);
  });

  it("comma-list day-of-week", () => {
    expect(isValidCronExpression("30 8 * * 1,3,5")).toBe(true);
  });

  it("step ranges (every 10 minutes during business hours)", () => {
    expect(isValidCronExpression("*/10 9-17 * * 1-5")).toBe(true);
  });
});

describe("isValidCronExpression — rejects", () => {
  it("empty string", () => {
    expect(isValidCronExpression("")).toBe(false);
  });

  it("whitespace only", () => {
    expect(isValidCronExpression("    ")).toBe(false);
  });

  it("preset @daily", () => {
    expect(isValidCronExpression("@daily")).toBe(false);
  });

  it("preset @hourly", () => {
    expect(isValidCronExpression("@hourly")).toBe(false);
  });

  it("preset @weekly", () => {
    expect(isValidCronExpression("@weekly")).toBe(false);
  });

  it("preset @yearly", () => {
    expect(isValidCronExpression("@yearly")).toBe(false);
  });

  it("6-field expression (second-precision)", () => {
    expect(isValidCronExpression("0 */5 * * * *")).toBe(false);
  });

  it("4-field expression (truncated)", () => {
    expect(isValidCronExpression("*/5 * * *")).toBe(false);
  });

  it("nonsense tokens", () => {
    expect(isValidCronExpression("foo bar baz qux quux")).toBe(false);
  });

  it("out-of-range hour", () => {
    expect(isValidCronExpression("0 25 * * *")).toBe(false);
  });

  it("out-of-range day-of-month", () => {
    expect(isValidCronExpression("0 0 32 * *")).toBe(false);
  });

  it("non-string input (defense-in-depth — Zod refines on string, but the helper guards)", () => {
    expect(isValidCronExpression(null as unknown as string)).toBe(false);
    expect(isValidCronExpression(undefined as unknown as string)).toBe(false);
    expect(isValidCronExpression(42 as unknown as string)).toBe(false);
  });
});

describe("computeNextFireTime", () => {
  it("'*/5 * * * *' at 12:03:00Z → next is 12:05:00Z", () => {
    const now = new Date("2026-05-15T12:03:00Z");
    const next = computeNextFireTime("*/5 * * * *", now);
    expect(next).not.toBeNull();
    expect(next!.toISOString()).toBe("2026-05-15T12:05:00.000Z");
  });

  it("'0 9 * * 1-5' on Friday 10:00Z → next is following Monday 09:00Z (skips weekend)", () => {
    // 2026-05-15 is a Friday.
    const friday = new Date("2026-05-15T10:00:00Z");
    const next = computeNextFireTime("0 9 * * 1-5", friday);
    expect(next).not.toBeNull();
    // Next Monday is 2026-05-18.
    expect(next!.toISOString()).toBe("2026-05-18T09:00:00.000Z");
  });

  it("'0 9 * * 1-5' on Friday 08:00Z → next is the same Friday 09:00Z", () => {
    const fridayEarly = new Date("2026-05-15T08:00:00Z");
    const next = computeNextFireTime("0 9 * * 1-5", fridayEarly);
    expect(next).not.toBeNull();
    expect(next!.toISOString()).toBe("2026-05-15T09:00:00.000Z");
  });

  it("'0 0 1 * *' on May 1st 00:00:00Z exactly → returns June 1st (strictly-after semantics)", () => {
    // Strictly-after is the right behavior for scheduler advancement: after
    // a fire at T, the next fire must be strictly later than T so we don't
    // re-emit the same scheduled instant.
    const may1 = new Date("2026-05-01T00:00:00Z");
    const next = computeNextFireTime("0 0 1 * *", may1);
    expect(next).not.toBeNull();
    expect(next!.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("'0 0 1 * *' one second before May 1st 00:00:00Z → returns May 1st", () => {
    const justBefore = new Date("2026-04-30T23:59:59Z");
    const next = computeNextFireTime("0 0 1 * *", justBefore);
    expect(next).not.toBeNull();
    expect(next!.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("accepts `now` as an epoch number", () => {
    const epoch = Date.UTC(2026, 4, 15, 12, 3, 0); // May 15 2026 12:03:00 UTC
    const next = computeNextFireTime("*/5 * * * *", epoch);
    expect(next).not.toBeNull();
    expect(next!.toISOString()).toBe("2026-05-15T12:05:00.000Z");
  });

  it("returns null for an invalid expression", () => {
    expect(computeNextFireTime("not a cron", new Date())).toBeNull();
  });

  it("returns null for a preset (out-of-scope per NPD-N12)", () => {
    expect(computeNextFireTime("@hourly", new Date())).toBeNull();
  });

  it("returns null for a 6-field expression", () => {
    expect(
      computeNextFireTime("0 */5 * * * *", new Date()),
    ).toBeNull();
  });

  it("UTC interpretation is independent of host timezone", () => {
    // Run the same expression at the same UTC instant — result must be UTC.
    const utcNow = new Date("2026-07-15T03:00:00Z"); // July, irrelevant of DST.
    const next = computeNextFireTime("0 9 * * *", utcNow);
    expect(next).not.toBeNull();
    expect(next!.toISOString()).toBe("2026-07-15T09:00:00.000Z");
  });

  it("DST safety: a daily UTC fire stays at the same UTC clock instant year-round", () => {
    // Daily at 09:00 UTC. Before US DST start (March 8 2026) and after end
    // (November 1 2026), the next fire is the same wall-clock UTC instant.
    const beforeDst = new Date("2026-02-10T05:00:00Z");
    const afterDst = new Date("2026-11-15T05:00:00Z");
    const nextBefore = computeNextFireTime("0 9 * * *", beforeDst);
    const nextAfter = computeNextFireTime("0 9 * * *", afterDst);
    expect(nextBefore!.toISOString()).toBe("2026-02-10T09:00:00.000Z");
    expect(nextAfter!.toISOString()).toBe("2026-11-15T09:00:00.000Z");
    // The UTC clock face is identical regardless of host DST state.
  });
});
