"use client";

import { useActionState } from "react";
import type { AuthActionResult } from "@/app/auth/actions";

type Action = (prev: AuthActionResult | null, formData: FormData) => Promise<AuthActionResult>;

export function AuthForm({
  action,
  submitLabel,
  passwordAutoComplete = "current-password",
  successMessage,
}: {
  action: Action;
  submitLabel: string;
  /** "current-password" for sign-in, "new-password" for sign-up (password managers). */
  passwordAutoComplete?: "current-password" | "new-password";
  /** Shown when the action resolves ok WITHOUT redirecting (e.g. sign-up email confirmation). */
  successMessage?: string;
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
