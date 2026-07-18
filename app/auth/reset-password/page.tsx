import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ResetPasswordForm } from "@/features/auth/ResetPasswordForm";
import { AuthShell, AuthHeading } from "@/features/auth/AuthShell";
import { LockGlyph } from "@/features/auth/AuthGlyphs";

/**
 * Landing page for the recovery link. `/auth/callback` exchanges the emailed
 * code for a recovery session and forwards here. If there is no session (link
 * opened directly, or expired), bounce to forgot-password with a message rather
 * than showing a form that can't work.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      "/auth/forgot-password?error=" +
        encodeURIComponent("Your reset link is invalid or has expired. Request a new one."),
    );
  }

  // MFA step-up (SEC-3): when the user has a verified TOTP factor and the recovery
  // session is still AAL1, Supabase will refuse the password update. Detect that up
  // front so the form asks for the authenticator code immediately (the action
  // enforces it regardless).
  const hasVerifiedTotp = (user.factors ?? []).some(
    (f) => f.status === "verified" && f.factor_type === "totp",
  );
  let mfaRequired = false;
  if (hasVerifiedTotp) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    mfaRequired = aal?.currentLevel !== "aal2";
  }

  return (
    <AuthShell showcase="sign-in">
      <div className="au-badge" aria-hidden>
        <LockGlyph size={22} />
      </div>
      <AuthHeading eyebrow="Password reset" title="Set a new password">
        Choose a new password for your account. You&apos;ll be signed in once it&apos;s
        saved.
      </AuthHeading>
      <ResetPasswordForm mfaRequired={mfaRequired} />
    </AuthShell>
  );
}
