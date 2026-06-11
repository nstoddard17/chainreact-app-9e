/**
 * @jest-environment node
 *
 * Tests for app/auth/callback/route.ts.
 *
 * Cites database-security.md / oauth-dispatcher.md: validate the callback,
 * verify via Supabase, redirect to a same-origin path. Two link shapes are
 * supported:
 *   - token_hash + type  -> verifyOtp (device-independent email links)
 *   - code               -> exchangeCodeForSession (PKCE / OAuth, same-device)
 * Open-redirect via the `next` param is explicitly defended against, and tokens
 * must never appear in redirect targets or logs.
 */

const mockExchangeCodeForSession = jest.fn();
const mockVerifyOtp = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      verifyOtp: mockVerifyOtp,
    },
  })),
}));

import { GET } from "@/app/auth/callback/route";

beforeEach(() => {
  mockExchangeCodeForSession.mockReset();
  mockVerifyOtp.mockReset();
});

function makeRequest(search: string): Request {
  return new Request(`http://localhost:3000/auth/callback${search}`);
}

describe("GET /auth/callback — token_hash (verifyOtp) flow", () => {
  it("verifies a signup email (type=email) and forwards to /auth/confirmed", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ error: null });
    const res = await GET(
      makeRequest("?token_hash=abc123&type=email&next=/auth/confirmed"),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/auth/confirmed");
    expect(mockVerifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "abc123" });
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("verifies a recovery email (type=recovery) and forwards to /auth/reset-password", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ error: null });
    const res = await GET(
      makeRequest("?token_hash=rec-hash&type=recovery&next=/auth/reset-password"),
    );
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/auth/reset-password",
    );
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: "rec-hash",
    });
  });

  it("rejects a token_hash with no type (safe error, no verifyOtp call)", async () => {
    const res = await GET(makeRequest("?token_hash=abc123"));
    expect(res.headers.get("location")).toContain("/auth/sign-in");
    expect(res.headers.get("location")).toContain("error=invalid_confirmation");
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("rejects a token_hash with a disallowed type (e.g. email_change)", async () => {
    const res = await GET(makeRequest("?token_hash=abc123&type=email_change"));
    expect(res.headers.get("location")).toContain("/auth/sign-in");
    expect(res.headers.get("location")).toContain("error=invalid_confirmation");
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("redirects safely when verifyOtp fails (expired/invalid token)", async () => {
    mockVerifyOtp.mockResolvedValueOnce({
      error: { message: "Token has expired or is invalid" },
    });
    const res = await GET(makeRequest("?token_hash=stale&type=email"));
    expect(res.headers.get("location")).toContain("/auth/sign-in");
    expect(res.headers.get("location")).toContain(
      encodeURIComponent("Token has expired or is invalid"),
    );
  });

  it("blocks open-redirect via // in `next` on the token_hash path", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ error: null });
    const res = await GET(
      makeRequest("?token_hash=abc123&type=email&next=//evil.com/x"),
    );
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("never leaks the token_hash into the redirect Location or logs", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    mockVerifyOtp.mockResolvedValueOnce({ error: null });
    const secret = "super-secret-token-hash-value";
    const res = await GET(
      makeRequest(`?token_hash=${secret}&type=email&next=/auth/confirmed`),
    );
    expect(res.headers.get("location")).not.toContain(secret);
    for (const spy of [warn, log, error]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(secret);
      }
      spy.mockRestore();
    }
  });
});

describe("GET /auth/callback — code (exchangeCodeForSession) flow", () => {
  it("exchanges the code and redirects to / on success", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });
    const res = await GET(makeRequest("?code=valid-code"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("valid-code");
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("respects a same-origin `next` redirect target", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });
    const res = await GET(makeRequest("?code=valid-code&next=/integrations"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/integrations");
  });

  it("forwards sign-up confirmation to the confirmed screen (next=/auth/confirmed)", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });
    const res = await GET(makeRequest("?code=valid-code&next=/auth/confirmed"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/auth/confirmed");
  });

  it("forwards password recovery to reset-password (next=/auth/reset-password) — unchanged", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });
    const res = await GET(makeRequest("?code=valid-code&next=/auth/reset-password"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/auth/reset-password");
  });

  it("rejects an open-redirect via // in `next`", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });
    const res = await GET(makeRequest("?code=valid-code&next=//evil.com/x"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("rejects an absolute `next` URL", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });
    const res = await GET(makeRequest("?code=valid-code&next=https://evil.com"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("redirects to /auth/sign-in with a humanized error when no verifiable param is present", async () => {
    const res = await GET(makeRequest(""));
    expect(res.headers.get("location")).toContain("/auth/sign-in");
    expect(res.headers.get("location")).toContain("error=oauth_missing_code");
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("redirects to /auth/sign-in with the supabase error when exchange fails", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({
      error: { message: "code expired" },
    });
    const res = await GET(makeRequest("?code=stale-code"));
    expect(res.headers.get("location")).toContain("/auth/sign-in");
    expect(res.headers.get("location")).toContain(encodeURIComponent("code expired"));
  });
});
