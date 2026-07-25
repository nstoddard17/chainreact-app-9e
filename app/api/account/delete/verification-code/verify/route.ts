import { NextResponse } from "next/server";
import {
  parseAccountBody,
  requireDeletionStepUpSession,
  requireOwnPersonalAccount,
  VerifyDeletionCodeBodySchema,
} from "@/app/api/account/_shared";
import { verifyDeletionChallenge } from "@/services/accounts/deletionChallenge";

/**
 * POST /api/account/delete/verification-code/verify — check the emailed code
 * (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * Step 2 of the universal deletion confirmation. Success does NOT delete or
 * schedule anything — it only marks the challenge verified for a short window,
 * after which the user must still type `DELETE` and submit the final request.
 * That separation is deliberate: verification proves possession of the mailbox,
 * the typed word proves intent, and only the final route touches the lifecycle.
 *
 * POST-only; no GET export, so a code can never be verified (or consumed) by a
 * URL visit, and the code never appears in a query string or a log line.
 *
 * Error shape is uniform on purpose. A wrong code, a code for another session,
 * another user's challenge, a different purpose, and an address that changed
 * since the code was sent all return the same non-enumerating answers, so the
 * response cannot be used to probe which binding failed.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireOwnPersonalAccount();
  if (!auth.ok) return auth.response;

  const stepUp = requireDeletionStepUpSession(auth);
  if (!stepUp.ok) return stepUp.response;

  const body = await parseAccountBody(request, VerifyDeletionCodeBodySchema);
  if (!body.ok) return body.response;

  const result = await verifyDeletionChallenge({
    userId: auth.userId,
    sessionId: stepUp.sessionId,
    verifiedEmail: auth.email,
    code: body.data.code,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "invalid_code":
        return NextResponse.json(
          {
            error: "That code isn't right. Check the email and try again.",
            code: "INVALID_CODE",
            attemptsRemaining: result.attemptsRemaining ?? 0,
          },
          { status: 400 },
        );
      case "expired":
        return NextResponse.json(
          { error: "That code has expired. Send a new one.", code: "CODE_EXPIRED" },
          { status: 410 },
        );
      case "locked":
        return NextResponse.json(
          {
            error: "Too many incorrect attempts. Send a new code to try again.",
            code: "TOO_MANY_ATTEMPTS",
          },
          { status: 429 },
        );
      case "no_challenge":
        return NextResponse.json(
          {
            error: "Send a verification code first, then enter it here.",
            code: "NO_ACTIVE_CODE",
          },
          { status: 409 },
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
    authorizationExpiresAt: result.authorizationExpiresAt,
  });
}
