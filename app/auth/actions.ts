"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { safeReturnPath } from "@/lib/safeReturnPath";
import { verifyTurnstileToken, TURNSTILE_FIELD_NAME } from "@/services/security/turnstile";

/**
 * Auth server actions.
 *
 * Email + password is the floor; Google SSO is a separate button. Each action
 * returns a typed result so the form can render the user-facing message per
 * testing-strategy.md §6 (a user-facing message matters, not just a thrown
 * exception). Password reset is driven entirely through Supabase Auth's
 * recovery flow — we never mint or handle reset tokens ourselves.
 */

export type AuthActionResult =
  | { ok: true; confirmationRequired?: boolean }
  | { ok: false; error: string };

function readCredentials(formData: FormData): { email: string; password: string } | { error: string } {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "Email and password are required." };
  }
  if (email.trim().length === 0 || password.length === 0) {
    return { error: "Email and password are required." };
  }
  return { email: email.trim(), password };
}

/**
 * Resolve the request origin so Supabase recovery emails redirect back to the
 * SAME deployment that issued them (prod vs preview vs localhost) — never a
 * hard-coded host. Falls back to the configured site URL.
 */
async function resolveOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/**
 * Bot-protection gate for the public auth surfaces (SEC-3). Reads the Turnstile
 * token from the submitted form and verifies it server-side. When Turnstile is
 * not configured (no secret) this is a no-op that returns ok, so dev/test are
 * untouched; when configured it is fail-closed. The client remote IP (best-effort
 * from `x-forwarded-for`) is passed to Cloudflare for extra signal. The token is
 * never logged. A failure surfaces the SAME neutral message on every surface — it
 * carries no account signal, so it does not weaken the reset flow's
 * no-enumeration guarantee.
 */
async function verifyBotProtection(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = formData.get(TURNSTILE_FIELD_NAME);
  const h = await headers();
  const remoteIp = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const result = await verifyTurnstileToken(typeof token === "string" ? token : null, remoteIp);
  if (!result.ok) {
    return { ok: false, error: "Couldn't verify you're human. Please try again." };
  }
  return { ok: true };
}

export async function signUp(_prev: AuthActionResult | null, formData: FormData): Promise<AuthActionResult> {
  const creds = readCredentials(formData);
  if ("error" in creds) return { ok: false, error: creds.error };
  const captcha = await verifyBotProtection(formData);
  if (!captcha.ok) return { ok: false, error: captcha.error };
  // ANON-BUILDER-2 — same-origin destination after auth (e.g. /start/continue to
  // restore an anonymous draft). Sanitized; defaults to /workflows.
  const returnTo = safeReturnPath(
    typeof formData.get("returnTo") === "string" ? (formData.get("returnTo") as string) : null,
  );
  const supabase = await createClient();
  const origin = await resolveOrigin();
  // When email confirmation is ON the user returns via the email link; forward
  // them to the returnTo (anon-draft restore) when present, else the confirmed
  // screen. safeReturnPath already guarantees a same-origin path.
  const emailNext = returnTo === "/workflows" ? "/auth/confirmed" : returnTo;
  const { data, error } = await supabase.auth.signUp({
    email: creds.email,
    password: creds.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(emailNext)}`,
    },
  });
  if (error) return { ok: false, error: error.message };
  // When "Confirm email" is ON in Supabase Auth, signUp returns NO session —
  // the user must click the email link first. Surface a "check your email"
  // state instead of redirecting them into a protected route they can't reach.
  // When confirmation is OFF, a session exists and we send them to the app.
  if (!data?.session) {
    return { ok: true, confirmationRequired: true };
  }
  redirect(returnTo);
}

export async function signIn(_prev: AuthActionResult | null, formData: FormData): Promise<AuthActionResult> {
  const creds = readCredentials(formData);
  if ("error" in creds) return { ok: false, error: creds.error };
  const captcha = await verifyBotProtection(formData);
  if (!captcha.ok) return { ok: false, error: captcha.error };
  const returnTo = safeReturnPath(
    typeof formData.get("returnTo") === "string" ? (formData.get("returnTo") as string) : null,
  );
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(creds);
  if (error) return { ok: false, error: error.message };
  redirect(returnTo);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/**
 * Forgot-password: send a Supabase recovery email. The link lands on
 * `/auth/callback` (which exchanges the recovery code for a session) and then
 * forwards to `/auth/reset-password`.
 *
 * NO USER ENUMERATION: the response is the SAME neutral success whether or not
 * the address has an account, so the form can't be used as an account oracle.
 * Provider/network errors are logged server-side only.
 */
export async function requestPasswordReset(
  _prev: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  const email = formData.get("email");
  if (typeof email !== "string" || email.trim().length === 0) {
    return { ok: false, error: "Email is required." };
  }
  const captcha = await verifyBotProtection(formData);
  if (!captcha.ok) return { ok: false, error: captcha.error };
  const supabase = await createClient();
  const origin = await resolveOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
  });
  if (error) {
    console.warn(
      JSON.stringify({ event: "auth.password_reset.error", message: error.message }),
    );
  }
  return { ok: true };
}

function readNewPassword(formData: FormData): { password: string } | { error: string } {
  const password = formData.get("password");
  const confirm = formData.get("confirm");
  if (typeof password !== "string" || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }
  return { password };
}

/**
 * Reset-password: set a new password. Requires the recovery session that
 * `/auth/callback` established from the emailed link — if there is no session
 * (link expired/invalid, or page opened directly), we refuse and tell the user
 * to request a fresh link rather than failing opaquely.
 */
export async function updatePassword(
  _prev: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = readNewPassword(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your reset link is invalid or has expired. Request a new one." };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.password });
  if (error) return { ok: false, error: error.message };
  redirect("/workflows");
}
