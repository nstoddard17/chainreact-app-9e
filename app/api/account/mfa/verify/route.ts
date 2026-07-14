import { NextResponse } from "next/server";
import {
  requireAuthedUserId,
  parseAccountBody,
  MfaVerifyBodySchema,
} from "@/app/api/account/_shared";
import { confirmTotpEnrollment } from "@/services/accounts/mfa";

/**
 * POST /api/account/mfa/verify — confirm a TOTP enrollment (SEC-3).
 *
 * The user submits the first 6-digit code from their authenticator; a correct
 * code marks the factor verified AND elevates the session to aal2. A wrong/expired
 * code changes nothing (fail-safe) and returns a generic 400 — the code is never
 * echoed or logged.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const body = await parseAccountBody(request, MfaVerifyBodySchema);
  if (!body.ok) return body.response;

  const result = await confirmTotpEnrollment(body.data.factorId, body.data.code);
  if (!result.ok) {
    return NextResponse.json(
      { error: "That code didn't match. Try the current code from your app.", code: "INVALID_CODE" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  console.info(JSON.stringify({ event: "account.mfa.enabled" }));

  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
