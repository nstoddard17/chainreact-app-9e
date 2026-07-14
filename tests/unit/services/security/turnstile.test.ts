/**
 * @jest-environment node
 *
 * Tests for services/security/turnstile (SEC-3) — app-side Turnstile verification.
 * Proves the fail-closed-when-configured / skip-when-unconfigured posture, that a
 * missing token is rejected only when enforced, and that the token is never logged.
 */

import {
  isTurnstileEnabled,
  isTurnstileWidgetConfigured,
  verifyTurnstileToken,
} from "@/services/security/turnstile";

const ORIGINAL_ENV = { ...process.env };
const realFetch = global.fetch;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe("configuration flags", () => {
  it("isTurnstileEnabled reflects the secret", () => {
    expect(isTurnstileEnabled()).toBe(false);
    process.env.TURNSTILE_SECRET_KEY = "sek";
    expect(isTurnstileEnabled()).toBe(true);
  });

  it("isTurnstileWidgetConfigured reflects the public site key", () => {
    expect(isTurnstileWidgetConfigured()).toBe(false);
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "sitek";
    expect(isTurnstileWidgetConfigured()).toBe(true);
  });
});

describe("verifyTurnstileToken — not configured (skip)", () => {
  it("returns ok/not-enforced and never calls siteverify when the secret is unset", async () => {
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    const result = await verifyTurnstileToken(null);
    expect(result).toEqual({ ok: true, enforced: false });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("verifyTurnstileToken — configured (fail-closed)", () => {
  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
  });

  it("rejects a missing token WITHOUT calling siteverify", async () => {
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect(await verifyTurnstileToken(null)).toEqual({ ok: false });
    expect(await verifyTurnstileToken("")).toEqual({ ok: false });
    expect(spy).not.toHaveBeenCalled();
  });

  it("calls siteverify with the secret + token and returns ok on success", async () => {
    const spy = jest.fn(async () => ({
      ok: true,
      json: async () => ({ success: true }),
    }));
    global.fetch = spy as unknown as typeof fetch;
    const result = await verifyTurnstileToken("tok-123", "1.2.3.4");
    expect(result).toEqual({ ok: true, enforced: true });
    const call = spy.mock.calls[0] as unknown as [string, { body: URLSearchParams }];
    const body = call[1].body.toString();
    expect(body).toContain("secret=test-secret");
    expect(body).toContain("response=tok-123");
    expect(body).toContain("remoteip=1.2.3.4");
  });

  it("fails closed when siteverify reports success:false, without logging the token", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = (async () => ({
      ok: true,
      json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
    })) as unknown as typeof fetch;
    expect(await verifyTurnstileToken("secret-token-value")).toEqual({ ok: false });
    const logged = warn.mock.calls.map((c) => String(c[0])).join(" ");
    expect(logged).not.toContain("secret-token-value");
  });

  it("fails closed on a network exception", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await verifyTurnstileToken("tok")).toEqual({ ok: false });
  });

  it("fails closed on a non-200 siteverify response", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await verifyTurnstileToken("tok")).toEqual({ ok: false });
  });
});
