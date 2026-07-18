import Link from "next/link";
import { AuthForm } from "@/features/auth/AuthForm";
import { GoogleSignInButton } from "@/features/auth/GoogleSignInButton";
import { AuthShell, AuthHeading } from "@/features/auth/AuthShell";
import { AuthDivider } from "@/features/auth/AuthControls";
import { signUp } from "@/app/auth/actions";
import { safeReturnPath } from "@/lib/safeReturnPath";
import { authReasonLine } from "@/features/auth/authReturnReason";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; reason?: string }>;
}) {
  const { returnTo: rawReturnTo, reason } = await searchParams;
  // ANON-BUILDER-2 — same-origin destination after auth (e.g. /start/continue to
  // restore an anonymous draft). Only carried forward when explicitly non-default.
  const returnTo = rawReturnTo ? safeReturnPath(rawReturnTo) : undefined;
  const carry = returnTo && returnTo !== "/workflows" ? returnTo : undefined;
  const reasonText = authReasonLine(reason, "sign-up");
  const signInHref = carry
    ? `/auth/sign-in?returnTo=${encodeURIComponent(carry)}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}`
    : "/auth/sign-in";

  return (
    <AuthShell showcase="sign-up">
      <AuthHeading eyebrow="Get started free" title="Create your account">
        Describe an automation in plain English — ChainReact builds and runs it.
      </AuthHeading>

      {reasonText && (
        <p data-testid="auth-reason" className="au-note">
          {reasonText}
        </p>
      )}
      {carry === "/start/continue" && (
        <p data-testid="auth-same-browser-note" className="au-note">
          To keep the draft you just built, finish creating your account in this same
          browser.
        </p>
      )}

      <GoogleSignInButton {...(carry ? { returnTo: carry } : {})} />
      <AuthDivider>or with email</AuthDivider>

      <AuthForm
        action={signUp}
        submitLabel="Sign up"
        pendingLabel="Creating account…"
        passwordAutoComplete="new-password"
        passwordHint="Use 8 or more characters."
        successMessage="Check your email to confirm your account, then sign in."
        {...(carry ? { returnTo: carry } : {})}
      />

      <p className="au-swap">
        Already have an account?
        <Link className="au-swap-btn" href={signInHref}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
