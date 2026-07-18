import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { signOut } from "@/app/auth/actions";
import { MfaChallengeForm } from "@/features/auth/MfaChallengeForm";
import { AuthShell, AuthHeading } from "@/features/auth/AuthShell";
import { ShieldGlyph } from "@/features/auth/AuthGlyphs";
import { safeReturnPath } from "@/lib/safeReturnPath";

/**
 * MFA login-challenge page (SEC-3).
 *
 * Reached when the middleware detects a signed-in user with a verified TOTP factor
 * whose session is still `aal1`. The user enters an authenticator code to elevate
 * to `aal2`, after which the middleware stops diverting them.
 *
 * Server gate: require a session; if the caller is already `aal2` (or somehow has
 * no verified factor) there's nothing to challenge, so send them on to the app.
 * This mirrors the `/account` auth-gate style. The code entry itself is a thin
 * client form posting to `/api/auth/mfa/verify`.
 */
export default async function MfaChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  // Nothing to step up (already satisfied, or no factor requires aal2) → move on.
  if (!aal || aal.currentLevel === "aal2" || aal.nextLevel !== "aal2") {
    redirect("/workflows");
  }

  const { returnTo: raw } = await searchParams;
  const returnTo = raw ? safeReturnPath(raw) : "/workflows";

  return (
    <AuthShell showcase="sign-in">
      <div className="au-badge" aria-hidden>
        <ShieldGlyph size={22} />
      </div>
      <AuthHeading eyebrow="One more step" title="Two-factor authentication">
        Enter the 6-digit code from your authenticator app to finish signing in.
      </AuthHeading>

      <MfaChallengeForm returnTo={returnTo} />

      <div className="au-swap">
        <form action={signOut}>
          <button type="submit" data-testid="mfa-challenge-sign-out" className="au-swap-btn">
            Sign in with a different account
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
