/**
 * @jest-environment node
 *
 * Tests for features/runs/runStatusCopy.ts (RUN-VISIBILITY-1).
 *
 * Business rule: non-terminal runs surface a clear pending/running line so a
 * user who just ran a workflow isn't left wondering whether anything happened; a
 * run stuck `queued` past the threshold gets a gentle "taking longer" note.
 * Terminal runs add no line (the badge + error block already explain them).
 */

import {
  isStaleQueued,
  runStatusHelperCopy,
  STALE_QUEUED_THRESHOLD_MS,
} from "@/features/runs/runStatusCopy";

const NOW = Date.parse("2026-06-29T12:00:00Z");

describe("runStatusHelperCopy", () => {
  it("shows 'Waiting to start…' for a freshly queued run", () => {
    const startedAt = new Date(NOW - 5_000).toISOString(); // 5s ago
    expect(runStatusHelperCopy("queued", startedAt, NOW)).toBe(
      "Waiting to start…",
    );
  });

  it("shows the stale note for a run queued past the threshold", () => {
    const startedAt = new Date(NOW - STALE_QUEUED_THRESHOLD_MS - 1_000).toISOString();
    expect(runStatusHelperCopy("queued", startedAt, NOW)).toMatch(
      /taking longer than usual/i,
    );
  });

  it("shows 'Workflow is running…' for a running run", () => {
    expect(
      runStatusHelperCopy("running", new Date(NOW).toISOString(), NOW),
    ).toBe("Workflow is running…");
  });

  it("returns null for terminal runs (badge + error block already explain them)", () => {
    const t = new Date(NOW).toISOString();
    expect(runStatusHelperCopy("succeeded", t, NOW)).toBeNull();
    expect(runStatusHelperCopy("failed", t, NOW)).toBeNull();
  });

  it("is robust to an unparseable startedAt (never throws; treats as not-stale)", () => {
    expect(runStatusHelperCopy("queued", "not-a-date", NOW)).toBe(
      "Waiting to start…",
    );
  });
});

describe("isStaleQueued", () => {
  it("is true only for a queued run older than the threshold", () => {
    const fresh = new Date(NOW - 1_000).toISOString();
    const stale = new Date(NOW - STALE_QUEUED_THRESHOLD_MS - 1_000).toISOString();
    expect(isStaleQueued("queued", fresh, NOW)).toBe(false);
    expect(isStaleQueued("queued", stale, NOW)).toBe(true);
  });

  it("is never stale for running/terminal statuses, even if old", () => {
    const old = new Date(NOW - STALE_QUEUED_THRESHOLD_MS * 10).toISOString();
    expect(isStaleQueued("running", old, NOW)).toBe(false);
    expect(isStaleQueued("succeeded", old, NOW)).toBe(false);
    expect(isStaleQueued("failed", old, NOW)).toBe(false);
  });
});
