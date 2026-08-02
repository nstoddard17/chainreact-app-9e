/** @jest-environment node */
import { rateLimitMobileUser, rateLimitMobilePublic } from "@/services/mobile/rateLimit";
import { incrementMcpRateLimitWindowsServiceRole } from "@/repositories/mcpRateLimits";
import { MOBILE_RATE_LIMITS } from "@/core/mobile/rateLimitPolicy";

jest.mock("@/repositories/mcpRateLimits", () => ({
  incrementMcpRateLimitWindowsServiceRole: jest.fn(),
}));

const increment = incrementMcpRateLimitWindowsServiceRole as jest.Mock;

describe("services/mobile/rateLimit — durable limiter orchestration", () => {
  beforeEach(() => jest.clearAllMocks());

  it("allows under-limit and passes DISTINCT mobilev1 buckets to storage", async () => {
    increment.mockResolvedValue({ token: 1, account: 1 });
    const decision = await rateLimitMobileUser({ userId: "u-1", deviceId: null });
    expect(decision.allowed).toBe(true);
    const input = increment.mock.calls[0][0];
    expect(input.tokenBucket).toMatch(/^mobilev1:user:u-1:/);
    expect(input.accountBucket).toMatch(/^mobilev1:devshadow:u-1:/);
    expect(input.tokenBucket).not.toBe(input.accountBucket);
  });

  it("denies with Retry-After when the user window is exceeded", async () => {
    increment.mockResolvedValue({
      token: MOBILE_RATE_LIMITS.perUser + 1,
      account: 1,
    });
    const decision = await rateLimitMobileUser({ userId: "u-1", deviceId: null });
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("OUTAGE POLICY: storage failure fails OPEN for the read-only namespace (and logs safely)", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    increment.mockRejectedValue(new Error("connection refused at 10.0.0.5:5432 password=hunter2"));
    const decision = await rateLimitMobileUser({ userId: "u-1", deviceId: "device-abcdef" });
    expect(decision.allowed).toBe(true);
    // The log line is a fixed string — the storage error (which may embed
    // connection details) is deliberately NOT forwarded.
    expect(JSON.stringify(spy.mock.calls)).not.toContain("hunter2");
    spy.mockRestore();
  });

  it("public limiter keys by hashed IP and denies past the public budget", async () => {
    increment.mockResolvedValue({ token: MOBILE_RATE_LIMITS.publicPerIp + 1, account: 1 });
    const decision = await rateLimitMobilePublic({ ip: "203.0.113.7" });
    expect(decision.allowed).toBe(false);
    expect(JSON.stringify(increment.mock.calls)).not.toContain("203.0.113.7");
  });
});
