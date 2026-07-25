"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccountDeletionError,
  requestAccountDeletion,
  sendAccountDeletionCode,
  verifyAccountDeletionCode,
  type DeletionStatusResult,
  type OwnedAccountSummary,
} from "@/lib/api/accounts";
import { Button } from "@/components/ui/button";

/**
 * Universal account-deletion confirmation
 * (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * ONE flow for every account, regardless of how the user signed in — password,
 * Google, email OTP, or several linked identities. There is deliberately NO
 * password field, NO provider detection, and NO provider-specific button here:
 * the component never asks how the user authenticated, because the answer would
 * not change anything it renders. That is what makes the flow universal, and it
 * is why a Google-only user can finally delete their account at all.
 *
 * Three steps, in order:
 *   1. Send a six-digit code to the verified address already on the account. The
 *      user does not type an address — the server decides where it goes and we
 *      only ever display the MASKED result it returns.
 *   2. Enter the code. Wrong / expired / locked states are shown explicitly, with
 *      the remaining attempts, so the user is never guessing at why it failed.
 *   3. Type the exact word DELETE and confirm. Verification alone deletes
 *      nothing — the deliberate final act is still required.
 *
 * The code lives in component state and nowhere else: it is never written to a
 * URL, storage, or a log, and it is cleared as soon as it is spent or the panel
 * closes. Nothing here reveals whether any other address exists.
 *
 * Accessibility: every input is labelled, send/verify outcomes are announced via
 * `aria-live` regions, the code field takes a paste (and accepts the spaced or
 * dashed forms mail clients produce), and focus moves to the field the user must
 * fill next as the flow advances.
 */

/** The literal word the user must type. Mirrors the backend `DELETION_CONFIRM_PHRASE`. */
export const CONFIRM_WORD = "DELETE";

type Step = "idle" | "code_sent" | "verified";

function secondsUntil(iso: string | null, now: number): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - now;
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

export function AccountDeletionVerification({
  onDeleted,
  onBlocked,
  onCancel,
}: {
  /** Deletion scheduled (or partially — billing failed). Carries the real state. */
  onDeleted: (result: DeletionStatusResult, billingError: string | null) => void;
  /** The user still owns Team/Business accounts — render the remediation blocker. */
  onBlocked: (accounts: readonly OwnedAccountSummary[]) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [confirmText, setConfirmText] = useState("");
  /** Announced in the polite region — "code sent", "verified". */
  const [status, setStatus] = useState<string | null>(null);
  /** Announced in the assertive region — every failure the user must act on. */
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const codeRef = useRef<HTMLInputElement | null>(null);
  const confirmRef = useRef<HTMLInputElement | null>(null);

  const resendIn = secondsUntil(resendAt, now);

  // Drive the resend countdown. Only ticks while a countdown is actually
  // pending, so an idle panel schedules no work.
  useEffect(() => {
    if (!resendAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resendAt]);

  // Never leave a code behind in memory once the panel goes away.
  useEffect(() => () => setCode(""), []);

  const describe = useCallback((err: unknown, fallback: string): string => {
    if (err instanceof AccountDeletionError) return err.message;
    return fallback;
  }, []);

  async function sendCode() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const sent = await sendAccountDeletionCode();
      setMaskedEmail(sent.maskedEmail);
      setResendAt(sent.resendAvailableAt);
      setNow(Date.now());
      setStep("code_sent");
      setCode("");
      setStatus(`We sent a 6-digit code to ${sent.maskedEmail}. It expires in 10 minutes.`);
      // Move the user straight to the box they now have to fill.
      window.setTimeout(() => codeRef.current?.focus(), 0);
    } catch (err) {
      if (err instanceof AccountDeletionError && err.code === "RESEND_TOO_SOON") {
        // Not really a failure — re-arm the countdown from the server's answer.
        setResendAt(
          new Date(Date.now() + (err.retryAfterSeconds ?? 60) * 1000).toISOString(),
        );
        setNow(Date.now());
      }
      setError(describe(err, "We couldn't send the code. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    if (code.trim().length === 0) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await verifyAccountDeletionCode(code);
      setStep("verified");
      setCode("");
      setStatus("Code verified. Type DELETE to finish deleting your account.");
      window.setTimeout(() => confirmRef.current?.focus(), 0);
    } catch (err) {
      if (err instanceof AccountDeletionError) {
        if (err.code === "CODE_EXPIRED" || err.code === "TOO_MANY_ATTEMPTS") {
          // Both are terminal for THIS code: the only way forward is a new one.
          setStep("code_sent");
          setResendAt(null);
          setCode("");
        }
      }
      setError(describe(err, "We couldn't check that code. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (confirmText !== CONFIRM_WORD) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await requestAccountDeletion({ confirmText });
      setCode("");
      setConfirmText("");
      onDeleted(result, null);
    } catch (err) {
      if (err instanceof AccountDeletionError) {
        if (err.code === "ACCOUNT_HAS_OWNED_TEAMS") {
          onBlocked(err.ownedAccounts ?? []);
          return;
        }
        if (err.code === "BILLING_CANCELLATION_FAILED" && err.deletionState) {
          // Partial success: the account IS frozen. Hand the truth upward so the
          // card can show the pending state and the billing warning together.
          setCode("");
          setConfirmText("");
          onDeleted(err.deletionState, err.message);
          return;
        }
        if (err.code === "VERIFICATION_REQUIRED") {
          // The authorization was spent or expired — restart at "send a code".
          setStep("idle");
          setResendAt(null);
          setConfirmText("");
        }
      }
      setError(describe(err, "Couldn't request deletion. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="account-delete-form"
      className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
    >
      {/* Polite: progress the user asked for. Assertive: things they must fix. */}
      <p
        data-testid="account-delete-status"
        role="status"
        aria-live="polite"
        className="text-xs text-muted-foreground empty:hidden"
      >
        {status ?? ""}
      </p>

      {step === "idle" && (
        <>
          <p className="text-xs text-muted-foreground">
            To confirm it&apos;s really you, we&apos;ll email a 6-digit code to the verified
            address on your account. This works the same however you sign in — with a
            password, with Google, or with an email code.
          </p>
          <div>
            <Button
              type="button"
              size="sm"
              data-testid="account-delete-send-code"
              disabled={busy}
              onClick={sendCode}
            >
              {busy ? "Sending code…" : "Send verification code"}
            </Button>
          </div>
        </>
      )}

      {step === "code_sent" && (
        <>
          <p className="text-xs text-muted-foreground">
            Enter the 6-digit code we sent to{" "}
            <span data-testid="account-delete-masked-email" className="font-medium text-foreground">
              {maskedEmail}
            </span>
            .
          </p>
          <label
            htmlFor="account-delete-code"
            className="flex flex-col gap-1 text-xs font-medium text-foreground"
          >
            Verification code
            <input
              id="account-delete-code"
              ref={codeRef}
              type="text"
              inputMode="numeric"
              // Lets password managers and iOS/Android offer the code straight
              // from the email, and makes a paste of "123 456" work unchanged.
              autoComplete="one-time-code"
              maxLength={16}
              aria-label="Verification code"
              aria-describedby="account-delete-code-help"
              data-testid="account-delete-code-input"
              value={code}
              disabled={busy}
              spellCheck={false}
              onChange={(e) => setCode(e.target.value)}
              className="h-9 w-40 rounded-md border border-input bg-background px-3 font-mono text-base tracking-[0.3em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          </label>
          <p id="account-delete-code-help" className="text-xs text-muted-foreground">
            The code expires in 10 minutes and can only be used once.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              data-testid="account-delete-verify-code"
              disabled={busy || code.trim().length === 0}
              onClick={submitCode}
            >
              {busy ? "Checking…" : "Verify code"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-testid="account-delete-resend-code"
              disabled={busy || resendIn > 0}
              onClick={sendCode}
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
            </Button>
          </div>
        </>
      )}

      {step === "verified" && (
        <>
          <p data-testid="account-delete-verified" className="text-xs text-foreground">
            Code verified. This is the last step — it can&apos;t be undone after the grace
            window ends.
          </p>
          <label
            htmlFor="account-delete-confirm"
            className="flex flex-col gap-1 text-xs font-medium text-foreground"
          >
            Type <span className="font-mono text-destructive">{CONFIRM_WORD}</span> to confirm
            <input
              id="account-delete-confirm"
              ref={confirmRef}
              type="text"
              aria-label={`Type ${CONFIRM_WORD} to confirm`}
              data-testid="account-delete-confirm-input"
              value={confirmText}
              disabled={busy}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => setConfirmText(e.target.value)}
              className="h-9 w-48 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          </label>
          <div>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              data-testid="account-delete-confirm"
              disabled={busy || confirmText !== CONFIRM_WORD}
              onClick={confirmDelete}
            >
              {busy ? "Scheduling…" : "Delete my account"}
            </Button>
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Your data stays recoverable for 30 days — sign in any time before then to cancel.
        Your subscription is cancelled right away and is not restored by cancelling the
        deletion.
      </p>

      <p
        role="alert"
        aria-live="assertive"
        data-testid="account-deletion-error"
        className="text-xs text-destructive empty:hidden"
      >
        {error ?? ""}
      </p>

      <div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="account-delete-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
