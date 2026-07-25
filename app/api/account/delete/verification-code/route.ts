import { NextResponse } from "next/server";
import {
  parseAccountBody,
  requireDeletionStepUpSession,
  requireOwnPersonalAccount,
  SendDeletionCodeBodySchema,
} from "@/app/api/account/_shared";
import { requestDeletionChallenge } from "@/services/accounts/deletionChallenge";

/**
 * POST /api/account/delete/verification-code — send (or resend) the account-
 * deletion verification code (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * Step 1 of the universal deletion confirmation. Identical for every auth
 * provider: password, Google, email OTP, and multi-identity accounts all land
 * here, and nothing in this route branches on how the user signed up.
 *
 * POST-only with side effects — there is deliberately NO GET export, so no
 * prefetch, link, crawler, or address-bar visit can cause an email to be sent.
 * The route is same-origin/CSRF-protected by the same session-cookie contract as
 * every other /api/account route.
 *
 * INPUTS THAT ARE IGNORED BY CONSTRUCTION: the body schema is empty and strict.
 * The destination address is read server-side from the authenticated user's auth
 * identity — a client cannot name it, and a request that tries is a 400.
 *
 * The response carries a MASKED address only, and never the code, the challenge
 * id, or anything derived from them.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireOwnPersonalAccount();
  if (!auth.ok) return auth.response;

  const stepUp = requireDeletionStepUpSession(auth);
  if (!stepUp.ok) return stepUp.response;

  const body = await parseAccountBody(request, SendDeletionCodeBodySchema);
  if (!body.ok) return body.response;

  const result = await requestDeletionChallenge({
    userId: auth.userId,
    sessionId: stepUp.sessionId,
    verifiedEmail: auth.email,
    emailVerified: auth.emailVerified,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "resend_too_soon":
        return NextResponse.json(
          {
            error: "You just requested a code. Wait a moment before asking for another.",
            code: "RESEND_TOO_SOON",
            retryAfterSeconds: result.retryAfterSeconds ?? 60,
          },
          {
            status: 429,
            headers: { "retry-after": String(result.retryAfterSeconds ?? 60) },
          },
        );
      case "send_limit_reached":
        return NextResponse.json(
          {
            error:
              "Too many verification codes have been requested for this account. Try again later or contact support@chainreact.app.",
            code: "SEND_LIMIT_REACHED",
          },
          { status: 429 },
        );
      case "no_verified_email":
        // Fail closed with support guidance. The account cannot self-serve delete
        // until it has a confirmed address to receive the code at.
        return NextResponse.json(
          {
            error:
              "This account has no verified email address, so we can't send a deletion code. Verify your email address, or contact support@chainreact.app to delete your account.",
            code: "NO_VERIFIED_EMAIL",
          },
          { status: 409 },
        );
      case "email_unavailable":
        // The transport did not accept the message, so no authorization exists.
        // Say so plainly rather than showing a code-entry box for an email that
        // will never arrive. No provider error text is exposed.
        return NextResponse.json(
          {
            error:
              "We couldn't send the verification email right now. Try again in a few minutes.",
            code: "EMAIL_UNAVAILABLE",
          },
          { status: 502 },
        );
      case "not_configured":
        return NextResponse.json(
          {
            error:
              "Account deletion verification isn't available right now. Contact support@chainreact.app.",
            code: "VERIFICATION_UNAVAILABLE",
          },
          { status: 503 },
        );
    }
  }

  return NextResponse.json({
    ok: true,
    maskedEmail: result.maskedEmail,
    expiresAt: result.expiresAt,
    resendAvailableAt: result.resendAvailableAt,
    codeLength: result.codeLength,
    maxAttempts: result.maxAttempts,
  });
}
