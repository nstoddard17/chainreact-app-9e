"use client";

import { useState } from "react";
import type { AuthActionResult } from "@/app/auth/actions";
import { AuthForm } from "./AuthForm";
import { AuthHeading } from "./AuthShell";
import { AuthDivider } from "./AuthControls";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { VerifyEmailForm } from "./VerifyEmailForm";

type SignUpAction = (
  prev: AuthActionResult | null,
  formData: FormData,
) => Promise<AuthActionResult>;

/**
 * Signup → email-verification flow controller (Slice AUTH-EMAIL-OTP-1).
 *
 * Owns the one piece of state the two screens share: which screen is showing,
 * and the address the code was sent to. Everything else stays where it already
 * lived — `signUp` is still the same server action, still Turnstile-gated, still
 * responsible for the redirect when confirmation is OFF.
 *
 * The swap is driven by WRAPPING the signup action rather than by adding a
 * callback to {@link AuthForm}: the wrapper reads the submitted address off the
 * FormData that was just posted, so AuthForm keeps its existing contract and its
 * existing tests, and there is no render-phase state update to sequence.
 *
 * PENDING STATE — deliberate design, please read before "improving" it:
 *   - the pending address lives in React state ONLY. It is never written to
 *     localStorage, sessionStorage, a cookie, or the URL.
 *   - the signup PASSWORD is never captured here at all. The wrapper reads only
 *     the email field; the password stays inside the FormData that went to the
 *     server action and is gone the moment that call returns.
 *   - the OTP itself is only ever a controlled value inside VerifyEmailForm and
 *     is submitted straight to the server action.
 *
 * The accepted trade-off: a hard refresh of the verification screen returns the
 * user to the signup form, because nothing about the pending signup is
 * persisted. That is the honest, secure default — surviving refresh would mean
 * either exposing the address to client storage or minting a signed server-side
 * pending token, and neither is justified for a screen the user is already
 * looking at. A user who refreshes can simply sign up again (Supabase resends
 * the confirmation for an existing unconfirmed address) or use "Resend code"
 * before refreshing. If refresh-survival is wanted later, do it with a
 * short-lived httpOnly signed cookie set by the signUp action — not client
 * storage.
 */
export function SignUpFlow({
  action,
  returnTo,
  reasonText,
  sameBrowserNote,
}: {
  action: SignUpAction;
  /** Sanitized upstream by `safeReturnPath`; the server re-sanitizes anyway. */
  returnTo?: string;
  reasonText?: string;
  sameBrowserNote?: boolean;
}) {
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  // Wraps the real server action; only observes the result to decide the screen.
  const actionWithCapture: SignUpAction = async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.ok && result.confirmationRequired) {
      const submitted = formData.get("email");
      if (typeof submitted === "string" && submitted.trim().length > 0) {
        setPendingEmail(submitted.trim());
      }
    }
    return result;
  };

  if (pendingEmail) {
    return (
      <VerifyEmailForm
        email={pendingEmail}
        {...(returnTo ? { returnTo } : {})}
        onUseDifferentEmail={() => setPendingEmail(null)}
      />
    );
  }

  return (
    <>
      <AuthHeading eyebrow="Get started free" title="Create your account">
        Describe an automation in plain English — ChainReact builds and runs it.
      </AuthHeading>

      {reasonText && (
        <p data-testid="auth-reason" className="au-note">
          {reasonText}
        </p>
      )}
      {sameBrowserNote && (
        <p data-testid="auth-same-browser-note" className="au-note">
          To keep the draft you just built, finish creating your account in this same browser.
        </p>
      )}

      <GoogleSignInButton {...(returnTo ? { returnTo } : {})} />
      <AuthDivider>or with email</AuthDivider>

      <AuthForm
        action={actionWithCapture}
        submitLabel="Sign up"
        pendingLabel="Creating account…"
        passwordAutoComplete="new-password"
        passwordHint="Use 8 or more characters."
        // Fallback only. Reached when Supabase reports confirmationRequired but
        // no address came back with the submission, so we cannot show the code
        // screen — the user still gets a usable instruction instead of a dead end.
        successMessage="Check your email to confirm your account, then sign in."
        {...(returnTo ? { returnTo } : {})}
      />
    </>
  );
}
