import Link from "next/link";
import { AuthForm } from "@/features/auth/AuthForm";
import { GoogleSignInButton } from "@/features/auth/GoogleSignInButton";
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
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col gap-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold">Sign in</h1>
        {reasonText && (
          <p data-testid="auth-reason" className="text-sm text-muted-foreground">
            {reasonText}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {decodeURIComponent(error)}
          </p>
        )}
        {carry === "/start/continue" && (
          <p
            data-testid="auth-same-browser-note"
            className="rounded border border-input bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          >
            To keep the draft you just built, finish signing in this same browser.
          </p>
        )}
        <GoogleSignInButton {...(carry ? { returnTo: carry } : {})} />
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <AuthForm action={signIn} submitLabel="Sign in" {...(carry ? { returnTo: carry } : {})} />
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <Link href="/auth/forgot-password" className="underline">
            Forgot password?
          </Link>
          <p>
            No account?{" "}
            <Link href={signUpHref} className="underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
