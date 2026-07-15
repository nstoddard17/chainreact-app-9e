"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { safeReturnPath } from "@/lib/safeReturnPath";
import { readCaptchaToken } from "@/services/security/turnstile";

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
  | { ok: false; error: string; mfaRequired?: boolean };

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

export async function signUp(_prev: AuthActionResult | null, formData: FormData): Promise<AuthActionResult> {
  const creds = readCredentials(formData);
  if ("error" in creds) return { ok: false, error: creds.error };
  // Bot protection (SEC-3): the Turnstile token is forwarded to Supabase, which
  // verifies it server-side when captcha protection is enabled for the project.
  // Undefined when the widget isn't configured (dev) — Supabase then requires no
  // token. We never redeem it ourselves (single-use).
  const captchaToken = readCaptchaToken(formData);
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
      captchaToken,
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
  // Bot protection (SEC-3): forward the Turnstile token to Supabase for
  // server-side verification (see signUp). Never redeemed app-side.
  const captchaToken = readCaptchaToken(formData);
  const returnTo = safeReturnPath(
    typeof formData.get("returnTo") === "string" ? (formData.get("returnTo") as string) : null,
  );
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    ...creds,
    options: { captchaToken },
  });
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
  // Bot protection (SEC-3): forward the Turnstile token to Supabase (see signUp).
  const captchaToken = readCaptchaToken(formData);
  const supabase = await createClient();
  const origin = await resolveOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
    captchaToken,
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

/** Read + normalize the optional TOTP code from the reset form (6 digits, spaces trimmed). */
function readTotpCode(formData: FormData): string | null {
  const raw = formData.get("code");
  if (typeof raw !== "string") return null;
  const code = raw.replace(/\s+/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

/**
 * Reset-password: set a new password. Requires the recovery session that
 * `/auth/callback` established from the emailed link — if there is no session
 * (link expired/invalid, or page opened directly), we refuse and tell the user
 * to request a fresh link rather than failing opaquely.
 *
 * MFA step-up (SEC-3): Supabase refuses a password update on an AAL1 session when
 * the user has enrolled MFA ("AAL2 session is required…"). The emailed recovery
 * link only establishes AAL1. So when the user has a verified TOTP factor and the
 * session isn't already AAL2, we require the current authenticator code, elevate
 * the session to AAL2 via Supabase's MFA API **on this same client** (so the
 * elevated token is the one that performs the update), and only then update the
 * password. We never bypass the AAL2 requirement — a missing/invalid code stops
 * the update and re-prompts. The code is never logged.
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

  // Authoritative factor list comes from getUser (not the cached session), so we
  // don't miss a factor the recovery session object didn't carry.
  const verifiedTotp = (user.factors ?? []).find(
    (f) => f.status === "verified" && f.factor_type === "totp",
  );
  if (verifiedTotp) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") {
      const code = readTotpCode(formData);
      if (!code) {
        return {
          ok: false,
          error: "Enter the 6-digit code from your authenticator app to set a new password.",
          mfaRequired: true,
        };
      }
      const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: verifiedTotp.id,
        code,
      });
      if (mfaError) {
        return {
          ok: false,
          error: "That code didn't match. Try the current code from your app.",
          mfaRequired: true,
        };
      }
    }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.password });
  if (error) return { ok: false, error: error.message };
  redirect("/workflows");
}
