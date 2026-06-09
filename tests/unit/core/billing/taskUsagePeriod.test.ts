/**
 * Tests for core/billing/taskUsagePeriod.ts — the pure current-period usage
 * view that mirrors the SQL lazy-rollover anchor (20260620000000).
 */
import { computeTaskUsageView } from "@/core/billing/taskUsagePeriod";

const at = (iso: string) => new Date(iso);

describe("computeTaskUsageView — within the current period", () => {
  it("passes used/limit through and computes remaining + reset date", () => {
    const v = computeTaskUsageView({
      tasksUsed: 12,
      tasksLimit: 100,
      periodStartedAt: "2026-06-01T00:00:00Z",
      now: at("2026-06-09T10:00:00Z"),
    });
    expect(v.tasksUsed).toBe(12);
    expect(v.tasksLimit).toBe(100);
    expect(v.tasksRemaining).toBe(88);
    expect(v.periodStart).toBe("2026-06-01T00:00:00.000Z");
    expect(v.resetsAt).toBe("2026-07-01T00:00:00.000Z");
    expect(v.rolledOver).toBe(false);
    expect(v.exhausted).toBe(false);
  });

  it("marks exhausted when used === limit", () => {
    const v = computeTaskUsageView({
      tasksUsed: 100,
      tasksLimit: 100,
      periodStartedAt: "2026-06-01T00:00:00Z",
      now: at("2026-06-09T00:00:00Z"),
    });
    expect(v.tasksRemaining).toBe(0);
    expect(v.exhausted).toBe(true);
  });

  it("clamps remaining at 0 when stored used exceeds limit (never negative)", () => {
    const v = computeTaskUsageView({
      tasksUsed: 105,
      tasksLimit: 100,
      periodStartedAt: "2026-06-01T00:00:00Z",
      now: at("2026-06-09T00:00:00Z"),
    });
    expect(v.tasksRemaining).toBe(0);
    expect(v.exhausted).toBe(true);
  });
});

describe("computeTaskUsageView — lazy rollover (stored period elapsed, not yet reset)", () => {
  it("shows effective 0 used + advances the period when ≥1 month has elapsed (#7 no display mismatch)", () => {
    // anchor 2 months ago; the deduct RPC hasn't reset yet, so the row still
    // says 95 used. The UI must show the CURRENT period: 0 used, full remaining.
    const v = computeTaskUsageView({
      tasksUsed: 95,
      tasksLimit: 100,
      periodStartedAt: "2026-04-01T00:00:00Z",
      now: at("2026-06-09T00:00:00Z"),
    });
    expect(v.rolledOver).toBe(true);
    expect(v.tasksUsed).toBe(0);
    expect(v.tasksRemaining).toBe(100);
    expect(v.periodStart).toBe("2026-06-01T00:00:00.000Z");
    expect(v.resetsAt).toBe("2026-07-01T00:00:00.000Z");
    expect(v.exhausted).toBe(false);
  });

  it("treats the exact reset instant as the start of the new period", () => {
    const v = computeTaskUsageView({
      tasksUsed: 40,
      tasksLimit: 100,
      periodStartedAt: "2026-06-01T00:00:00Z",
      now: at("2026-07-01T00:00:00Z"),
    });
    expect(v.rolledOver).toBe(true);
    expect(v.tasksUsed).toBe(0);
    expect(v.periodStart).toBe("2026-07-01T00:00:00.000Z");
    expect(v.resetsAt).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("computeTaskUsageView — month-end anchor clamping (mirrors make_interval)", () => {
  it("within period: Jan-31 anchor, mid-Feb now → resets Feb-28, no rollover", () => {
    const v = computeTaskUsageView({
      tasksUsed: 5,
      tasksLimit: 100,
      periodStartedAt: "2026-01-31T00:00:00Z",
      now: at("2026-02-15T00:00:00Z"),
    });
    expect(v.rolledOver).toBe(false);
    expect(v.tasksUsed).toBe(5);
    expect(v.periodStart).toBe("2026-01-31T00:00:00.000Z");
    expect(v.resetsAt).toBe("2026-02-28T00:00:00.000Z"); // clamped (2026 not leap)
  });

  it("elapsed: Jan-31 anchor, Mar-01 now → current period Feb-28→Mar-31, reset used", () => {
    const v = computeTaskUsageView({
      tasksUsed: 80,
      tasksLimit: 100,
      periodStartedAt: "2026-01-31T00:00:00Z",
      now: at("2026-03-01T00:00:00Z"),
    });
    expect(v.rolledOver).toBe(true);
    expect(v.tasksUsed).toBe(0);
    expect(v.periodStart).toBe("2026-02-28T00:00:00.000Z");
    expect(v.resetsAt).toBe("2026-03-31T00:00:00.000Z");
  });
});

describe("computeTaskUsageView — degenerate inputs", () => {
  it("null periodStartedAt → no period dates, used passthrough, remaining computed", () => {
    const v = computeTaskUsageView({
      tasksUsed: 7,
      tasksLimit: 100,
      periodStartedAt: null,
      now: at("2026-06-09T00:00:00Z"),
    });
    expect(v.periodStart).toBeNull();
    expect(v.resetsAt).toBeNull();
    expect(v.rolledOver).toBe(false);
    expect(v.tasksUsed).toBe(7);
    expect(v.tasksRemaining).toBe(93);
  });

  it("unparseable periodStartedAt degrades to a no-period view (no throw)", () => {
    const v = computeTaskUsageView({
      tasksUsed: 3,
      tasksLimit: 100,
      periodStartedAt: "not-a-date",
      now: at("2026-06-09T00:00:00Z"),
    });
    expect(v.periodStart).toBeNull();
    expect(v.resetsAt).toBeNull();
    expect(v.tasksRemaining).toBe(97);
  });

  it("future anchor (clock skew) → stays in period 0, no rollover", () => {
    const v = computeTaskUsageView({
      tasksUsed: 4,
      tasksLimit: 100,
      periodStartedAt: "2026-12-01T00:00:00Z",
      now: at("2026-06-09T00:00:00Z"),
    });
    expect(v.rolledOver).toBe(false);
    expect(v.tasksUsed).toBe(4);
    expect(v.periodStart).toBe("2026-12-01T00:00:00.000Z");
    expect(v.resetsAt).toBe("2027-01-01T00:00:00.000Z");
  });
});
