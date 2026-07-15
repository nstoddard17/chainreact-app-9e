"use client";

import { useActionState } from "react";
import { updatePassword, type AuthActionResult } from "@/app/auth/actions";

/**
 * Reset-password form (set a new password). Runs against the recovery session
 * established by `/auth/callback`; on success `updatePassword` redirects, so
 * there is no success state to render here — only validation/error feedback.
 *
 * MFA step-up (SEC-3): when the recovery session is AAL1 and the user has enrolled
 * TOTP, Supabase refuses the password update until the session is AAL2. The
 * authenticator-code field is shown when `mfaRequired` is known up front (page
 * server check) OR when the action reports it needs the code
 * (`state.mfaRequired`). The submitted code is used server-side to elevate to AAL2
 * before the password is set.
 */
export function ResetPasswordForm({ mfaRequired = false }: { mfaRequired?: boolean }) {
  const [state, formAction, pending] = useActionState<AuthActionResult | null, FormData>(
    updatePassword,
    null,
  );

  const showCode = mfaRequired || Boolean(state && !state.ok && state.mfaRequired);

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
      {showCode && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Authenticator code</span>
          <input
            type="text"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={7}
            data-testid="reset-mfa-code"
            className="rounded border border-input bg-background px-3 py-2 tracking-widest"
          />
          <span className="text-xs text-muted-foreground">
            Two-factor is on for this account — enter the current 6-digit code to confirm.
          </span>
        </label>
      )}
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
