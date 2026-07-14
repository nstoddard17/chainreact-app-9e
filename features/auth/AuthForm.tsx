"use client";

import { useActionState } from "react";
import type { AuthActionResult } from "@/app/auth/actions";
import { TurnstileWidget } from "./TurnstileWidget";

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
      <TurnstileWidget />
      {state && !state.ok && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-primary text-primary-foreground px-4 py-2 font-medium disabled:opacity-60"
      >
        {pending ? "..." : submitLabel}
      </button>
    </form>
  );
}
