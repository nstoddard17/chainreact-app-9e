import { NextResponse } from "next/server";
import {
  requireAuthedUserId,
  parseAccountBody,
  MfaDisableBodySchema,
} from "@/app/api/account/_shared";
import { disableTotp } from "@/services/accounts/mfa";

/**
 * POST /api/account/mfa/disable — turn OFF two-factor for the caller (SEC-3).
 *
 * Gate order: auth → validate → current-password step-up (`verifyPasswordReauth`,
 * the same re-auth delete/transfer/password-change use) → remove every TOTP
 * factor. The step-up on top of the already-elevated (aal2) session defends
 * against an unattended machine. A wrong password is a generic `REAUTH_FAILED`
 * (the failing factor is never disclosed); the password is never logged.
 *
 * Self-scoped: the email comes from the verified session (never the body) and the
 * factors are the caller's own, so a caller can only ever disable their own MFA.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const body = await parseAccountBody(request, MfaDisableBodySchema);
  if (!body.ok) return body.response;

  const result = await disableTotp({ email: auth.email, password: body.data.password });
  if (!result.ok) {
    if (result.reason === "reauth_failed") {
      return NextResponse.json(
        { error: "Password confirmation failed.", code: "REAUTH_FAILED" },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
    if (result.reason === "not_enrolled") {
      return NextResponse.json(
        { error: "Two-factor authentication isn't on.", code: "NOT_ENROLLED" },
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "Couldn't turn off two-factor. Please try again.", code: "DISABLE_FAILED" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }

  console.info(JSON.stringify({ event: "account.mfa.disabled" }));

  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
