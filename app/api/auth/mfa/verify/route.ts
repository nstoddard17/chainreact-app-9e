import { NextResponse } from "next/server";
import {
  requireAuthedUserId,
  parseAccountBody,
  MfaChallengeBodySchema,
} from "@/app/api/account/_shared";
import { verifyLoginChallenge } from "@/services/accounts/mfa";

/**
 * POST /api/auth/mfa/verify — satisfy the login-time MFA challenge (SEC-3).
 *
 * Reachable at aal1 (this IS the step that elevates to aal2) but still requires an
 * authenticated session — a caller with no session gets 401, so this is not a
 * public surface. A correct code elevates the caller's session to aal2 (the
 * middleware then stops diverting them to the challenge page). Wrong/expired codes
 * fail safe with a generic 400; the code is never echoed or logged.
 *
 * Kept under /api/auth/mfa (not /api/account) so the middleware aal1 allow-list can
 * whitelist it by prefix without opening the account surface.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const body = await parseAccountBody(request, MfaChallengeBodySchema);
  if (!body.ok) return body.response;

  const result = await verifyLoginChallenge(body.data.code);
  if (!result.ok) {
    if (result.reason === "not_enrolled") {
      // No verified factor → nothing to challenge. Treat as satisfied so the user
      // isn't trapped (the middleware would not have diverted them anyway).
      return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json(
      { error: "That code didn't match. Try the current code from your app.", code: "INVALID_CODE" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  console.info(JSON.stringify({ event: "auth.mfa.challenge_passed" }));

  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
