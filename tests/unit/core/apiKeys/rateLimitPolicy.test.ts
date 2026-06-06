/**
 * @jest-environment node
 *
 * Tests for core/apiKeys/rateLimitPolicy (Slice 4.API-KEYS-RATE-LIMIT-1) — the pure
 * limit constants, window alignment, bucket-key derivation, and allow/deny math.
 * No DB. Bucket keys must derive from ids only (never a raw key).
 */

import {
  API_KEY_RATE_LIMITS,
  API_KEY_RATE_LIMIT_WINDOW_SECONDS,
  alignWindowStartMs,
  buildRateLimitBucketKeys,
  evaluateRateLimit,
} from "@/core/apiKeys/rateLimitPolicy";

describe("limits", () => {
  it("ships the launch constants (key 60 / workflow 30 / account 300, per minute)", () => {
    expect(API_KEY_RATE_LIMITS).toEqual({ perKey: 60, perWorkflow: 30, perAccount: 300 });
    expect(API_KEY_RATE_LIMIT_WINDOW_SECONDS).toBe(60);
  });
});

describe("alignWindowStartMs", () => {
  it("floors to the window boundary", () => {
    // 90_000ms = 1.5 windows → floors to 60_000.
    expect(alignWindowStartMs(90_000)).toBe(60_000);
    expect(alignWindowStartMs(60_000)).toBe(60_000);
    expect(alignWindowStartMs(119_999)).toBe(60_000);
    expect(alignWindowStartMs(120_000)).toBe(120_000);
  });
});

describe("buildRateLimitBucketKeys", () => {
  it("derives per-key / per-workflow / per-account buckets from ids only", () => {
    const b = buildRateLimitBucketKeys({
      keyId: "key-1",
      accountId: "acct-1",
      workflowId: "wf-1",
      windowStartMs: 60_000,
    });
    expect(b.key).toBe("key:key-1:60000");
    expect(b.workflow).toBe("wf:acct-1:wf-1:60000");
    expect(b.account).toBe("acct:acct-1:60000");
  });

  it("never embeds raw key material", () => {
    const b = buildRateLimitBucketKeys({
      keyId: "key-1",
      accountId: "acct-1",
      workflowId: "wf-1",
      windowStartMs: 0,
    });
    expect(JSON.stringify(b)).not.toMatch(/crk_/);
  });
});

describe("evaluateRateLimit", () => {
  const base = { nowMs: 30_000, windowStartMs: 0 }; // window [0, 60_000)

  it("allows when every dimension is at or under its limit", () => {
    expect(
      evaluateRateLimit({ ...base, counts: { key: 60, workflow: 30, account: 300 } }),
    ).toEqual({ allowed: true });
  });

  it("denies when the per-key limit is exceeded (positive retryAfter)", () => {
    const d = evaluateRateLimit({ ...base, counts: { key: 61, workflow: 1, account: 1 } });
    expect(d.allowed).toBe(false);
    expect(d.retryAfterSeconds).toBeGreaterThan(0);
    // window ends at 60_000, now 30_000 → 30s.
    expect(d.retryAfterSeconds).toBe(30);
  });

  it("denies when the per-workflow limit is exceeded", () => {
    expect(
      evaluateRateLimit({ ...base, counts: { key: 1, workflow: 31, account: 1 } }).allowed,
    ).toBe(false);
  });

  it("denies when the per-account limit is exceeded", () => {
    expect(
      evaluateRateLimit({ ...base, counts: { key: 1, workflow: 1, account: 301 } }).allowed,
    ).toBe(false);
  });

  it("retryAfter is at least 1 second even at the very end of the window", () => {
    const d = evaluateRateLimit({
      counts: { key: 61, workflow: 0, account: 0 },
      nowMs: 59_999,
      windowStartMs: 0,
    });
    expect(d.retryAfterSeconds).toBe(1);
  });
});
