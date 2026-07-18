"use client";

import { useState, type FormEvent } from "react";
import { AccountApiError, verifyMfaChallenge } from "@/lib/api/accounts";
import { AuthField } from "./AuthField";
import { AuthFormError, AuthSubmit } from "./AuthControls";

/**
 * Login-time MFA code entry (SEC-3).
 *
 * Posts the 6-digit code to `/api/auth/mfa/verify`; on success the caller's
 * session is elevated to aal2. We then do a FULL navigation to `returnTo` (not a
 * client router push) so the middleware re-reads the fresh aal2 cookie and stops
 * diverting. Wrong codes surface a generic inline error and never lock the field.
 *
 * Restyled to the `Auth.html` handoff (Slice AUTH-DESIGN-1); behaviour unchanged.
 */
export function MfaChallengeForm({ returnTo }: { returnTo: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !busy && /^\d{6}$/.test(code.replace(/\s+/g, ""));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await verifyMfaChallenge(code.replace(/\s+/g, ""));
      // Full navigation so middleware sees the elevated session.
      window.location.assign(returnTo);
    } catch (err) {
      setError(err instanceof AccountApiError ? err.message : "Couldn't verify that code. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="au-fields">
      <AuthField
        label="Authenticator code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        data-testid="mfa-challenge-code"
        value={code}
        maxLength={7}
        disabled={busy}
        autoFocus
        placeholder="123456"
        fieldClassName="au-inp-code"
        onChange={(e) => {
          setCode(e.target.value);
          setError(null);
        }}
      />
      {error && <AuthFormError data-testid="mfa-challenge-error">{error}</AuthFormError>}
      <AuthSubmit
        pending={busy}
        pendingLabel="Verifying…"
        disabled={!canSubmit}
        data-testid="mfa-challenge-submit"
      >
        Verify
      </AuthSubmit>
    </form>
  );
}
