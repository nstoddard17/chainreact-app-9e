"use client";

import { useActionState, useEffect, useState } from "react";
import type { AuthActionResult } from "@/app/auth/actions";
import { TurnstileWidget } from "./TurnstileWidget";
import { TURNSTILE_FIELD_NAME, isTurnstileWidgetConfigured } from "@/services/security/turnstile";

type Action = (prev: AuthActionResult | null, formData: FormData) => Promise<AuthActionResult>;

export function AuthForm({
  action,
  submitLabel,
  passwordAutoComplete = "current-password",
  successMessage,
  returnTo,
}: {
  action: Action;
  submitLabel: string;
  /** "current-password" for sign-in, "new-password" for sign-up (password managers). */
  passwordAutoComplete?: "current-password" | "new-password";
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
  const captchaConfigured = isTurnstileWidgetConfigured();
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
    return (
      <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
        {successMessage}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full max-w-sm">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
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
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Password</span>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete={passwordAutoComplete}
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
        {pending ? "..." : submitLabel}
      </button>
    </form>
  );
}
