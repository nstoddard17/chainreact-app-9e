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

describe("anonAiLimit — unsigned fallback when no key", () => {
  it("still reads the count when no signing key is configured (documented weakness)", () => {
    delete process.env.OAUTH_STATE_SIGNING_KEY;
    delete process.env.ANON_AI_LIMIT_SIGNING_KEY;
    const value = serializeAnonAiCookieValue(2, NOW); // unsigned: "2.<day>"
    expect(value.split(".")).toHaveLength(2);
    expect(readAnonAiCount(`${ANON_AI_COOKIE_NAME}=${value}`, NOW)).toBe(2);
  });
});
