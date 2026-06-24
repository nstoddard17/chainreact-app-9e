import Link from "next/link";
import { AuthForm } from "@/features/auth/AuthForm";
import { GoogleSignInButton } from "@/features/auth/GoogleSignInButton";
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
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col gap-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold">Create your account</h1>
        {reasonText && (
          <p data-testid="auth-reason" className="text-sm text-muted-foreground">
            {reasonText}
          </p>
        )}
        {carry === "/start/continue" && (
          <p
            data-testid="auth-same-browser-note"
            className="rounded border border-input bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          >
            To keep the draft you just built, finish creating your account in this
            same browser.
          </p>
        )}
        <GoogleSignInButton {...(carry ? { returnTo: carry } : {})} />
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <AuthForm
          action={signUp}
          submitLabel="Sign up"
          passwordAutoComplete="new-password"
          successMessage="Check your email to confirm your account, then sign in."
          {...(carry ? { returnTo: carry } : {})}
        />
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href={signInHref} className="underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
