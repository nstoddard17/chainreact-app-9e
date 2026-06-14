/**
 * @jest-environment node
 *
 * V2-READY-21 — no-leak boundary for the OAuth flow routes.
 *
 * Covers the shared `redactedOAuthErrorCode` helper directly (hostile-message
 * matrix) AND the callback route wired to it (the worst channel — the raw
 * message used to land in a `/apps?integration_error=` URL param). The connect
 * and ingest routes are covered by their own route test files.
 */

// Hostile message packing every identifier class from the no-leak rules into a
// single string: Supabase/Postgres constraint+table, V2 account id, provider
// account (email), access token, OAuth scope, and stack-ish text.
const HOSTILE =
  'duplicate key value violates unique constraint "integrations_account_provider_key" ' +
  "account=acct-9f2c1b00-dead-beef provider-account=alice@example.com " +
  "token=ya29.A0AReDACTEDsecret scope=https://www.googleapis.com/auth/gmail.readonly " +
  "at Object.<anonymous> (/srv/app/services/oauth/dispatcher.ts:427:11)";

const HOSTILE_FRAGMENTS = [
  "integrations_account_provider_key",
  "constraint",
  "acct-9f2c1b00-dead-beef",
  "alice@example.com",
  "ya29.A0AReDACTEDsecret",
  "gmail.readonly",
  "dispatcher.ts:427",
];

function assertNoLeak(serialized: string): void {
  for (const frag of HOSTILE_FRAGMENTS) {
    expect(serialized).not.toContain(frag);
  }
}

import { redactedOAuthErrorCode } from "@/app/api/integrations/oauth/[provider]/_shared";

describe("redactedOAuthErrorCode (shared helper)", () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("returns ONLY the stable fallback code for a hostile Error — never the raw message", () => {
    const code = redactedOAuthErrorCode(new Error(HOSTILE), { event: "oauth.connect_failed", provider: "gmail" }, "connect_failed");
    expect(code).toBe("connect_failed");
    assertNoLeak(code);
  });

  it("returns the stable fallback code for a non-Error throw (string / object)", () => {
    expect(redactedOAuthErrorCode("raw string boom", { event: "e", provider: "p" }, "ingest_failed")).toBe("ingest_failed");
    expect(redactedOAuthErrorCode({ weird: "obj" }, { event: "e", provider: "p" }, "callback_failed")).toBe("callback_failed");
  });

  it("logs the raw message SERVER-SIDE (structured console.error) for diagnostics", () => {
    redactedOAuthErrorCode(new Error(HOSTILE), { event: "oauth.callback_failed", provider: "gmail" }, "callback_failed");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = String(errorSpy.mock.calls[0]?.[0] ?? "");
    expect(logged).toContain("oauth.callback_failed");
    // The raw detail is retained in the SERVER log only (not the returned code).
    expect(logged).toContain("alice@example.com");
  });
});

// ── Callback route wiring ────────────────────────────────────────────────────
const mockHandleCallback = jest.fn();
jest.mock("@/services/oauth/dispatcher", () => ({
  handleCallback: (...a: unknown[]) => mockHandleCallback(...a),
  // The route does `err instanceof X` for these — stub classes so the mock is
  // self-contained and the catch-all (plain Error) is what gets exercised.
  ReconnectIdentityMismatchError: class ReconnectIdentityMismatchError extends Error {},
  StateAccountAccessError: class StateAccountAccessError extends Error {},
}));

import { GET } from "@/app/api/integrations/oauth/[provider]/callback/route";

function callbackReq(): Request {
  return new Request("http://x/api/integrations/oauth/gmail/callback?code=abc&state=xyz");
}
const callbackParams = { params: Promise.resolve({ provider: "gmail" }) };

describe("GET callback route — no-leak (V2-READY-21)", () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    mockHandleCallback.mockReset();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it("redirects with integration_error=callback_failed and leaks none of the raw identifiers", async () => {
    mockHandleCallback.mockRejectedValueOnce(new Error(HOSTILE));
    const res = await GET(callbackReq(), callbackParams);

    // NextResponse.redirect → 3xx with a Location header.
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("integration_error=callback_failed");
    assertNoLeak(decodeURIComponent(location));
    // Diagnostics retained server-side.
    expect(errorSpy).toHaveBeenCalled();
  });

  it("a hostile NON-Error rejection still collapses to the stable code", async () => {
    mockHandleCallback.mockRejectedValueOnce(HOSTILE); // raw string, not an Error
    const res = await GET(callbackReq(), callbackParams);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("integration_error=callback_failed");
    assertNoLeak(decodeURIComponent(location));
  });
});
