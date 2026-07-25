import { randomUUID } from "node:crypto";
import {
  CHALLENGE_MAX_ATTEMPTS,
  CHALLENGE_MAX_SENDS_PER_WINDOW,
  CHALLENGE_RESEND_INTERVAL_MS,
  CHALLENGE_SEND_WINDOW_MS,
  CHALLENGE_TTL_MS,
  CHALLENGE_VERIFICATION_WINDOW_MS,
  deriveChallengeVerifier,
  deriveEmailBinding,
  deriveSessionBinding,
  evaluateChallengeForConsumption,
  evaluateChallengeForVerification,
  generateChallengeCode,
  isChallengeKeyConfigured,
  isWellFormedChallengeCode,
  maskEmail,
  normalizeChallengeCodeInput,
  timingSafeEqualHex,
  type ChallengeRejection,
} from "@/core/security/sensitiveActionChallenge";
import * as challengesRepo from "@/repositories/security/sensitiveActionChallenges";
import { sendTransactionalEmail } from "@/services/email/sendTransactionalEmail";
import { renderAccountDeletionVerificationEmail } from "@/services/email/templates/accountDeletionVerification";

/**
 * Universal account-deletion verification challenge
 * (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * THE PRODUCT RULE THIS ENFORCES: account deletion never assumes the caller has
 * a ChainReact password. Every authenticated user — password, Google, email OTP,
 * multi-identity, future SSO — confirms deletion with a one-time code sent to the
 * verified email on their auth identity. There is no provider branch anywhere in
 * this file, and there must never be one: the challenge is the same for everyone,
 * which is precisely what makes it universal.
 *
 * WHAT THIS SERVICE IS NOT. It does not delete anything and it does not relax any
 * deletion rule. A verified challenge is an AUTHORIZATION TO ASK — the caller
 * still runs the canonical `requestAccountDeletion`, which re-checks sole-owner
 * ownership, freezes rather than purges, keeps the grace window, and winds down
 * billing exactly as before.
 *
 * SERVER-DETERMINED INPUTS ONLY. The user id, the session id, the purpose, and
 * (critically) the destination address all come from the verified session
 * server-side. Nothing in the request body can influence who is challenged or
 * where the code is sent — a client-supplied "email" is not a parameter of any
 * function here, so it cannot be honoured even by accident.
 *
 * NO CODE ESCAPES. The plaintext code exists only between `generateChallengeCode`
 * and the email body. It is never returned to a caller, never placed in a URL,
 * never logged, and never persisted — only its keyed HMAC is stored.
 */

const PURPOSE = "delete_account" as const;

/** Structured, non-sensitive log line. Never carries a code, digest, or address. */
function log(event: string, fields: Record<string, string | number | boolean>): void {
  console.info(JSON.stringify({ event, ...fields }));
}

// ── Request / resend ──────────────────────────────────────────────────────────

export interface RequestDeletionChallengeInput {
  userId: string;
  /** Auth session id from the verified access token — never from the request body. */
  sessionId: string;
  /** The verified email read from the user's auth identity — never from the body. */
  verifiedEmail: string | null;
  /** Supabase's `email_confirmed_at`; a null value means the address is unverified. */
  emailVerified: boolean;
  now?: Date;
}

export type RequestDeletionChallengeResult =
  | {
      ok: true;
      /** Masked destination for display, e.g. `c••••••••@gmail.com`. */
      maskedEmail: string;
      expiresAt: string;
      /** Earliest time a resend is allowed. */
      resendAvailableAt: string;
      codeLength: number;
      maxAttempts: number;
    }
  | {
      ok: false;
      reason:
        | "no_verified_email"
        | "resend_too_soon"
        | "send_limit_reached"
        | "email_unavailable"
        | "not_configured";
      /** Present on `resend_too_soon` — when the caller may retry. */
      retryAfterSeconds?: number;
    };

/**
 * Mint and email a fresh deletion code.
 *
 * Ordering is deliberate and is the answer to "email delivery failure must not
 * create a deletion authorization":
 *   1. throttle + cap checks (durable, DB-backed);
 *   2. invalidate every previous open code for this user+purpose — requesting a
 *      new code kills the old one, so two live codes never coexist;
 *   3. insert the row (we need its id inside the code's HMAC);
 *   4. send the email;
 *   5. if the transport did NOT accept the message, immediately invalidate the
 *      row we just wrote. What remains is a dead row, never an authorization
 *      waiting for someone to guess six digits.
 */
export async function requestDeletionChallenge(
  input: RequestDeletionChallengeInput,
): Promise<RequestDeletionChallengeResult> {
  if (!isChallengeKeyConfigured()) {
    // Fail closed: without the server pepper we could only store a brute-forceable
    // digest. Refuse rather than downgrade the protection.
    log("account.delete.challenge.not_configured", { purpose: PURPOSE });
    return { ok: false, reason: "not_configured" };
  }

  const now = input.now ?? new Date();

  if (!input.verifiedEmail || !input.emailVerified) {
    log("account.delete.challenge.no_verified_email", { purpose: PURPOSE });
    return { ok: false, reason: "no_verified_email" };
  }

  const sessionBinding = deriveSessionBinding(input.sessionId);
  const emailBinding = deriveEmailBinding(input.verifiedEmail);

  // Resend throttle — measured from the most recent OPEN challenge's send time.
  const open = await challengesRepo.getOpenChallenge(input.userId, PURPOSE);
  if (open) {
    const nextAllowed =
      new Date(open.lastSentAt).getTime() + CHALLENGE_RESEND_INTERVAL_MS;
    if (nextAllowed > now.getTime()) {
      return {
        ok: false,
        reason: "resend_too_soon",
        retryAfterSeconds: Math.ceil((nextAllowed - now.getTime()) / 1000),
      };
    }
  }

  // Durable per-user cap over a rolling window (survives instance restarts and
  // multiple browsers — an in-memory counter would not).
  const sends = await challengesRepo.countSendsSince({
    userId: input.userId,
    purpose: PURPOSE,
    since: new Date(now.getTime() - CHALLENGE_SEND_WINDOW_MS).toISOString(),
  });
  if (sends >= CHALLENGE_MAX_SENDS_PER_WINDOW) {
    log("account.delete.challenge.send_limit_reached", { purpose: PURPOSE });
    return { ok: false, reason: "send_limit_reached" };
  }

  // Opportunistic cleanup — keeps the table trimmed without a production cron.
  // Best-effort: never let housekeeping block a user from deleting their account.
  try {
    await challengesRepo.deleteSettledChallenges({
      userId: input.userId,
      expiredBefore: new Date(now.getTime() - CHALLENGE_SEND_WINDOW_MS).toISOString(),
    });
  } catch {
    // Intentionally ignored.
  }

  await challengesRepo.invalidateOpenChallenges({
    userId: input.userId,
    purpose: PURPOSE,
    invalidatedAt: now.toISOString(),
  });

  const id = randomUUID();
  const code = generateChallengeCode();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString();

  await challengesRepo.insertChallenge({
    id,
    userId: input.userId,
    purpose: PURPOSE,
    sessionBinding,
    emailBinding,
    codeVerifier: deriveChallengeVerifier({
      purpose: PURPOSE,
      userId: input.userId,
      challengeId: id,
      code,
    }),
    expiresAt,
    maxAttempts: CHALLENGE_MAX_ATTEMPTS,
    sentAt: now.toISOString(),
  });

  const rendered = renderAccountDeletionVerificationEmail({
    code,
    expiresInMinutes: Math.round(CHALLENGE_TTL_MS / 60_000),
  });
  const delivery = await sendTransactionalEmail(
    {
      to: input.verifiedEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    },
    // Safe metadata only — an opaque challenge id and the purpose. No address,
    // no code, no verifier.
    { template: "account_deletion_verification", challengeId: id, purpose: PURPOSE },
  );

  if (delivery.status !== "sent") {
    await challengesRepo.invalidateChallenge(id, new Date().toISOString());
    log("account.delete.challenge.email_unavailable", {
      purpose: PURPOSE,
      status: delivery.status,
    });
    return { ok: false, reason: "email_unavailable" };
  }

  log("account.delete.challenge.sent", { purpose: PURPOSE });
  return {
    ok: true,
    maskedEmail: maskEmail(input.verifiedEmail),
    expiresAt,
    resendAvailableAt: new Date(
      now.getTime() + CHALLENGE_RESEND_INTERVAL_MS,
    ).toISOString(),
    codeLength: 6,
    maxAttempts: CHALLENGE_MAX_ATTEMPTS,
  };
}

// ── Verify ────────────────────────────────────────────────────────────────────

export interface VerifyDeletionChallengeInput {
  userId: string;
  sessionId: string;
  verifiedEmail: string | null;
  /** The user-typed code. Normalized here; never logged. */
  code: string;
  now?: Date;
}

export type VerifyDeletionChallengeFailure =
  | "invalid_code"
  | "no_challenge"
  | "expired"
  | "locked"
  | "not_configured";

export type VerifyDeletionChallengeResult =
  | { ok: true; authorizationExpiresAt: string }
  | {
      ok: false;
      reason: VerifyDeletionChallengeFailure;
      /** Remaining guesses, present on `invalid_code`. */
      attemptsRemaining?: number;
    };

/**
 * Check a submitted code against the caller's open challenge.
 *
 * Every binding is re-derived from the CURRENT session and the CURRENT verified
 * email, then compared in constant time. A mismatch on user, session, purpose, or
 * address is reported to the client with the same generic shape as an ordinary
 * wrong code, so the response can never be used to probe which binding differed.
 *
 * A wrong code costs an attempt; a binding failure does not (the challenge is
 * simply not usable from here at all).
 */
export async function verifyDeletionChallenge(
  input: VerifyDeletionChallengeInput,
): Promise<VerifyDeletionChallengeResult> {
  if (!isChallengeKeyConfigured()) return { ok: false, reason: "not_configured" };

  const now = input.now ?? new Date();
  const code = normalizeChallengeCodeInput(input.code);

  if (!input.verifiedEmail) return { ok: false, reason: "no_challenge" };

  const bindings = {
    purpose: PURPOSE,
    userId: input.userId,
    sessionBinding: deriveSessionBinding(input.sessionId),
    emailBinding: deriveEmailBinding(input.verifiedEmail),
  };

  const row = await challengesRepo.getOpenChallenge(input.userId, PURPOSE);
  const rejection = evaluateChallengeForVerification(row, bindings, now);
  if (rejection) {
    log("account.delete.challenge.verify_rejected", {
      purpose: PURPOSE,
      // The internal reason is safe to log — it names a lifecycle state, never a
      // code, digest, session id, or address.
      reason: rejection,
    });
    return { ok: false, reason: rejectionToVerifyFailure(rejection) };
  }
  const challenge = row!;

  // Structural check AFTER the lifecycle checks so a malformed submission on an
  // already-expired challenge still reports "expired" rather than a wrong code.
  const expected = deriveChallengeVerifier({
    purpose: PURPOSE,
    userId: input.userId,
    challengeId: challenge.id,
    code,
  });
  const matches =
    isWellFormedChallengeCode(code) &&
    timingSafeEqualHex(challenge.codeVerifier, expected);

  if (!matches) {
    const attempts = await challengesRepo.recordFailedAttempt({
      id: challenge.id,
      attemptedAt: now.toISOString(),
      previousAttemptCount: challenge.attemptCount,
    });
    const remaining = Math.max(challenge.maxAttempts - attempts, 0);
    log("account.delete.challenge.verify_failed", {
      purpose: PURPOSE,
      attemptsRemaining: remaining,
    });
    if (remaining <= 0) return { ok: false, reason: "locked" };
    return { ok: false, reason: "invalid_code", attemptsRemaining: remaining };
  }

  const authorizationExpiresAt = new Date(
    now.getTime() + CHALLENGE_VERIFICATION_WINDOW_MS,
  ).toISOString();
  const verified = await challengesRepo.markVerified({
    id: challenge.id,
    verifiedAt: now.toISOString(),
    verificationExpiresAt: authorizationExpiresAt,
  });
  if (!verified) {
    // Lost the race with a concurrent verify/invalidate. Do not report success
    // for an authorization this call did not create.
    return { ok: false, reason: "no_challenge" };
  }

  log("account.delete.challenge.verified", { purpose: PURPOSE });
  return { ok: true, authorizationExpiresAt };
}

function rejectionToVerifyFailure(
  rejection: ChallengeRejection,
): VerifyDeletionChallengeFailure {
  switch (rejection) {
    case "expired":
      return "expired";
    case "locked":
      return "locked";
    default:
      // not_found / invalidated / consumed / any binding mismatch collapse to one
      // indistinguishable answer: "ask for a new code".
      return "no_challenge";
  }
}

// ── Resolve (the spender is the DB transaction, not this module) ──────────────

export interface ResolveDeletionAuthorizationInput {
  userId: string;
  sessionId: string;
  verifiedEmail: string | null;
  now?: Date;
}

/**
 * A resolved-but-NOT-yet-spent authorization. Carries the challenge id plus the
 * binding digests, so the transaction that spends it can re-assert every binding
 * in SQL rather than trusting this read.
 */
export interface DeletionAuthorizationHandle {
  challengeId: string;
  userId: string;
  purpose: string;
  sessionBinding: string;
  emailBinding: string;
}

export type ResolveDeletionAuthorizationResult =
  | { ok: true; authorization: DeletionAuthorizationHandle }
  | { ok: false; reason: "no_authorization" | "expired" | "not_configured" };

/**
 * Resolve — but do NOT spend — the caller's verified deletion authorization
 * (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1A).
 *
 * ── Why this no longer consumes ────────────────────────────────────────────────
 * The first implementation spent the challenge here, before the lifecycle call.
 * That made a replay impossible, but it gave the failure paths inconsistent
 * outcomes: the sole-owner refusal, or any failed durable write, burned the user's
 * code while scheduling nothing. Consumption now happens inside the SAME
 * transaction as the freeze and the audit-row insert
 * (`schedule_account_deletion`), so all three share one outcome and a refusal
 * leaves the code usable until its normal expiry.
 *
 * Replay protection is unchanged and still lives at the compare-and-set: the
 * transaction's `UPDATE … WHERE consumed_at IS NULL` is what serializes spenders,
 * and this read is only an early, friendly refusal. Nothing here is trusted — the
 * bindings it returns are re-asserted in SQL by the spender.
 *
 * Every binding is derived from the CURRENT session and the CURRENT verified
 * email, so a challenge belonging to another user, session, purpose, or a since-
 * changed address resolves to the same generic refusal.
 */
export async function resolveDeletionAuthorization(
  input: ResolveDeletionAuthorizationInput,
): Promise<ResolveDeletionAuthorizationResult> {
  if (!isChallengeKeyConfigured()) return { ok: false, reason: "not_configured" };

  const now = input.now ?? new Date();
  if (!input.verifiedEmail) return { ok: false, reason: "no_authorization" };

  const bindings = {
    purpose: PURPOSE,
    userId: input.userId,
    sessionBinding: deriveSessionBinding(input.sessionId),
    emailBinding: deriveEmailBinding(input.verifiedEmail),
  };

  const row = await challengesRepo.getOpenChallenge(input.userId, PURPOSE);
  const rejection = evaluateChallengeForConsumption(row, bindings, now);
  if (rejection) {
    log("account.delete.authorization.rejected", { purpose: PURPOSE, reason: rejection });
    return {
      ok: false,
      reason:
        rejection === "expired" || rejection === "verification_expired"
          ? "expired"
          : "no_authorization",
    };
  }

  log("account.delete.authorization.resolved", { purpose: PURPOSE });
  return {
    ok: true,
    authorization: {
      challengeId: row!.id,
      userId: bindings.userId,
      purpose: bindings.purpose,
      sessionBinding: bindings.sessionBinding,
      emailBinding: bindings.emailBinding,
    },
  };
}
