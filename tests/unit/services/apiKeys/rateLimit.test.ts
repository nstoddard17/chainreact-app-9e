/**
 * @jest-environment node
 *
 * Tests for services/apiKeys/rateLimit (Slice 4.API-KEYS-RATE-LIMIT-1) — the
 * durable limiter orchestration. Mocks the counter repository and pins Date.now so
 * window alignment + the allow/deny decision are deterministic. No DB.
 *
 * Replaces the FK-4 permissive-seam test (the placeholder is gone).
 */

const mockIncrement = jest.fn();
jest.mock("@/repositories/apiKeyRateLimits", () => ({
  incrementApiKeyRateLimitWindowsServiceRole: (...a: unknown[]) => mockIncrement(...a),
}));

import { rateLimitApiKeyTrigger } from "@/services/apiKeys/rateLimit";

const INPUT = { keyId: "k1", accountId: "a1", workflowId: "wf1" };

let nowSpy: jest.SpyInstance;
beforeEach(() => {
  mockIncrement.mockReset();
  // Pin "now" mid-window: window [60_000, 120_000), ends at 120_000.
  nowSpy = jest.spyOn(Date, "now").mockReturnValue(90_000);
});
afterEach(() => nowSpy.mockRestore());

describe("rateLimitApiKeyTrigger — allow", () => {
  it("allows when all counts are under their limits", async () => {
    mockIncrement.mockResolvedValue({ key: 1, workflow: 1, account: 1 });
    expect(await rateLimitApiKeyTrigger(INPUT)).toEqual({ allowed: true });
  });

  it("passes id-derived bucket keys (no raw key) + the aligned window to the repo", async () => {
    mockIncrement.mockResolvedValue({ key: 1, workflow: 1, account: 1 });
    await rateLimitApiKeyTrigger(INPUT);
    const arg = mockIncrement.mock.calls[0]![0];
    expect(arg.keyBucket).toBe("key:k1:60000");
    expect(arg.workflowBucket).toBe("wf:a1:wf1:60000");
    expect(arg.accountBucket).toBe("acct:a1:60000");
    expect(arg.windowStart).toBe(new Date(60_000).toISOString());
    expect(arg.expiresAt).toBe(new Date(120_000).toISOString());
    expect(JSON.stringify(arg)).not.toMatch(/crk_/);
  });
});

describe("rateLimitApiKeyTrigger — deny", () => {
  it("denies over the per-key limit (60) with a positive retryAfter", async () => {
    mockIncrement.mockResolvedValue({ key: 61, workflow: 1, account: 1 });
    const r = await rateLimitApiKeyTrigger(INPUT);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
    // window ends 120_000, now 90_000 → 30s.
    expect(r.retryAfterSeconds).toBe(30);
  });

  it("denies over the per-workflow limit (30)", async () => {
    mockIncrement.mockResolvedValue({ key: 1, workflow: 31, account: 1 });
    expect((await rateLimitApiKeyTrigger(INPUT)).allowed).toBe(false);
  });

  it("denies over the per-account limit (300)", async () => {
    mockIncrement.mockResolvedValue({ key: 1, workflow: 1, account: 301 });
    expect((await rateLimitApiKeyTrigger(INPUT)).allowed).toBe(false);
  });
});

describe("rateLimitApiKeyTrigger — window reset", () => {
  it("uses a fresh window (new bucket keys) after time advances past the window", async () => {
    mockIncrement.mockResolvedValue({ key: 1, workflow: 1, account: 1 });

    nowSpy.mockReturnValue(90_000); // window [60_000,120_000)
    await rateLimitApiKeyTrigger(INPUT);
    const first = mockIncrement.mock.calls[0]![0];

    nowSpy.mockReturnValue(130_000); // window [120_000,180_000)
    await rateLimitApiKeyTrigger(INPUT);
    const second = mockIncrement.mock.calls[1]![0];

    expect(first.keyBucket).toBe("key:k1:60000");
    expect(second.keyBucket).toBe("key:k1:120000");
    expect(first.keyBucket).not.toBe(second.keyBucket);
    // Both allowed because each new window starts a fresh count.
  });
});
