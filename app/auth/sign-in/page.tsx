import Link from "next/link";
import { AuthForm } from "@/features/auth/AuthForm";
import { GoogleSignInButton } from "@/features/auth/GoogleSignInButton";
import { AuthShell, AuthHeading } from "@/features/auth/AuthShell";
import { AuthDivider, AuthFormError } from "@/features/auth/AuthControls";
import { signIn } from "@/app/auth/actions";
import { safeReturnPath } from "@/lib/safeReturnPath";
import { authReasonLine } from "@/features/auth/authReturnReason";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string; reason?: string }>;
}) {
  const { error, returnTo: rawReturnTo, reason } = await searchParams;
  // ANON-BUILDER-2 — same-origin destination after auth; only carried forward
  // when it's an explicit non-default path (e.g. /start/continue).
  const returnTo = rawReturnTo ? safeReturnPath(rawReturnTo) : undefined;
  const carry = returnTo && returnTo !== "/workflows" ? returnTo : undefined;
  const reasonText = authReasonLine(reason, "sign-in");
  const signUpHref = carry
    ? `/auth/sign-up?returnTo=${encodeURIComponent(carry)}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}`
    : "/auth/sign-up";

  return (
    <AuthShell showcase="sign-in">
      <AuthHeading eyebrow="Welcome back" title="Sign in to your account">
        Pick up where you left off. Your automations are waiting.
      </AuthHeading>

      {reasonText && (
        <p data-testid="auth-reason" className="au-note">
          {reasonText}
        </p>
      )}
      {error && <AuthFormError>{decodeURIComponent(error)}</AuthFormError>}
      {carry === "/start/continue" && (
        <p data-testid="auth-same-browser-note" className="au-note">
          To keep the draft you just built, finish signing in this same browser.
        </p>
      )}

      <GoogleSignInButton {...(carry ? { returnTo: carry } : {})} />
      <AuthDivider>or with email</AuthDivider>

      <AuthForm
        action={signIn}
        submitLabel="Sign in"
        pendingLabel="Signing in…"
        forgotPasswordHref="/auth/forgot-password"
        {...(carry ? { returnTo: carry } : {})}
      />

      <p className="au-swap">
        Don&apos;t have an account?
        <Link className="au-swap-btn" href={signUpHref}>
          Sign up free
        </Link>
      </p>
    </AuthShell>
  );
}
