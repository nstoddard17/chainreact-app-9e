/**
 * @jest-environment node
 *
 * Universal account-deletion verification challenge — service behavior
 * (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * The repository and the transactional-email seam are mocked; everything else is
 * the real service + the real pure crypto, so the rules that matter are proved
 * end-to-end at the service boundary:
 *
 *   - the destination is the SERVER-side verified email, never client input;
 *   - the plaintext code is never persisted, returned, or logged;
 *   - an email that could not be delivered leaves NO usable authorization;
 *   - throttling / send caps / attempt caps are durable and enforced;
 *   - a resend invalidates the previous code;
 *   - user / session / purpose / email-change mismatches all refuse;
 *   - a verified authorization is single-use and cannot be replayed.
 */

process.env.SENSITIVE_ACTION_CHALLENGE_KEY = Buffer.alloc(32, 5).toString("base64");

const repo = {
  insertChallenge: jest.fn(),
  getOpenChallenge: jest.fn(),
  invalidateOpenChallenges: jest.fn(),
  invalidateChallenge: jest.fn(),
  recordFailedAttempt: jest.fn(),
  markVerified: jest.fn(),
  consumeVerifiedChallenge: jest.fn(),
  countSendsSince: jest.fn(),
  deleteSettledChallenges: jest.fn(),
};
jest.mock("@/repositories/security/sensitiveActionChallenges", () => repo);

const mockSendEmail = jest.fn();
jest.mock("@/services/email/sendTransactionalEmail", () => ({
  sendTransactionalEmail: (...a: unknown[]) => mockSendEmail(...a),
}));

import {
  consumeDeletionAuthorization,
  requestDeletionChallenge,
  verifyDeletionChallenge,
} from "@/services/accounts/deletionChallenge";
import {
  CHALLENGE_MAX_ATTEMPTS,
  deriveChallengeVerifier,
  deriveEmailBinding,
  deriveSessionBinding,
} from "@/core/security/sensitiveActionChallenge";

const USER_ID = "user-1";
const SESSION_ID = "sess-abc";
const EMAIL = "chainreactapp@gmail.com";
const NOW = new Date("2026-07-24T12:00:00.000Z");

let infoSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  Object.values(repo).forEach((fn) => fn.mockReset());
  repo.getOpenChallenge.mockResolvedValue(null);
  repo.countSendsSince.mockResolvedValue(0);
  repo.invalidateOpenChallenges.mockResolvedValue(undefined);
  repo.invalidateChallenge.mockResolvedValue(undefined);
  repo.deleteSettledChallenges.mockResolvedValue(undefined);
  repo.insertChallenge.mockImplementation(async (input) => ({ ...input }));
  mockSendEmail.mockReset().mockResolvedValue({ status: "sent" });
  infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  infoSpy.mockRestore();
  warnSpy.mockRestore();
});

/** Extract the six-digit code from the rendered email the service actually sent. */
function sentCode(): string {
  const [message] = mockSendEmail.mock.calls[0]!;
  const match = /\b(\d{6})\b/.exec((message as { text: string }).text);
  if (!match) throw new Error("no code found in the sent email");
  return match[1]!;
}

/** The row the service just wrote, shaped as the repository would return it. */
function insertedRow(overrides: Record<string, unknown> = {}) {
  const input = repo.insertChallenge.mock.calls[0]![0];
  return {
    id: input.id,
    userId: input.userId,
    purpose: input.purpose,
    sessionBinding: input.sessionBinding,
    emailBinding: input.emailBinding,
    codeVerifier: input.codeVerifier,
    expiresAt: input.expiresAt,
    attemptCount: 0,
    maxAttempts: input.maxAttempts,
    verifiedAt: null,
    verificationExpiresAt: null,
    consumedAt: null,
    invalidatedAt: null,
    lastSentAt: input.sentAt,
    sendCount: 1,
    createdAt: input.sentAt,
    ...overrides,
  };
}

// ── Request / send ────────────────────────────────────────────────────────────

describe("requestDeletionChallenge", () => {
  const input = {
    userId: USER_ID,
    sessionId: SESSION_ID,
    verifiedEmail: EMAIL,
    emailVerified: true,
    now: NOW,
  };

  it("sends to the SERVER-side verified email and returns only a masked destination", async () => {
    const result = await requestDeletionChallenge(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0]![0].to).toBe(EMAIL);
    // The caller only ever learns a mask.
    expect(result.maskedEmail).toMatch(/^c•+@gmail\.com$/);
    expect(JSON.stringify(result)).not.toContain(EMAIL);
  });

  it("uses the existing transactional-email seam with SAFE metadata only", async () => {
    await requestDeletionChallenge(input);
    const meta = mockSendEmail.mock.calls[0]![1];
    expect(meta.template).toBe("account_deletion_verification");
    expect(meta.purpose).toBe("delete_account");
    // No address, no code, no verifier in the observability metadata.
    expect(JSON.stringify(meta)).not.toContain(EMAIL);
    expect(JSON.stringify(meta)).not.toContain(sentCode());
  });

  it("stores an HMAC verifier, never the plaintext code", async () => {
    await requestDeletionChallenge(input);
    const row = repo.insertChallenge.mock.calls[0]![0];
    const code = sentCode();

    expect(JSON.stringify(row)).not.toContain(code);
    expect(row.codeVerifier).toBe(
      deriveChallengeVerifier({
        purpose: "delete_account",
        userId: USER_ID,
        challengeId: row.id,
        code,
      }),
    );
    // Bindings are digests, not the raw values.
    expect(row.sessionBinding).toBe(deriveSessionBinding(SESSION_ID));
    expect(row.emailBinding).toBe(deriveEmailBinding(EMAIL));
    expect(JSON.stringify(row)).not.toContain(SESSION_ID);
    expect(JSON.stringify(row)).not.toContain(EMAIL);
  });

  it("never logs the code, the verifier, the address, or the session id", async () => {
    await requestDeletionChallenge(input);
    const code = sentCode();
    const logged = [...infoSpy.mock.calls, ...warnSpy.mock.calls].flat().join(" ");
    expect(logged).not.toContain(code);
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain(SESSION_ID);
    expect(logged).not.toContain(repo.insertChallenge.mock.calls[0]![0].codeVerifier);
  });

  it("binds the challenge to the delete_account purpose", async () => {
    await requestDeletionChallenge(input);
    expect(repo.insertChallenge.mock.calls[0]![0].purpose).toBe("delete_account");
  });

  it("fails closed when the account has no verified email — and sends nothing", async () => {
    const noEmail = await requestDeletionChallenge({ ...input, verifiedEmail: null });
    expect(noEmail).toEqual({ ok: false, reason: "no_verified_email" });

    const unconfirmed = await requestDeletionChallenge({ ...input, emailVerified: false });
    expect(unconfirmed).toEqual({ ok: false, reason: "no_verified_email" });

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(repo.insertChallenge).not.toHaveBeenCalled();
  });

  it("fails closed (and sends nothing) when the server pepper is missing", async () => {
    const key = process.env.SENSITIVE_ACTION_CHALLENGE_KEY;
    delete process.env.SENSITIVE_ACTION_CHALLENGE_KEY;
    try {
      expect(await requestDeletionChallenge(input)).toEqual({
        ok: false,
        reason: "not_configured",
      });
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(repo.insertChallenge).not.toHaveBeenCalled();
    } finally {
      process.env.SENSITIVE_ACTION_CHALLENGE_KEY = key;
    }
  });

  it("INVALIDATES the challenge when the email could not be delivered — no dangling authorization", async () => {
    mockSendEmail.mockResolvedValueOnce({ status: "failed", reason: "provider_422" });
    const result = await requestDeletionChallenge(input);
    expect(result).toEqual({ ok: false, reason: "email_unavailable" });
    expect(repo.invalidateChallenge).toHaveBeenCalledWith(
      repo.insertChallenge.mock.calls[0]![0].id,
      expect.any(String),
    );
  });

  it("treats a not-configured transport the same way (no usable code exists)", async () => {
    mockSendEmail.mockResolvedValueOnce({ status: "not_configured" });
    const result = await requestDeletionChallenge(input);
    expect(result).toEqual({ ok: false, reason: "email_unavailable" });
    expect(repo.invalidateChallenge).toHaveBeenCalled();
  });

  it("invalidates every previous open code before minting a new one", async () => {
    await requestDeletionChallenge(input);
    expect(repo.invalidateOpenChallenges).toHaveBeenCalledWith({
      userId: USER_ID,
      purpose: "delete_account",
      invalidatedAt: NOW.toISOString(),
    });
    // Ordering matters: the old code must be dead before the new one exists.
    expect(repo.invalidateOpenChallenges.mock.invocationCallOrder[0]!).toBeLessThan(
      repo.insertChallenge.mock.invocationCallOrder[0]!,
    );
  });

  it("throttles a resend inside the 60s window and reports the wait", async () => {
    repo.getOpenChallenge.mockResolvedValueOnce({
      ...insertedRowShell(),
      lastSentAt: "2026-07-24T11:59:30.000Z",
    });
    const result = await requestDeletionChallenge(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("resend_too_soon");
    expect(result.retryAfterSeconds).toBe(30);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("allows a resend once the throttle window has elapsed", async () => {
    repo.getOpenChallenge.mockResolvedValueOnce({
      ...insertedRowShell(),
      lastSentAt: "2026-07-24T11:58:00.000Z",
    });
    const result = await requestDeletionChallenge(input);
    expect(result.ok).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("enforces the DURABLE per-user send cap (survives instances/browsers)", async () => {
    repo.countSendsSince.mockResolvedValueOnce(10);
    const result = await requestDeletionChallenge(input);
    expect(result).toEqual({ ok: false, reason: "send_limit_reached" });
    expect(mockSendEmail).not.toHaveBeenCalled();
    // The cap is a DB question, not an in-memory counter.
    expect(repo.countSendsSince).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, purpose: "delete_account" }),
    );
  });

  it("does not let opportunistic cleanup failure block a deletion request", async () => {
    repo.deleteSettledChallenges.mockRejectedValueOnce(new Error("cleanup boom"));
    const result = await requestDeletionChallenge(input);
    expect(result.ok).toBe(true);
  });
});

/** Minimal open-challenge shell for throttle tests (no insert has happened yet). */
function insertedRowShell() {
  return {
    id: "chal-old",
    userId: USER_ID,
    purpose: "delete_account",
    sessionBinding: deriveSessionBinding(SESSION_ID),
    emailBinding: deriveEmailBinding(EMAIL),
    codeVerifier: "deadbeef",
    expiresAt: "2026-07-24T12:09:00.000Z",
    attemptCount: 0,
    maxAttempts: CHALLENGE_MAX_ATTEMPTS,
    verifiedAt: null,
    verificationExpiresAt: null,
    consumedAt: null,
    invalidatedAt: null,
    lastSentAt: "2026-07-24T11:59:30.000Z",
    sendCount: 1,
    createdAt: "2026-07-24T11:59:30.000Z",
  };
}

// ── Verify ────────────────────────────────────────────────────────────────────

describe("verifyDeletionChallenge", () => {
  const verifyInput = {
    userId: USER_ID,
    sessionId: SESSION_ID,
    verifiedEmail: EMAIL,
    now: NOW,
  };

  async function mintChallenge() {
    await requestDeletionChallenge({
      userId: USER_ID,
      sessionId: SESSION_ID,
      verifiedEmail: EMAIL,
      emailVerified: true,
      now: NOW,
    });
    return { code: sentCode(), row: insertedRow() };
  }

  it("accepts the correct code and opens a SHORT authorization window", async () => {
    const { code, row } = await mintChallenge();
    repo.getOpenChallenge.mockResolvedValueOnce(row);
    repo.markVerified.mockResolvedValueOnce({ ...row, verifiedAt: NOW.toISOString() });

    const result = await verifyDeletionChallenge({ ...verifyInput, code });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Five minutes, not the code's own ten-minute lifetime.
    expect(result.authorizationExpiresAt).toBe("2026-07-24T12:05:00.000Z");
  });

  it("accepts a pasted code with spaces or dashes", async () => {
    const { code, row } = await mintChallenge();
    repo.getOpenChallenge.mockResolvedValue(row);
    repo.markVerified.mockResolvedValue({ ...row, verifiedAt: NOW.toISOString() });

    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect((await verifyDeletionChallenge({ ...verifyInput, code: spaced })).ok).toBe(true);
    const dashed = `${code.slice(0, 3)}-${code.slice(3)}`;
    expect((await verifyDeletionChallenge({ ...verifyInput, code: dashed })).ok).toBe(true);
    expect(repo.recordFailedAttempt).not.toHaveBeenCalled();
  });

  it("increments the attempt count on a wrong code and reports the remaining guesses", async () => {
    const { code, row } = await mintChallenge();
    const wrong = code === "000000" ? "111111" : "000000";
    repo.getOpenChallenge.mockResolvedValueOnce(row);
    repo.recordFailedAttempt.mockResolvedValueOnce(1);

    const result = await verifyDeletionChallenge({ ...verifyInput, code: wrong });
    expect(result).toEqual({ ok: false, reason: "invalid_code", attemptsRemaining: 4 });
    expect(repo.recordFailedAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ id: row.id, previousAttemptCount: 0 }),
    );
    expect(repo.markVerified).not.toHaveBeenCalled();
  });

  it("LOCKS the challenge once the attempts are exhausted", async () => {
    const { code, row } = await mintChallenge();
    const wrong = code === "000000" ? "111111" : "000000";
    repo.getOpenChallenge.mockResolvedValueOnce({ ...row, attemptCount: 4 });
    repo.recordFailedAttempt.mockResolvedValueOnce(5);

    expect(await verifyDeletionChallenge({ ...verifyInput, code: wrong })).toEqual({
      ok: false,
      reason: "locked",
    });
  });

  it("refuses further attempts on an already-locked challenge without touching the counter", async () => {
    const { code, row } = await mintChallenge();
    repo.getOpenChallenge.mockResolvedValueOnce({ ...row, attemptCount: 5 });
    expect(await verifyDeletionChallenge({ ...verifyInput, code })).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(repo.recordFailedAttempt).not.toHaveBeenCalled();
  });

  it("refuses an expired code even when it is the right one", async () => {
    const { code, row } = await mintChallenge();
    repo.getOpenChallenge.mockResolvedValueOnce({
      ...row,
      expiresAt: "2026-07-24T11:00:00.000Z",
    });
    expect(await verifyDeletionChallenge({ ...verifyInput, code })).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(repo.markVerified).not.toHaveBeenCalled();
  });

  it("refuses a code from a DIFFERENT session", async () => {
    const { code, row } = await mintChallenge();
    repo.getOpenChallenge.mockResolvedValueOnce(row);
    expect(
      await verifyDeletionChallenge({ ...verifyInput, sessionId: "other-session", code }),
    ).toEqual({ ok: false, reason: "no_challenge" });
    expect(repo.markVerified).not.toHaveBeenCalled();
  });

  it("refuses a challenge belonging to a DIFFERENT user", async () => {
    const { code, row } = await mintChallenge();
    repo.getOpenChallenge.mockResolvedValueOnce({ ...row, userId: "someone-else" });
    expect(await verifyDeletionChallenge({ ...verifyInput, code })).toEqual({
      ok: false,
      reason: "no_challenge",
    });
  });

  it("refuses a challenge minted for a DIFFERENT purpose", async () => {
    const { code, row } = await mintChallenge();
    repo.getOpenChallenge.mockResolvedValueOnce({ ...row, purpose: "some_other_purpose" });
    expect(await verifyDeletionChallenge({ ...verifyInput, code })).toEqual({
      ok: false,
      reason: "no_challenge",
    });
  });

  it("refuses once the account's primary email CHANGED after the code was sent", async () => {
    const { code, row } = await mintChallenge();
    repo.getOpenChallenge.mockResolvedValueOnce(row);
    expect(
      await verifyDeletionChallenge({
        ...verifyInput,
        verifiedEmail: "moved@example.com",
        code,
      }),
    ).toEqual({ ok: false, reason: "no_challenge" });
    expect(repo.markVerified).not.toHaveBeenCalled();
  });

  it("does not verify twice — a lost markVerified race reports failure, not success", async () => {
    const { code, row } = await mintChallenge();
    repo.getOpenChallenge.mockResolvedValueOnce(row);
    repo.markVerified.mockResolvedValueOnce(null); // another call won
    expect(await verifyDeletionChallenge({ ...verifyInput, code })).toEqual({
      ok: false,
      reason: "no_challenge",
    });
  });

  it("never logs the submitted code", async () => {
    const { code, row } = await mintChallenge();
    repo.getOpenChallenge.mockResolvedValueOnce(row);
    repo.recordFailedAttempt.mockResolvedValueOnce(1);
    await verifyDeletionChallenge({ ...verifyInput, code: "999999" });
    const logged = [...infoSpy.mock.calls, ...warnSpy.mock.calls].flat().join(" ");
    expect(logged).not.toContain("999999");
    expect(logged).not.toContain(code);
  });
});

// ── Consume ───────────────────────────────────────────────────────────────────

describe("consumeDeletionAuthorization", () => {
  const consumeInput = {
    userId: USER_ID,
    sessionId: SESSION_ID,
    verifiedEmail: EMAIL,
    now: NOW,
  };

  function verifiedRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "chal-1",
      userId: USER_ID,
      purpose: "delete_account",
      sessionBinding: deriveSessionBinding(SESSION_ID),
      emailBinding: deriveEmailBinding(EMAIL),
      codeVerifier: "x",
      expiresAt: "2026-07-24T12:09:00.000Z",
      attemptCount: 1,
      maxAttempts: CHALLENGE_MAX_ATTEMPTS,
      verifiedAt: "2026-07-24T11:59:00.000Z",
      verificationExpiresAt: "2026-07-24T12:04:00.000Z",
      consumedAt: null,
      invalidatedAt: null,
      lastSentAt: "2026-07-24T11:58:00.000Z",
      sendCount: 1,
      createdAt: "2026-07-24T11:58:00.000Z",
      ...overrides,
    };
  }

  it("spends a live verified authorization exactly once", async () => {
    const row = verifiedRow();
    repo.getOpenChallenge.mockResolvedValueOnce(row);
    repo.consumeVerifiedChallenge.mockResolvedValueOnce({
      ...row,
      consumedAt: NOW.toISOString(),
    });

    expect(await consumeDeletionAuthorization(consumeInput)).toEqual({
      ok: true,
      challengeId: "chal-1",
    });
    expect(repo.consumeVerifiedChallenge).toHaveBeenCalledWith({
      id: "chal-1",
      consumedAt: NOW.toISOString(),
    });
  });

  it("refuses the REPLAY — the atomic compare-and-set returns nothing the second time", async () => {
    const row = verifiedRow();
    repo.getOpenChallenge.mockResolvedValue(row);
    repo.consumeVerifiedChallenge.mockResolvedValueOnce({
      ...row,
      consumedAt: NOW.toISOString(),
    });
    expect((await consumeDeletionAuthorization(consumeInput)).ok).toBe(true);

    repo.consumeVerifiedChallenge.mockResolvedValueOnce(null);
    expect(await consumeDeletionAuthorization(consumeInput)).toEqual({
      ok: false,
      reason: "no_authorization",
    });
  });

  it("refuses an UNVERIFIED challenge — verification is what authorizes, not existence", async () => {
    repo.getOpenChallenge.mockResolvedValueOnce(
      verifiedRow({ verifiedAt: null, verificationExpiresAt: null }),
    );
    expect(await consumeDeletionAuthorization(consumeInput)).toEqual({
      ok: false,
      reason: "no_authorization",
    });
    expect(repo.consumeVerifiedChallenge).not.toHaveBeenCalled();
  });

  it("refuses once the post-verification window elapsed", async () => {
    repo.getOpenChallenge.mockResolvedValueOnce(
      verifiedRow({
        verifiedAt: "2026-07-24T11:50:00.000Z",
        verificationExpiresAt: "2026-07-24T11:55:00.000Z",
      }),
    );
    expect(await consumeDeletionAuthorization(consumeInput)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(repo.consumeVerifiedChallenge).not.toHaveBeenCalled();
  });

  it("refuses a verification made in a DIFFERENT session (cross-session replay)", async () => {
    repo.getOpenChallenge.mockResolvedValueOnce(verifiedRow());
    expect(
      await consumeDeletionAuthorization({ ...consumeInput, sessionId: "other-session" }),
    ).toEqual({ ok: false, reason: "no_authorization" });
    expect(repo.consumeVerifiedChallenge).not.toHaveBeenCalled();
  });

  it("refuses when the account email changed between verification and confirmation", async () => {
    repo.getOpenChallenge.mockResolvedValueOnce(verifiedRow());
    expect(
      await consumeDeletionAuthorization({
        ...consumeInput,
        verifiedEmail: "moved@example.com",
      }),
    ).toEqual({ ok: false, reason: "no_authorization" });
  });

  it("refuses when there is no challenge at all", async () => {
    repo.getOpenChallenge.mockResolvedValueOnce(null);
    expect(await consumeDeletionAuthorization(consumeInput)).toEqual({
      ok: false,
      reason: "no_authorization",
    });
  });

  it("fails closed without the server pepper", async () => {
    const key = process.env.SENSITIVE_ACTION_CHALLENGE_KEY;
    delete process.env.SENSITIVE_ACTION_CHALLENGE_KEY;
    try {
      expect(await consumeDeletionAuthorization(consumeInput)).toEqual({
        ok: false,
        reason: "not_configured",
      });
    } finally {
      process.env.SENSITIVE_ACTION_CHALLENGE_KEY = key;
    }
  });
});
