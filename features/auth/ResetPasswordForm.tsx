"use client";

import { useActionState } from "react";
import { updatePassword, type AuthActionResult } from "@/app/auth/actions";

/**
 * Reset-password form (set a new password). Runs against the recovery session
 * established by `/auth/callback`; on success `updatePassword` redirects, so
 * there is no success state to render here — only validation/error feedback.
 */
export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState<AuthActionResult | null, FormData>(
    updatePassword,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full max-w-sm">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">New password</span>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded border border-input bg-background px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Confirm new password</span>
        <input
          type="password"
          name="confirm"
          required
          minLength={8}
          autoComplete="new-password"
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
        {pending ? "..." : "Set new password"}
      </button>
    </form>
  );
}
