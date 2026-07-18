import Link from "next/link";
import { AuthShell } from "@/features/auth/AuthShell";
import { SignUpFlow } from "@/features/auth/SignUpFlow";
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
      {/* AUTH-EMAIL-OTP-1 — the signup form and the 6-digit verification screen
          are two states of one client flow; the page stays a thin server shell. */}
      <SignUpFlow
        action={signUp}
        {...(carry ? { returnTo: carry } : {})}
        {...(reasonText ? { reasonText } : {})}
        sameBrowserNote={carry === "/start/continue"}
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
