import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { AuthShell, AuthHeading } from "@/features/auth/AuthShell";
import { MailGlyph } from "@/features/auth/AuthGlyphs";

/**
 * Email-confirmation success screen.
 *
 * Reached after a sign-up confirmation link: `/auth/callback` exchanges the
 * code for a session and forwards here (via `next=/auth/confirmed`, set as
 * `emailRedirectTo` in the signUp action). We show a clear "confirmed" state
 * instead of dropping the user on the bare homepage.
 *
 * CTA adapts to session state: if the callback established a session, continue
 * straight to the app; otherwise send them to sign in. No token parsing here —
 * the server callback already handled the exchange.
 */
export default async function ConfirmedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const cta = user
    ? { href: "/workflows", label: "Continue to dashboard" }
    : { href: "/auth/sign-in", label: "Continue to sign in" };

  return (
    <AuthShell showcase="sign-in">
      <div className="au-badge" aria-hidden>
        <MailGlyph size={22} />
      </div>
      <AuthHeading eyebrow="You're all set" title="Email confirmed">
        Your email has been verified. You can now continue to ChainReact.
      </AuthHeading>
      <Link href={cta.href} data-testid="confirmed-cta" className="au-submit">
        {cta.label}
      </Link>
    </AuthShell>
  );
}
