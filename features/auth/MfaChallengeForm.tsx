"use client";

import { useState, type FormEvent } from "react";
import { AccountApiError, verifyMfaChallenge } from "@/lib/api/accounts";

/**
 * Login-time MFA code entry (SEC-3).
 *
 * Posts the 6-digit code to `/api/auth/mfa/verify`; on success the caller's
 * session is elevated to aal2. We then do a FULL navigation to `returnTo` (not a
 * client router push) so the middleware re-reads the fresh aal2 cookie and stops
 * diverting. Wrong codes surface a generic inline error and never lock the field.
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
      setError(
        err instanceof AccountApiError
          ? err.message
          : "Couldn't verify that code. Try again.",
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Authenticator code</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="Authenticator code"
          data-testid="mfa-challenge-code"
          value={code}
          maxLength={7}
          disabled={busy}
          autoFocus
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          className="rounded border border-input bg-background px-3 py-2 tracking-widest"
        />
      </label>
      {error && (
        <p role="alert" data-testid="mfa-challenge-error" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!canSubmit}
        data-testid="mfa-challenge-submit"
        className="rounded bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Verifying…" : "Verify"}
      </button>
    </form>
  );
}
