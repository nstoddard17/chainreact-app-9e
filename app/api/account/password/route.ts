import { NextResponse } from "next/server";
import {
  requireAuthedUserId,
  parseAccountBody,
  ChangePasswordBodySchema,
} from "@/app/api/account/_shared";
import { changeOwnPassword } from "@/services/accounts/passwordChange";

/**
 * PATCH /api/account/password — change the caller's OWN password
 * (4.ACCOUNT-SETTINGS-7 / SEC-2).
 *
 * Self-scoped: the email comes from the verified session (never the body), and
 * the update runs on the SESSION client (no service-role admin update). Gate
 * order: auth → validate → current-password step-up (`verifyPasswordReauth`,
 * the shared re-auth) → `auth.updateUser`. The failing factor (email vs current
 * password) is never disclosed — a wrong current password is a generic
 * `REAUTH_FAILED`. Never logs or returns the password.
 */
export async function PATCH(request: Request): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const body = await parseAccountBody(request, ChangePasswordBodySchema);
  if (!body.ok) return body.response;

  const result = await changeOwnPassword({
    email: auth.email,
    currentPassword: body.data.currentPassword,
    newPassword: body.data.newPassword,
  });

  if (!result.ok) {
    if (result.reason === "reauth_failed") {
      return NextResponse.json(
        { error: "Password confirmation failed.", code: "REAUTH_FAILED" },
        { status: 401 },
      );
    }
    if (result.reason === "validation") {
      return NextResponse.json(
        { error: "That password can't be used. Try a different one.", code: "VALIDATION" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Couldn't update your password. Please try again.", code: "PASSWORD_UPDATE_FAILED" },
      { status: 500 },
    );
  }

  console.info(
    JSON.stringify({
      event: "account.password.changed",
      // No user content, no password — lifecycle bookkeeping only.
    }),
  );

  return NextResponse.json({ ok: true });
}
