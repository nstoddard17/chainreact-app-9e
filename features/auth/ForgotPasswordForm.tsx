"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { requestPasswordReset, type AuthActionResult } from "@/app/auth/actions";
import { TurnstileWidget } from "./TurnstileWidget";
import { TURNSTILE_FIELD_NAME } from "@/core/security/turnstile";
import { CAPTCHA_MISCONFIGURED_MESSAGE, useCaptchaMode } from "./useCaptchaMode";
import { AuthHeading } from "./AuthShell";
import { AuthField } from "./AuthField";
import { AuthFormError, AuthSubmit } from "./AuthControls";
import { ChevronLeftGlyph, LockGlyph, MailGlyph } from "./AuthGlyphs";

/**
 * Forgot-password screen (Slice AUTH-DESIGN-1).
 *
 * Owns its heading because the handoff swaps the whole title block between the
 * request state ("Forgot your password?") and the confirmation ("Reset link
 * sent"), including the icon badge.
 *
 * NO USER ENUMERATION: `requestPasswordReset` always resolves `{ok:true}`
 * whether or not the address has an account, and the confirmation copy stays
 * conditional ("If an account exists for …") for the same reason. Echoing back
 * the address the user just typed reveals nothing they didn't supply.
 *
 * Bot protection (SEC-3): the Turnstile token is submitted in the
 * `cf-turnstile-response` field and forwarded to Supabase's `captchaToken`; on a
 * failed attempt the single-use token is cleared and refreshed.
 */
export function ForgotPasswordForm({ serverError }: { serverError?: string } = {}) {
  const [state, formAction, pending] = useActionState<AuthActionResult | null, FormData>(
    requestPasswordReset,
    null,
  );
  const [email, setEmail] = useState("");
  // Holds the confirmed result the user dismissed via "Try a different email",
  // so a LATER success (a new result object) shows the confirmation again.
  const [dismissed, setDismissed] = useState<AuthActionResult | null>(null);

  // Central policy (LOCAL-AUTH-CAPTCHA-BYPASS-1) — see AuthForm for the modes.
  const { captchaRequired, showCaptchaWidget, captchaMisconfigured } = useCaptchaMode();
  const [captchaToken, setCaptchaToken] = useState("");
  const [resetSignal, setResetSignal] = useState(0);
  useEffect(() => {
    if (state && !state.ok) {
      setCaptchaToken("");
      setResetSignal((n) => n + 1);
    }
  }, [state]);

  const confirmed = Boolean(state?.ok) && state !== dismissed;

  return (
    <>
      <Link className="au-back" href="/auth/sign-in">
        <ChevronLeftGlyph size={15} />
        Back to sign in
      </Link>

      <div className="au-badge" aria-hidden>
        {confirmed ? <MailGlyph size={22} /> : <LockGlyph size={22} />}
      </div>

      {confirmed ? (
        <>
          <AuthHeading eyebrow="Check your inbox" title="Reset link sent">
            <span role="status">
              If an account exists for{" "}
              <b className="au-em">{email.trim() || "that email"}</b>, a link to set a new
              password is on its way. Check your inbox — and your spam folder.
            </span>
          </AuthHeading>
          <Link className="au-submit" href="/auth/sign-in">
            Back to sign in
          </Link>
          <p className="au-swap">
            Didn&apos;t get it?
            <button type="button" className="au-swap-btn" onClick={() => setDismissed(state)}>
              Try a different email
            </button>
          </p>
        </>
      ) : (
        <>
          <AuthHeading eyebrow="Password reset" title="Forgot your password?">
            Enter the email for your account and we&apos;ll send you a link to set a new one.
          </AuthHeading>

          {serverError && <AuthFormError>{serverError}</AuthFormError>}

          <form action={formAction} className="au-fields">
            <AuthField
              label="Email"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {/* Bot protection — rendered only when the central policy requires it. */}
            {showCaptchaWidget && (
              <>
                <input type="hidden" name={TURNSTILE_FIELD_NAME} value={captchaToken} readOnly />
                <TurnstileWidget
                  onVerify={setCaptchaToken}
                  onExpire={() => setCaptchaToken("")}
                  resetSignal={resetSignal}
                />
              </>
            )}
            {/* Required but no site key: fail visibly, never silently skip the check. */}
            {captchaMisconfigured && (
              <AuthFormError>{CAPTCHA_MISCONFIGURED_MESSAGE}</AuthFormError>
            )}

            {state && !state.ok && <AuthFormError>{state.error}</AuthFormError>}

            <AuthSubmit
              pending={pending}
              pendingLabel="Sending…"
              disabled={captchaRequired && (captchaMisconfigured || captchaToken.length === 0)}
            >
              Send reset link
            </AuthSubmit>
          </form>

          <p className="au-swap">
            Remembered it?
            <Link className="au-swap-btn" href="/auth/sign-in">
              Sign in
            </Link>
          </p>
        </>
      )}
    </>
  );
}
