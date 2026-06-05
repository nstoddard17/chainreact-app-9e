import { createClient } from "@/utils/supabase/server";

/**
 * Password update for the authenticated session user (4.ACCOUNT-SETTINGS-7 / SEC-2).
 *
 * Owns the single `auth.updateUser({ password })` call. Uses the SSR **session**
 * client (cookie-bound) — NOT a service-role admin update — so the password is
 * only ever changed for the caller's own logged-in identity. The current-password
 * step-up is performed separately by the service via `verifyPasswordReauth`
 * BEFORE this runs; this repo does not re-check it.
 *
 * Returns a boolean: true on success, false on any Supabase error. Never logs or
 * returns the password.
 */
export async function updateSessionUserPassword(
  newPassword: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return !error;
}
