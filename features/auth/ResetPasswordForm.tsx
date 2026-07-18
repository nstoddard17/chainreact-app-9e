"use client";

import { useActionState } from "react";
import { updatePassword, type AuthActionResult } from "@/app/auth/actions";
import { AuthField } from "./AuthField";
import { AuthFormError, AuthSubmit } from "./AuthControls";

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
 * before the password is set — the client never decides whether MFA applies, it
 * only decides whether to render the input.
 *
 * Restyled to the `Auth.html` handoff (Slice AUTH-DESIGN-1); behaviour unchanged.
 */
export function ResetPasswordForm({ mfaRequired = false }: { mfaRequired?: boolean }) {
  const [state, formAction, pending] = useActionState<AuthActionResult | null, FormData>(
    updatePassword,
    null,
  );

  const showCode = mfaRequired || Boolean(state && !state.ok && state.mfaRequired);

  return (
    <form action={formAction} className="au-fields">
      <AuthField
        label="New password"
        type="password"
        name="password"
        required
        minLength={8}
        autoComplete="new-password"
        reveal
        hint="Use 8 or more characters."
        placeholder="At least 8 characters"
      />
      <AuthField
        label="Confirm new password"
        type="password"
        name="confirm"
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="Re-enter your new password"
      />
      {showCode && (
        <AuthField
          label="Authenticator code"
          type="text"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={7}
          placeholder="123456"
          data-testid="reset-mfa-code"
          fieldClassName="au-inp-code"
          hint="Two-factor is on for this account — enter the current 6-digit code to confirm."
        />
      )}
      {state && !state.ok && <AuthFormError>{state.error}</AuthFormError>}
      <AuthSubmit pending={pending} pendingLabel="Saving…">
        Set new password
      </AuthSubmit>
    </form>
  );
}
