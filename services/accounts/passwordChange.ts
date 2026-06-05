import { verifyPasswordReauth } from "@/services/accounts/accountDeletionReauth";
import { updateSessionUserPassword } from "@/repositories/authPassword";

/**
 * Password-change service (4.ACCOUNT-SETTINGS-7 / SEC-2).
 *
 * Owns the ORDER and the rules for a self-serve password change:
 *   1. validate the new password (min length; must differ from current)
 *   2. step-up: verify the CURRENT password via the canonical
 *      `verifyPasswordReauth` (the same throwaway-client check delete + transfer
 *      use — we do NOT add a second re-auth path)
 *   3. only then update the password on the caller's SESSION client.
 *
 * Self-scoped: `email` comes from the verified session (the route passes
 * `auth.email`), never from request input, and the update runs on the session
 * client — so a caller can only ever change their own password. Never logs or
 * returns the password. The failing factor (email vs current password) is never
 * distinguished — both surface as `reauth_failed`.
 */

/** Minimum new-password length. Mirrored by the route Zod + the UI guard. */
export const MIN_PASSWORD_LENGTH = 8;

export type ChangePasswordReason = "validation" | "reauth_failed" | "update_failed";

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: ChangePasswordReason };

export async function changeOwnPassword(input: {
  email: string | null;
  currentPassword: string;
  newPassword: string;
}): Promise<ChangePasswordResult> {
  const { email, currentPassword, newPassword } = input;

  // Defensive validation (the route Zod is the typed boundary; this asserts the
  // floor even if the service is called directly).
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: "validation" };
  }
  if (newPassword === currentPassword) {
    return { ok: false, reason: "validation" };
  }

  // Step-up: re-prove the current password before mutating it. On failure we do
  // NOT touch the password.
  const reauth = await verifyPasswordReauth(email, currentPassword);
  if (!reauth.ok) {
    return { ok: false, reason: "reauth_failed" };
  }

  const updated = await updateSessionUserPassword(newPassword);
  if (!updated) {
    return { ok: false, reason: "update_failed" };
  }

  return { ok: true };
}
