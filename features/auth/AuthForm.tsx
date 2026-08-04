"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import type { AuthActionResult } from "@/app/auth/actions";
import { TurnstileWidget } from "./TurnstileWidget";
import { TURNSTILE_FIELD_NAME } from "@/core/security/turnstile";
import { useCaptchaMode } from "./useCaptchaMode";
import { AuthField } from "./AuthField";
import { AuthFormError, AuthFormStatus, AuthSubmit } from "./AuthControls";

type Action = (prev: AuthActionResult | null, formData: FormData) => Promise<AuthActionResult>;

/**
 * Email + password form shared by sign-in and sign-up.
 *
 * Restyled to the `Auth.html` handoff (Slice AUTH-DESIGN-1); the behaviour is
 * unchanged — same server actions, same hidden `returnTo`, same Turnstile
 * token handling, same success/error branches.
 */
export function AuthForm({
  action,
  submitLabel,
  pendingLabel,
  passwordAutoComplete = "current-password",
  passwordHint,
  forgotPasswordHref,
  successMessage,
  returnTo,
}: {
  action: Action;
  submitLabel: string;
  /** Label while the submit is in flight. */
  pendingLabel: string;
  /** "current-password" for sign-in, "new-password" for sign-up (password managers). */
  passwordAutoComplete?: "current-password" | "new-password";
  /** Helper text under the password field (sign-up states the length rule). */
  passwordHint?: string;
  /** When set, renders the "Forgot password?" link on the password label row. */
  forgotPasswordHref?: string;
  /** Shown when the action resolves ok WITHOUT redirecting (e.g. sign-up email confirmation). */
  successMessage?: string;
  /**
   * ANON-BUILDER-2 — same-origin path to return to after auth (e.g.
   * /start/continue to restore an anonymous draft). Submitted as a hidden field;
   * the server action sanitizes it.
   */
  returnTo?: string;
}) {
  const [state, formAction, pending] = useActionState<AuthActionResult | null, FormData>(
    action,
    null,
  );

  // Bot protection (SEC-3). The Turnstile token is captured from the widget and
  // submitted in the `cf-turnstile-response` field, which the server action
  // forwards to Supabase's `captchaToken`. A Turnstile token is single-use, so on
  // a failed submit (Supabase redeemed it) we clear it and force a fresh one.
  // The email is controlled so a rejected submit doesn't wipe it — React resets
  // uncontrolled inputs when the action resolves, and retyping the address after
  // a typo'd password is needless friction. The PASSWORD is deliberately left
  // uncontrolled: it is cleared on every failed attempt and never persisted.
  const [email, setEmail] = useState("");

  // Central policy (LOCAL-AUTH-CAPTCHA-BYPASS-1): required environments render
  // the widget and gate the submit on a real token; disabled environments
  // (local loopback dev, hosted v2-dev) render no widget and submit no token
  // field at all; required-but-unconfigured fails visibly instead of bypassing.
  const { captchaRequired, showCaptchaWidget, captchaMisconfigured, captchaMisconfiguredMessage } =
    useCaptchaMode();
  const [captchaToken, setCaptchaToken] = useState("");
  const [resetSignal, setResetSignal] = useState(0);
  useEffect(() => {
    if (state && !state.ok) {
      setCaptchaToken("");
      setResetSignal((n) => n + 1);
    }
  }, [state]);

  // An ok result that didn't redirect (sign-up with email confirmation pending).
  if (state?.ok && successMessage) {
    return <AuthFormStatus>{successMessage}</AuthFormStatus>;
  }

  return (
    <form action={formAction} className="au-fields">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

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

      <AuthField
        label="Password"
        type="password"
        name="password"
        required
        minLength={8}
        autoComplete={passwordAutoComplete}
        reveal
        {...(passwordHint ? { hint: passwordHint } : {})}
        {...(forgotPasswordHref
          ? {
              extra: (
                <Link className="au-fld-link" href={forgotPasswordHref}>
                  Forgot password?
                </Link>
              ),
            }
          : {})}
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
      {captchaMisconfiguredMessage && <AuthFormError>{captchaMisconfiguredMessage}</AuthFormError>}

      {state && !state.ok && <AuthFormError>{state.error}</AuthFormError>}

      <AuthSubmit
        pending={pending}
        pendingLabel={pendingLabel}
        disabled={captchaRequired && (captchaMisconfigured || captchaToken.length === 0)}
      >
        {submitLabel}
      </AuthSubmit>
    </form>
  );
}
