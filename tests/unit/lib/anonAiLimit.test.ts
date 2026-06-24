/**
 * @jest-environment node
 *
 * REACT-LIVE-SKELETON-3 — best-effort anonymous AI-planning limit (signed cookie + IP soft cap).
 */
const ORIGINAL_ENV = { ...process.env };

import {
  ANON_AI_COOKIE_NAME,
  ANON_AI_LIMIT,
  __resetIpSoftCapForTests,
  anonAiCookieOptions,
  ipSoftCapReached,
  isAnonAiLimitSigned,
  isAnonAiPlanningAvailable,
  readAnonAiCount,
  recordIpHit,
  serializeAnonAiCookieValue,
} from "@/lib/anonAiLimit";

const NOW = 1_900_000_000_000; // fixed "now" (ms)

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, OAUTH_STATE_SIGNING_KEY: Buffer.from("0123456789abcdef0123456789abcdef").toString("base64") };
  __resetIpSoftCapForTests();
});
afterAll(() => {
  process.env = ORIGINAL_ENV;
});

function cookieHeaderFor(count: number, now: number): string {
  return `${ANON_AI_COOKIE_NAME}=${serializeAnonAiCookieValue(count, now)}`;
}

describe("anonAiLimit — signed cookie counter", () => {
  it("round-trips a signed count for today", () => {
    expect(readAnonAiCount(cookieHeaderFor(2, NOW), NOW)).toBe(2);
  });

  it("absent cookie reads as 0", () => {
    expect(readAnonAiCount(null, NOW)).toBe(0);
    expect(readAnonAiCount("other=1", NOW)).toBe(0);
  });

  it("a tampered count (bad signature) reads as 0 — never an inflated allowance", () => {
    const good = serializeAnonAiCookieValue(1, NOW); // "1.<day>.<sig>"
    const parts = good.split(".");
    const forged = `${ANON_AI_COOKIE_NAME}=99.${parts[1]}.${parts[2]}`; // count bumped, sig now invalid
    expect(readAnonAiCount(forged, NOW)).toBe(0);
  });

  it("a stale day bucket reads as 0 (fresh allowance next day)", () => {
    const yesterday = NOW - 86_400_000;
    expect(readAnonAiCount(cookieHeaderFor(3, yesterday), NOW)).toBe(0);
  });

  it("cookie options are HttpOnly + lax + path=/ (Secure only in prod)", () => {
    expect(anonAiCookieOptions(true)).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    expect(anonAiCookieOptions(false).secure).toBe(false);
  });

  it("ANON_AI_LIMIT is a small cap", () => {
    expect(ANON_AI_LIMIT).toBeLessThanOrEqual(5);
    expect(ANON_AI_LIMIT).toBeGreaterThan(0);
  });
});

describe("anonAiLimit — IP soft cap (per-instance backstop)", () => {
  it("trips only after the per-instance daily cap is exceeded", () => {
    const ip = "203.0.113.7";
    expect(ipSoftCapReached(ip, NOW)).toBe(false);
    for (let i = 0; i < 30; i++) recordIpHit(ip, NOW);
    expect(ipSoftCapReached(ip, NOW)).toBe(true);
  });

  it("resets on a new day bucket", () => {
    const ip = "203.0.113.8";
    for (let i = 0; i < 30; i++) recordIpHit(ip, NOW);
    expect(ipSoftCapReached(ip, NOW)).toBe(true);
    expect(ipSoftCapReached(ip, NOW + 86_400_000)).toBe(false);
  });
});

describe("anonAiLimit — unsigned fallback when no key (dev/test only)", () => {
  it("still reads the count when no signing key is configured, in non-production (documented weakness)", () => {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "test" }; // explicitly NON-production, no signing key
    delete process.env.OAUTH_STATE_SIGNING_KEY;
    delete process.env.ANON_AI_LIMIT_SIGNING_KEY;
    expect(isAnonAiLimitSigned()).toBe(false);
    expect(isAnonAiPlanningAvailable()).toBe(true); // dev/test is allowed to run unsigned
    const value = serializeAnonAiCookieValue(2, NOW); // unsigned: "2.<day>"
    expect(value.split(".")).toHaveLength(2);
    expect(readAnonAiCount(`${ANON_AI_COOKIE_NAME}=${value}`, NOW)).toBe(2);
  });
});

describe("anonAiLimit — production signing requirement", () => {
  it("production with NO signing key: planning unavailable + serialize refuses (no unsigned cookie)", () => {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "production" };
    delete process.env.OAUTH_STATE_SIGNING_KEY;
    delete process.env.ANON_AI_LIMIT_SIGNING_KEY;
    expect(isAnonAiLimitSigned()).toBe(false);
    expect(isAnonAiPlanningAvailable()).toBe(false); // fail closed in prod
    // Defense in depth: even if a caller reached serialize, it must not emit an unsigned cookie in prod.
    expect(() => serializeAnonAiCookieValue(1, NOW)).toThrow(/unsigned/i);
  });

  it("production WITH ANON_AI_LIMIT_SIGNING_KEY: available + signs/verifies normally", () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "production",
      ANON_AI_LIMIT_SIGNING_KEY: Buffer.from("fedcba9876543210fedcba9876543210").toString("base64"),
    };
    delete process.env.OAUTH_STATE_SIGNING_KEY;
    expect(isAnonAiLimitSigned()).toBe(true);
    expect(isAnonAiPlanningAvailable()).toBe(true);
    const value = serializeAnonAiCookieValue(2, NOW); // signed: "2.<day>.<sig>"
    expect(value.split(".")).toHaveLength(3);
    expect(readAnonAiCount(`${ANON_AI_COOKIE_NAME}=${value}`, NOW)).toBe(2);
  });

  it("prefers ANON_AI_LIMIT_SIGNING_KEY over OAUTH_STATE_SIGNING_KEY (different keys → cross-verify fails)", () => {
    // A cookie signed under ANON_AI_LIMIT_SIGNING_KEY must NOT verify once only OAUTH_STATE_SIGNING_KEY
    // is present — proving the primary key is the one actually used when set.
    process.env = {
      ...ORIGINAL_ENV,
      ANON_AI_LIMIT_SIGNING_KEY: Buffer.from("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").toString("base64"),
      OAUTH_STATE_SIGNING_KEY: Buffer.from("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb").toString("base64"),
    };
    const signedUnderPrimary = serializeAnonAiCookieValue(2, NOW);
    expect(readAnonAiCount(`${ANON_AI_COOKIE_NAME}=${signedUnderPrimary}`, NOW)).toBe(2);
    delete process.env.ANON_AI_LIMIT_SIGNING_KEY; // now only the fallback key remains
    expect(readAnonAiCount(`${ANON_AI_COOKIE_NAME}=${signedUnderPrimary}`, NOW)).toBe(0); // bad sig → fresh
  });

  it("OAUTH_STATE_SIGNING_KEY fallback signs/verifies when the primary key is absent", () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "production",
      OAUTH_STATE_SIGNING_KEY: Buffer.from("0123456789abcdef0123456789abcdef").toString("base64"),
    };
    delete process.env.ANON_AI_LIMIT_SIGNING_KEY;
    expect(isAnonAiLimitSigned()).toBe(true);
    expect(isAnonAiPlanningAvailable()).toBe(true);
    const value = serializeAnonAiCookieValue(1, NOW);
    expect(value.split(".")).toHaveLength(3);
    expect(readAnonAiCount(`${ANON_AI_COOKIE_NAME}=${value}`, NOW)).toBe(1);
  });
});
