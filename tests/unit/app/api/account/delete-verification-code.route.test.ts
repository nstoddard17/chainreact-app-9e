/**
 * @jest-environment node
 *
 * Route tests for the deletion verification-code endpoints
 * (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1):
 *
 *   POST /api/account/delete/verification-code         → send / resend
 *   POST /api/account/delete/verification-code/verify  → check the code
 *
 * The service is mocked so the ROUTE contract is what is proved: authentication,
 * the MFA/session gate, strict bodies (a client-supplied destination email is a
 * hard 400), the typed non-enumerating error mapping, POST-only surfaces, and the
 * guarantee that no code / address / session id is echoed back.
 */

const mockGetUser = jest.fn();
const mockGetSession = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser(), getSession: () => mockGetSession() },
  })),
}));

const mockEnsurePersonalAccount = jest.fn();
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (...a: unknown[]) => mockEnsurePersonalAccount(...a),
}));

const mockRequestChallenge = jest.fn();
const mockVerifyChallenge = jest.fn();
jest.mock("@/services/accounts/deletionChallenge", () => ({
  requestDeletionChallenge: (...a: unknown[]) => mockRequestChallenge(...a),
  verifyDeletionChallenge: (...a: unknown[]) => mockVerifyChallenge(...a),
}));

import { POST as SEND } from "@/app/api/account/delete/verification-code/route";
import { POST as VERIFY } from "@/app/api/account/delete/verification-code/verify/route";

const USER_ID = "user-1";
const SESSION_ID = "sess-abc";
const EMAIL = "chainreactapp@gmail.com";

function accessToken(claims: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
}

function signedIn(
  opts: {
    email?: string | null;
    emailConfirmed?: boolean;
    factors?: Array<{ status: string; factor_type: string }>;
    aal?: string;
    sessionId?: string | null;
  } = {},
) {
  const {
    email = EMAIL,
    emailConfirmed = true,
    factors = [],
    aal = "aal1",
    sessionId = SESSION_ID,
  } = opts;
  mockGetUser.mockResolvedValueOnce({
    data: {
      user: {
        id: USER_ID,
        email,
        email_confirmed_at: emailConfirmed ? "2026-01-01T00:00:00.000Z" : null,
        factors,
      },
    },
    error: null,
  });
  mockEnsurePersonalAccount.mockResolvedValueOnce({
    id: "acct-1",
    type: "personal",
    name: "Personal",
    ownerUserId: USER_ID,
    deletionStatus: "active",
    deletionRequestedAt: null,
    purgeAfter: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  mockGetSession.mockResolvedValueOnce({
    data: {
      session: {
        access_token: accessToken(
          sessionId === null ? { aal } : { session_id: sessionId, aal },
        ),
      },
    },
    error: null,
  });
}

function sendReq(body: unknown = {}) {
  return new Request("https://app.example.test/api/account/delete/verification-code", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
function verifyReq(body: unknown) {
  return new Request(
    "https://app.example.test/api/account/delete/verification-code/verify",
    { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) },
  );
}

const SENT = {
  ok: true as const,
  maskedEmail: "c••••••••@gmail.com",
  expiresAt: "2026-07-24T12:10:00.000Z",
  resendAvailableAt: "2026-07-24T12:01:00.000Z",
  codeLength: 6,
  maxAttempts: 5,
};

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetSession.mockReset();
  mockEnsurePersonalAccount.mockReset();
  mockRequestChallenge.mockReset();
  mockVerifyChallenge.mockReset();
});

describe("POST /api/account/delete/verification-code — send", () => {
  it("401s an unauthenticated caller and sends nothing", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await SEND(sendReq());
    expect(res.status).toBe(401);
    expect(mockRequestChallenge).not.toHaveBeenCalled();
  });

  it("sends to the SERVER-resolved verified email and returns only the mask", async () => {
    signedIn();
    mockRequestChallenge.mockResolvedValueOnce(SENT);
    const res = await SEND(sendReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      maskedEmail: SENT.maskedEmail,
      expiresAt: SENT.expiresAt,
      resendAvailableAt: SENT.resendAvailableAt,
      codeLength: 6,
      maxAttempts: 5,
    });
    expect(mockRequestChallenge).toHaveBeenCalledWith({
      userId: USER_ID,
      sessionId: SESSION_ID,
      verifiedEmail: EMAIL,
      emailVerified: true,
    });
  });

  it("REJECTS a client-supplied destination email outright (strict body)", async () => {
    signedIn();
    const res = await SEND(sendReq({ email: "attacker@evil.test" }));
    expect(res.status).toBe(400);
    expect(mockRequestChallenge).not.toHaveBeenCalled();
  });

  it("ignores a client-supplied userId/purpose the same way", async () => {
    signedIn();
    const res = await SEND(sendReq({ userId: "victim", purpose: "something_else" }));
    expect(res.status).toBe(400);
    expect(mockRequestChallenge).not.toHaveBeenCalled();
  });

  it("passes emailVerified=false through so the service can fail closed", async () => {
    signedIn({ emailConfirmed: false });
    mockRequestChallenge.mockResolvedValueOnce({ ok: false, reason: "no_verified_email" });
    const res = await SEND(sendReq());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("NO_VERIFIED_EMAIL");
    expect(body.error).toMatch(/support@chainreact\.app/);
    expect(mockRequestChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ emailVerified: false }),
    );
  });

  it("429s a too-soon resend with a Retry-After header", async () => {
    signedIn();
    mockRequestChallenge.mockResolvedValueOnce({
      ok: false,
      reason: "resend_too_soon",
      retryAfterSeconds: 37,
    });
    const res = await SEND(sendReq());
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("37");
    const body = await res.json();
    expect(body.code).toBe("RESEND_TOO_SOON");
    expect(body.retryAfterSeconds).toBe(37);
  });

  it("429s an exhausted durable send cap", async () => {
    signedIn();
    mockRequestChallenge.mockResolvedValueOnce({ ok: false, reason: "send_limit_reached" });
    const res = await SEND(sendReq());
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("SEND_LIMIT_REACHED");
  });

  it("502s an undeliverable email and never implies a code is waiting", async () => {
    signedIn();
    mockRequestChallenge.mockResolvedValueOnce({ ok: false, reason: "email_unavailable" });
    const res = await SEND(sendReq());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("EMAIL_UNAVAILABLE");
    expect(body.error).toMatch(/couldn't send the verification email/i);
    // No masked destination, no expiry — nothing that reads as "check your inbox".
    expect(body.maskedEmail).toBeUndefined();
    expect(body.expiresAt).toBeUndefined();
  });

  it("503s when the challenge subsystem is unconfigured", async () => {
    signedIn();
    mockRequestChallenge.mockResolvedValueOnce({ ok: false, reason: "not_configured" });
    const res = await SEND(sendReq());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("VERIFICATION_UNAVAILABLE");
  });

  it("403s an MFA-enrolled AAL1 session before sending anything", async () => {
    signedIn({ factors: [{ status: "verified", factor_type: "totp" }], aal: "aal1" });
    const res = await SEND(sendReq());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("MFA_REQUIRED");
    expect(mockRequestChallenge).not.toHaveBeenCalled();
  });

  it("401s when no session id can be read — never issues an unbound challenge", async () => {
    signedIn({ sessionId: null });
    const res = await SEND(sendReq());
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("SESSION_UNAVAILABLE");
    expect(mockRequestChallenge).not.toHaveBeenCalled();
  });

  it("never echoes the full address or the session id", async () => {
    signedIn();
    mockRequestChallenge.mockResolvedValueOnce(SENT);
    const text = JSON.stringify(await (await SEND(sendReq())).json());
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain(SESSION_ID);
    expect(text).not.toMatch(/\b\d{6}\b/);
  });

  it("exports POST only — a GET can never send an email", async () => {
    const mod = await import("@/app/api/account/delete/verification-code/route");
    expect(Object.keys(mod).sort()).toEqual(["POST"]);
  });
});

describe("POST /api/account/delete/verification-code/verify", () => {
  it("401s an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await VERIFY(verifyReq({ code: "123456" }));
    expect(res.status).toBe(401);
    expect(mockVerifyChallenge).not.toHaveBeenCalled();
  });

  it("verifies with the server-derived bindings and returns the window", async () => {
    signedIn();
    mockVerifyChallenge.mockResolvedValueOnce({
      ok: true,
      authorizationExpiresAt: "2026-07-24T12:05:00.000Z",
    });
    const res = await VERIFY(verifyReq({ code: "123456" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      authorizationExpiresAt: "2026-07-24T12:05:00.000Z",
    });
    expect(mockVerifyChallenge).toHaveBeenCalledWith({
      userId: USER_ID,
      sessionId: SESSION_ID,
      verifiedEmail: EMAIL,
      code: "123456",
    });
  });

  it("REJECTS a smuggled email/userId/purpose alongside the code (strict body)", async () => {
    signedIn();
    const res = await VERIFY(
      verifyReq({ code: "123456", email: "victim@x.test", userId: "victim" }),
    );
    expect(res.status).toBe(400);
    expect(mockVerifyChallenge).not.toHaveBeenCalled();
  });

  it("400s a wrong code and reports the remaining attempts", async () => {
    signedIn();
    mockVerifyChallenge.mockResolvedValueOnce({
      ok: false,
      reason: "invalid_code",
      attemptsRemaining: 3,
    });
    const res = await VERIFY(verifyReq({ code: "000000" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_CODE");
    expect(body.attemptsRemaining).toBe(3);
  });

  it("410s an expired code and 429s a locked challenge", async () => {
    signedIn();
    mockVerifyChallenge.mockResolvedValueOnce({ ok: false, reason: "expired" });
    expect((await VERIFY(verifyReq({ code: "000000" }))).status).toBe(410);

    signedIn();
    mockVerifyChallenge.mockResolvedValueOnce({ ok: false, reason: "locked" });
    const locked = await VERIFY(verifyReq({ code: "000000" }));
    expect(locked.status).toBe(429);
    expect((await locked.json()).code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("409s when there is no active challenge for this user+session+purpose", async () => {
    signedIn();
    mockVerifyChallenge.mockResolvedValueOnce({ ok: false, reason: "no_challenge" });
    const res = await VERIFY(verifyReq({ code: "123456" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("NO_ACTIVE_CODE");
  });

  it("403s an MFA-enrolled AAL1 session before checking the code", async () => {
    signedIn({ factors: [{ status: "verified", factor_type: "totp" }], aal: "aal1" });
    const res = await VERIFY(verifyReq({ code: "123456" }));
    expect(res.status).toBe(403);
    expect(mockVerifyChallenge).not.toHaveBeenCalled();
  });

  it("400s a malformed body without touching the service", async () => {
    signedIn();
    expect((await VERIFY(verifyReq({}))).status).toBe(400);
    signedIn();
    expect((await VERIFY(verifyReq({ code: "x".repeat(50) }))).status).toBe(400);
    expect(mockVerifyChallenge).not.toHaveBeenCalled();
  });

  it("never echoes the submitted code back to the client", async () => {
    signedIn();
    mockVerifyChallenge.mockResolvedValueOnce({
      ok: false,
      reason: "invalid_code",
      attemptsRemaining: 2,
    });
    const res = await VERIFY(verifyReq({ code: "424242" }));
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("424242");
    expect(text).not.toContain(EMAIL);
  });

  it("exports POST only — no GET can verify or consume a code", async () => {
    const mod = await import("@/app/api/account/delete/verification-code/verify/route");
    expect(Object.keys(mod).sort()).toEqual(["POST"]);
  });
});
