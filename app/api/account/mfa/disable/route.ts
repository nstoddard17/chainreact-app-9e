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
 * Follows Supabase's security model: unenrolling a verified factor requires an
 * **AAL2** session. This route does NOT require the account password (that breaks
 * OAuth/SSO users and isn't Supabase's gate). Gate order: auth → validate → the
 * service enforces AAL2 (or steps up with the submitted authenticator code) →
 * remove every factor.
 *
 * Outcomes:
 *   - already AAL2 (common — the middleware forces AAL2 to reach this page) → 200.
 *   - AAL1 + no code → 403 `MFA_REQUIRED` (the client then prompts for a code).
 *   - AAL1 + wrong code → 400 `INVALID_CODE`.
 * The code is never logged. Self-scoped: factors are the caller's own.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const body = await parseAccountBody(request, MfaDisableBodySchema);
  if (!body.ok) return body.response;

  const result = await disableTotp({ code: body.data.code ?? null });
  if (!result.ok) {
    if (result.reason === "mfa_required") {
      return NextResponse.json(
        {
          error: "Enter the 6-digit code from your authenticator app to turn off two-factor.",
          code: "MFA_REQUIRED",
        },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
    if (result.reason === "invalid_code") {
      return NextResponse.json(
        { error: "That code didn't match. Try the current code from your app.", code: "INVALID_CODE" },
        { status: 400, headers: { "cache-control": "no-store" } },
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
