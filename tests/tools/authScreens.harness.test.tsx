/**
 * RESPONSIVE-AUTH-8 — authentication surfaces visual harness (NOT a behavioural test).
 *
 * Same approach as the accepted harnesses: render the REAL auth components with
 * synthetic fixtures, write the markup to `owner-review/html/auth-*.html`, and let
 * `scripts/trash/responsive-foundation/screenshot-templates.mjs` wrap it and measure
 * continuously from 360→1600 in Chromium.
 *
 * AUDITED SURFACE (what actually ships — no invented routes or states):
 *
 *   app/auth/sign-in         → AuthShell + GoogleSignInButton + AuthDivider + AuthForm
 *   app/auth/sign-up         → AuthShell + SignUpFlow (→ AuthForm, then VerifyEmailForm)
 *   app/auth/forgot-password → AuthShell + ForgotPasswordForm (request + confirmed)
 *   app/auth/reset-password  → AuthShell + ResetPasswordForm (+ MFA step-up variant)
 *   app/auth/mfa             → AuthShell + MfaChallengeForm
 *   app/auth/confirmed       → AuthShell + static confirmation copy
 *
 * `app/auth/callback/route.ts` is a ROUTE HANDLER (a redirect), not a rendered
 * surface — it has no layout and is deliberately not fixtured.
 *
 * NOT PRESENT anywhere in these surfaces, so deliberately not fixtured: a password
 * strength meter, a requirement checklist (the password rule ships as one `hint`
 * line), a QR code / manual setup key (MFA ENROLMENT lives in Account Settings and
 * is covered by the account-settings harness, not the auth routes), a separate
 * verification-pending route, and multiple OAuth providers (Google is the only one
 * that ships).
 *
 * Turnstile renders nothing without `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and its real
 * iframe cannot load offline, so the captcha states use a SYNTHETIC bounded stand-in
 * sized to Cloudflare's real managed widget (300×65) — the dimension that actually
 * decides whether it fits a 360px phone.
 *
 * FIXTURE SAFETY: every value is synthetic. No production payloads, customer data,
 * real addresses, tokens, keys, secrets or signed URLs.
 */
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/auth/sign-in",
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithOAuth: jest.fn() } }),
}));

jest.mock("@/app/auth/actions", () => ({
  signIn: jest.fn(),
  signUp: jest.fn(),
  requestPasswordReset: jest.fn(),
  updatePassword: jest.fn(),
  verifySignupOtp: jest.fn(),
  resendSignupOtp: jest.fn(),
}));

import { AuthShell, AuthHeading } from "@/features/auth/AuthShell";
import { AuthField } from "@/features/auth/AuthField";
import { AuthCodeInput } from "@/features/auth/AuthCodeInput";
import {
  AuthDivider,
  AuthFormError,
  AuthFormStatus,
  AuthSubmit,
} from "@/features/auth/AuthControls";
import { GoogleSignInButton } from "@/features/auth/GoogleSignInButton";
import { ChevronLeftGlyph, LockGlyph, MailGlyph } from "@/features/auth/AuthGlyphs";

const OUT = join(process.cwd(), "owner-review", "html");

/**
 * Synthetic identities. Deliberately pathological where the brief names the risk:
 * a 74-character address is the single value most likely to establish a minimum
 * width on a 360px phone, and it is not a real mailbox.
 */
const SHORT_EMAIL = "sam@acme.test";
const LONG_EMAIL =
  "samantha.j.worthington-fitzgerald+chainreact-signup@engineering.acme-corp.test";

/**
 * A long UNBROKEN identifier of the kind a provider error echoes back. This is the
 * pathological case, and it is deliberately harsher than a long email: Chrome finds
 * break opportunities in an address (`@`, `.`, `-`) but none in an underscored
 * reference, so this — not the email — is what actually establishes a minimum width.
 * Measured pre-fix at 360px: 184px of document overflow, bursting `.au-sub` by 205px.
 */
const LONG_ERROR =
  "Sign-in failed: the credential reference acct_9f2b7c41e8d64a3fb05e7c8912ab34df6e0c5719b2d8a04f7e3c6915d0ab8827 could not be verified. Check your email and password and try again.";

/**
 * A bounded stand-in for the Cloudflare managed widget. Real Turnstile renders a
 * 300×65 iframe; its width is the property that matters for containment, so the
 * fixture reproduces exactly that and nothing else.
 */
function CaptchaStandIn({ error = false }: { error?: boolean } = {}) {
  return (
    <div data-testid="turnstile-widget" className="min-h-[65px]">
      <div
        data-testid="turnstile-frame"
        style={{ width: 300, height: 65, border: "1px solid #2a2a30", borderRadius: 8 }}
      />
      {error ? (
        <span className="au-fld-err">
          Verification failed. Refresh the challenge and try again.
        </span>
      ) : null}
    </div>
  );
}

function emit(name: string, ui: ReactNode) {
  const { container, unmount } = render(<>{ui}</>);
  const html = container.innerHTML;
  expect(html.length).toBeGreaterThan(0);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `auth-${name}.html`), html, "utf8");
  unmount();
}

/** Sign-in screen body, parameterised by the state under test. */
function SignInBody({
  error,
  pending = false,
  captcha,
}: {
  error?: string;
  pending?: boolean;
  captcha?: "ok" | "error";
} = {}) {
  return (
    <>
      <AuthHeading eyebrow="Welcome back" title="Sign in to ChainReact">
        Connect your apps and let your workflows run themselves.
      </AuthHeading>
      <GoogleSignInButton />
      <AuthDivider>or with email</AuthDivider>
      <form className="au-fields">
        <AuthField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@company.com"
          defaultValue={error ? LONG_EMAIL : ""}
        />
        <AuthField
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          reveal
          placeholder="Your password"
          extra={
            <button type="button" className="au-fld-link">
              Forgot password?
            </button>
          }
        />
        {captcha ? <CaptchaStandIn error={captcha === "error"} /> : null}
        {error ? <AuthFormError>{error}</AuthFormError> : null}
        <AuthSubmit pending={pending} pendingLabel="Signing in…">
          Sign in
        </AuthSubmit>
      </form>
      <p className="au-swap">
        New to ChainReact?
        <button type="button" className="au-swap-btn">
          Create an account
        </button>
      </p>
    </>
  );
}

describe("RESPONSIVE-AUTH-8 — auth surface fixtures", () => {
  it("writes the sign-in states", () => {
    emit("01-signin-default", <AuthShell>{SignInBody()}</AuthShell>);
    emit(
      "02-signin-error",
      <AuthShell>{SignInBody({ error: "That email or password isn't right." })}</AuthShell>,
    );
    emit(
      "03-signin-long-error",
      <AuthShell>{SignInBody({ error: LONG_ERROR })}</AuthShell>,
    );
    emit("04-signin-pending", <AuthShell>{SignInBody({ pending: true })}</AuthShell>);
    emit("05-signin-captcha", <AuthShell>{SignInBody({ captcha: "ok" })}</AuthShell>);
    emit(
      "06-signin-captcha-error",
      <AuthShell>{SignInBody({ captcha: "error" })}</AuthShell>,
    );
  });

  it("writes the sign-up states", () => {
    emit(
      "07-signup-default",
      <AuthShell showcase="sign-up">
        <AuthHeading eyebrow="Get started" title="Create your account">
          Build your first automation in minutes. No credit card required.
        </AuthHeading>
        <GoogleSignInButton />
        <AuthDivider>or with email</AuthDivider>
        <form className="au-fields">
          <AuthField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@company.com"
          />
          <AuthField
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            reveal
            hint="Use 8 or more characters."
            placeholder="At least 8 characters"
          />
          <CaptchaStandIn />
          <AuthSubmit pending={false} pendingLabel="Creating…">
            Create account
          </AuthSubmit>
        </form>
      </AuthShell>,
    );

    emit(
      "08-signup-validation",
      <AuthShell showcase="sign-up">
        <AuthHeading eyebrow="Get started" title="Create your account">
          Build your first automation in minutes. No credit card required.
        </AuthHeading>
        <form className="au-fields">
          <AuthField
            label="Email"
            type="email"
            name="email"
            defaultValue={LONG_EMAIL}
            error="An account already exists for this address."
          />
          <AuthField
            label="Password"
            type="password"
            name="password"
            reveal
            hint="Use 8 or more characters."
            error="Password must be at least 8 characters long and not match a previously breached password."
          />
          <AuthSubmit pending={false} pendingLabel="Creating…">
            Create account
          </AuthSubmit>
        </form>
      </AuthShell>,
    );
  });

  it("writes the email-verification states", () => {
    const verify = (email: string, error?: string) => (
      <AuthShell showcase="sign-up">
        <button type="button" className="au-back">
          <ChevronLeftGlyph size={15} />
          Back
        </button>
        <div className="au-badge" aria-hidden>
          <MailGlyph size={22} />
        </div>
        <AuthHeading eyebrow="Verify your email" title="Enter the code">
          We sent a 6-digit code to <b className="au-em">{email}</b>. Enter it below to
          activate your account.
        </AuthHeading>
        <form className="au-fields">
          <AuthCodeInput
            value={error ? "123456" : ""}
            onChange={() => {}}
            invalid={Boolean(error)}
            hint="Enter the 6-digit code from your email. You can paste it."
          />
          {error ? <AuthFormError>{error}</AuthFormError> : null}
          <AuthSubmit pending={false} pendingLabel="Verifying…" disabled={!error}>
            Verify &amp; continue
          </AuthSubmit>
        </form>
        <CaptchaStandIn />
        <p className="au-swap">
          Didn&apos;t get a code?
          <button type="submit" className="au-swap-btn">
            Resend code
          </button>
        </p>
        <p className="au-swap au-swap-tight">
          <button type="button" className="au-swap-btn">
            Use a different email
          </button>
        </p>
      </AuthShell>
    );

    emit("09-verify-short-email", verify(SHORT_EMAIL));
    emit("10-verify-long-email", verify(LONG_EMAIL));
    emit(
      "11-verify-error",
      verify(LONG_EMAIL, "That code isn't right, or it has expired. Request a new one."),
    );
  });

  it("writes the password-recovery states", () => {
    emit(
      "12-forgot-request",
      <AuthShell>
        <a className="au-back" href="/auth/sign-in">
          <ChevronLeftGlyph size={15} />
          Back to sign in
        </a>
        <div className="au-badge" aria-hidden>
          <LockGlyph size={22} />
        </div>
        <AuthHeading eyebrow="Password reset" title="Forgot your password?">
          Enter the email for your account and we&apos;ll send you a link to set a new one.
        </AuthHeading>
        <form className="au-fields">
          <AuthField label="Email" type="email" name="email" placeholder="you@company.com" />
          <CaptchaStandIn />
          <AuthSubmit pending={false} pendingLabel="Sending…">
            Send reset link
          </AuthSubmit>
        </form>
      </AuthShell>,
    );

    emit(
      "13-forgot-confirmed-long-email",
      <AuthShell>
        <a className="au-back" href="/auth/sign-in">
          <ChevronLeftGlyph size={15} />
          Back to sign in
        </a>
        <div className="au-badge" aria-hidden>
          <MailGlyph size={22} />
        </div>
        <AuthHeading eyebrow="Check your inbox" title="Reset link sent">
          <span role="status">
            If an account exists for <b className="au-em">{LONG_EMAIL}</b>, a link to set a
            new password is on its way. Check your inbox — and your spam folder.
          </span>
        </AuthHeading>
        <a className="au-submit" href="/auth/sign-in">
          Back to sign in
        </a>
        <p className="au-swap">
          Didn&apos;t get it?
          <button type="button" className="au-swap-btn">
            Try a different email
          </button>
        </p>
      </AuthShell>,
    );

    emit(
      "14-reset-password",
      <AuthShell>
        <AuthHeading eyebrow="Password reset" title="Set a new password">
          Choose a new password for your account.
        </AuthHeading>
        <form className="au-fields">
          <AuthField
            label="New password"
            type="password"
            name="password"
            reveal
            hint="Use 8 or more characters."
            placeholder="At least 8 characters"
          />
          <AuthField
            label="Confirm new password"
            type="password"
            name="confirm"
            placeholder="Re-enter your new password"
          />
          <AuthSubmit pending={false} pendingLabel="Updating…">
            Update password
          </AuthSubmit>
        </form>
      </AuthShell>,
    );

    emit(
      "15-reset-expired-link",
      <AuthShell>
        <AuthHeading eyebrow="Password reset" title="Set a new password">
          Choose a new password for your account.
        </AuthHeading>
        <AuthFormError>
          This password reset link has expired or has already been used. Request a new link
          from the forgot-password page and try again.
        </AuthFormError>
        <a className="au-submit" href="/auth/forgot-password">
          Request a new link
        </a>
      </AuthShell>,
    );

    emit(
      "16-reset-mfa-stepup",
      <AuthShell>
        <AuthHeading eyebrow="Password reset" title="Set a new password">
          Choose a new password for your account.
        </AuthHeading>
        <form className="au-fields">
          <AuthField label="New password" type="password" name="password" reveal />
          <AuthField label="Confirm new password" type="password" name="confirm" />
          <AuthField
            label="Authenticator code"
            type="text"
            name="code"
            inputMode="numeric"
            hint="Enter the 6-digit code from your authenticator app."
          />
          <AuthSubmit pending={false} pendingLabel="Updating…">
            Update password
          </AuthSubmit>
        </form>
      </AuthShell>,
    );
  });

  it("writes the MFA challenge states", () => {
    const mfa = (error?: string) => (
      <AuthShell>
        <AuthHeading eyebrow="Two-factor authentication" title="Confirm it's you">
          Enter the 6-digit code from your authenticator app to finish signing in.
        </AuthHeading>
        <form className="au-fields">
          <AuthField
            label="Authenticator code"
            type="text"
            name="code"
            inputMode="numeric"
            placeholder="123456"
            {...(error ? { error } : {})}
          />
          <AuthSubmit pending={false} pendingLabel="Verifying…">
            Verify
          </AuthSubmit>
        </form>
        <p className="au-swap">
          Lost your device?
          <a className="au-swap-btn" href="/auth/sign-in">
            Back to sign in
          </a>
        </p>
      </AuthShell>
    );
    emit("17-mfa-challenge", mfa());
    emit(
      "18-mfa-error",
      mfa("Couldn't verify that code. Check your authenticator app and try again."),
    );
  });

  it("writes the confirmation state", () => {
    emit(
      "19-confirmed",
      <AuthShell>
        <div className="au-badge" aria-hidden>
          <MailGlyph size={22} />
        </div>
        <AuthHeading eyebrow="Email confirmed" title="You're all set">
          Your email address has been confirmed. You can sign in and start building.
        </AuthHeading>
        <AuthFormStatus>
          Your account is active. Signing in will take you straight to your workflows.
        </AuthFormStatus>
        <a className="au-submit" href="/auth/sign-in">
          Continue to sign in
        </a>
      </AuthShell>,
    );
  });
});
