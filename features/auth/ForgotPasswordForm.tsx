"use client";

import { useActionState, useEffect, useState } from "react";
import { requestPasswordReset, type AuthActionResult } from "@/app/auth/actions";
import { TurnstileWidget } from "./TurnstileWidget";
import { TURNSTILE_FIELD_NAME, isTurnstileWidgetConfigured } from "@/services/security/turnstile";

/**
 * Forgot-password form. On success shows a NEUTRAL confirmation (no user
 * enumeration — same copy whether or not the email has an account).
 *
 * Bot protection (SEC-3): the Turnstile token is submitted in the
 * `cf-turnstile-response` field and forwarded to Supabase's `captchaToken`; on a
 * failed attempt the single-use token is cleared and refreshed.
 */
export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<AuthActionResult | null, FormData>(
    requestPasswordReset,
    null,
  );

  const captchaConfigured = isTurnstileWidgetConfigured();
  const [captchaToken, setCaptchaToken] = useState("");
  const [resetSignal, setResetSignal] = useState(0);
  useEffect(() => {
    if (state && !state.ok) {
      setCaptchaToken("");
      setResetSignal((n) => n + 1);
    }
  }, [state]);

  if (state?.ok) {
    return (
      <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
        If an account exists for that email, we&apos;ve sent a password reset link.
        Check your inbox (and spam).
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full max-w-sm">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="rounded border border-input bg-background px-3 py-2"
        />
      </label>
      {/* Bot protection — renders only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. */}
      {captchaConfigured && (
        <>
          <input type="hidden" name={TURNSTILE_FIELD_NAME} value={captchaToken} readOnly />
          <TurnstileWidget
            onVerify={setCaptchaToken}
            onExpire={() => setCaptchaToken("")}
            resetSignal={resetSignal}
          />
        </>
      )}
      {state && !state.ok && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || (captchaConfigured && captchaToken.length === 0)}
        className="rounded bg-primary text-primary-foreground px-4 py-2 font-medium disabled:opacity-60"
      >
        {pending ? "..." : "Send reset link"}
      </button>
    </form>
  );
}
