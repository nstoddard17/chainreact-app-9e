/** @jest-environment node */
import {
  buildMobileRateLimitBucketKeys,
  buildMobilePublicBucketKeys,
  normalizeMobileDeviceId,
  evaluateMobileRateLimit,
  evaluateMobilePublicRateLimit,
  MOBILE_RATE_LIMITS,
} from "@/core/mobile/rateLimitPolicy";

const W = 1_754_000_000_000;

describe("core/mobile/rateLimitPolicy", () => {
  it("user bucket is authoritative; missing device id yields a DISTINCT ignored shadow bucket (no same-key double bump)", () => {
    const keys = buildMobileRateLimitBucketKeys({
      userId: "user-1",
      deviceId: null,
      windowStartMs: W,
    });
    expect(keys.user).toContain("mobilev1:user:user-1");
    expect(keys.device).not.toBe(keys.user);
    expect(keys.deviceBucketDistinct).toBe(false);
  });

  it("a raw device id never becomes a durable key (hashed with the user id)", () => {
    const keys = buildMobileRateLimitBucketKeys({
      userId: "user-1",
      deviceId: "my-visible-device-identifier",
      windowStartMs: W,
    });
    expect(keys.device).not.toContain("my-visible-device-identifier");
    expect(keys.device).toMatch(/^mobilev1:dev:[0-9a-f]{64}:/);
    expect(keys.deviceBucketDistinct).toBe(true);
  });

  it("device rotation cannot bypass the user bucket (user key is device-independent)", () => {
    const a = buildMobileRateLimitBucketKeys({ userId: "u", deviceId: "device-aaa", windowStartMs: W });
    const b = buildMobileRateLimitBucketKeys({ userId: "u", deviceId: "device-bbb", windowStartMs: W });
    expect(a.user).toBe(b.user);
    expect(a.device).not.toBe(b.device);
  });

  it("shadow device count is IGNORED when not distinct; user overage still denies", () => {
    const allowed = evaluateMobileRateLimit({
      counts: { user: 1, device: 99_999 },
      deviceBucketDistinct: false,
      nowMs: W + 1000,
      windowStartMs: W,
    });
    expect(allowed.allowed).toBe(true);

    const denied = evaluateMobileRateLimit({
      counts: { user: MOBILE_RATE_LIMITS.perUser + 1, device: 1 },
      deviceBucketDistinct: false,
      nowMs: W + 1000,
      windowStartMs: W,
    });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("a distinct device bucket denies on device overage", () => {
    const denied = evaluateMobileRateLimit({
      counts: { user: 1, device: MOBILE_RATE_LIMITS.perDevice + 1 },
      deviceBucketDistinct: true,
      nowMs: W + 30_000,
      windowStartMs: W,
    });
    expect(denied.allowed).toBe(false);
  });

  it("device-id normalization treats anything malformed as ABSENT (never an error, never a bypass)", () => {
    expect(normalizeMobileDeviceId(null)).toBeNull();
    expect(normalizeMobileDeviceId("short")).toBeNull();
    expect(normalizeMobileDeviceId("x".repeat(65))).toBeNull();
    expect(normalizeMobileDeviceId("has spaces here!")).toBeNull();
    expect(normalizeMobileDeviceId("valid-device-id_01")).toBe("valid-device-id_01");
  });

  it("public buckets: hashed IP (raw IP never a key) + distinct shadow", () => {
    const keys = buildMobilePublicBucketKeys({ ip: "203.0.113.7", windowStartMs: W });
    expect(keys.ip).not.toContain("203.0.113.7");
    expect(keys.ip).toMatch(/^mobilev1:ip:[0-9a-f]{64}:/);
    expect(keys.shadow).not.toBe(keys.ip);
    expect(
      evaluateMobilePublicRateLimit({
        count: MOBILE_RATE_LIMITS.publicPerIp + 1,
        nowMs: W + 1000,
        windowStartMs: W,
      }).allowed,
    ).toBe(false);
  });
});
