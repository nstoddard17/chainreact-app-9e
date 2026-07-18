"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  resendSignupOtp,
  verifySignupOtp,
  type AuthActionResult,
} from "@/app/auth/actions";
import { TurnstileWidget } from "./TurnstileWidget";
import { TURNSTILE_FIELD_NAME, isTurnstileWidgetConfigured } from "@/services/security/turnstile";
import { AuthHeading } from "./AuthShell";
import { AuthCodeInput, CODE_LENGTH } from "./AuthCodeInput";
import { AuthFormError, AuthFormStatus, AuthSubmit } from "./AuthControls";
import { ChevronLeftGlyph, MailGlyph } from "./AuthGlyphs";

/** Seconds the UI waits before offering "Resend code" again. */
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Signup email verification by 6-digit code (Slice AUTH-EMAIL-OTP-1).
 *
 * Rendered by {@link SignUpFlow} once `signUp` reports `confirmationRequired`,
 * replacing the old "check your email and click the link" message. Ported from
 * the handoff's `VerifyView`.
 *
 * All auth work happens in the `verifySignupOtp` / `resendSignupOtp` SERVER
 * actions — this component holds no Supabase client and no secrets. It receives
 * the pending address as a prop from the parent's in-memory state; the signup
 * PASSWORD is never passed here, never stored, and cannot be recovered from this
 * screen (see SignUpFlow for the deliberate refresh trade-off).
 *
 * The cooldown is UX debouncing to stop impatient double-sends. It is NOT rate
 * limiting — Supabase enforces the real limit server-side.
 */
export function VerifyEmailForm({
  email,
  returnTo,
  onUseDifferentEmail,
}: {
  email: string;
  /** Already sanitized upstream; the server action re-sanitizes regardless. */
  returnTo?: string;
  onUseDifferentEmail: () => void;
}) {
  const [verifyState, verifyAction, verifying] = useActionState<AuthActionResult | null, FormData>(
    verifySignupOtp,
    null,
  );
  const [resendState, resendAction, resending] = useActionState<AuthActionResult | null, FormData>(
    resendSignupOtp,
    null,
  );

  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const captchaConfigured = isTurnstileWidgetConfigured();
  const [captchaToken, setCaptchaToken] = useState("");
  const [resetSignal, setResetSignal] = useState(0);

  const verifyFailed = Boolean(verifyState && !verifyState.ok);
  const expired = Boolean(verifyState && !verifyState.ok && verifyState.codeExpired);
  const counting = cooldown > 0;

  // Every resend attempt burns the single-use Turnstile token, so clear it and
  // request a fresh one either way. Only a SUCCESSFUL send starts the cooldown —
  // starting it on failure would lock the user out of retrying a send that never
  // actually happened.
  useEffect(() => {
    if (!resendState) return;
    setCaptchaToken("");
    setResetSignal((n) => n + 1);
    if (resendState.ok) setCooldown(RESEND_COOLDOWN_SECONDS);
  }, [resendState]);

  // Countdown. ONE interval for the whole cooldown, keyed on the derived
  // `counting` flag rather than on `cooldown` itself — depending on the number
  // would tear down and re-create the timer on every tick, which drifts and
  // (under fake timers) can't advance without a render in between. Cleanup runs
  // when the count reaches zero and on unmount, so no timer outlives the screen.
  useEffect(() => {
    if (!counting) return;
    const timer = window.setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [counting]);

  // A rejected code should land the user back in the field, with the bad digits
  // selected so typing replaces them rather than appending.
  useEffect(() => {
    if (verifyFailed) {
      const el = codeRef.current;
      el?.focus();
      el?.select();
    }
  }, [verifyState, verifyFailed]);

  const complete = code.length === CODE_LENGTH;
  const resendBlocked = resending || cooldown > 0 || (captchaConfigured && !captchaToken);

  return (
    <>
      <button type="button" className="au-back" onClick={onUseDifferentEmail}>
        <ChevronLeftGlyph size={15} />
        Back
      </button>

      <div className="au-badge" aria-hidden>
        <MailGlyph size={22} />
      </div>

      <AuthHeading eyebrow="Verify your email" title="Enter the code">
        We sent a 6-digit code to <b className="au-em">{email}</b>. Enter it below to activate
        your account.
      </AuthHeading>

      <form action={verifyAction} className="au-fields">
        <input type="hidden" name="email" value={email} />
        {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

        <AuthCodeInput
          value={code}
          onChange={setCode}
          disabled={verifying}
          invalid={verifyFailed}
          inputRef={codeRef}
          hint="Enter the 6-digit code from your email. You can paste it."
        />

        {verifyState && !verifyState.ok && (
          <AuthFormError data-testid="verify-error">{verifyState.error}</AuthFormError>
        )}

        <AuthSubmit
          pending={verifying}
          pendingLabel="Verifying…"
          disabled={!complete}
          data-testid="verify-submit"
        >
          Verify &amp; continue
        </AuthSubmit>
      </form>

      {resendState?.ok && (
        <AuthFormStatus>
          We&apos;ve sent a new code. It can take a moment to arrive.
        </AuthFormStatus>
      )}
      {resendState && !resendState.ok && <AuthFormError>{resendState.error}</AuthFormError>}

      <form action={resendAction}>
        <input type="hidden" name="email" value={email} />
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
        <p className="au-swap">
          {expired ? "That code has expired." : "Didn't get a code?"}
          {cooldown > 0 ? (
            <span className="au-swap-muted" aria-live="polite">
              Resend in {cooldown}s
            </span>
          ) : (
            <button
              type="submit"
              className="au-swap-btn"
              disabled={resendBlocked}
              data-testid="verify-resend"
            >
              {resending ? "Sending…" : "Resend code"}
            </button>
          )}
        </p>
      </form>

      <p className="au-swap au-swap-tight">
        <button
          type="button"
          className="au-swap-btn"
          onClick={onUseDifferentEmail}
          data-testid="verify-different-email"
        >
          Use a different email
        </button>
      </p>
    </>
  );
}
