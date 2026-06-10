import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

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
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col gap-6 w-full max-w-sm text-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Email confirmed</h1>
          <p className="text-sm text-muted-foreground">
            Your email has been verified. You can now continue to ChainReact.
          </p>
        </div>
        <Link
          href={cta.href}
          data-testid="confirmed-cta"
          className="rounded bg-primary text-primary-foreground px-4 py-2 font-medium"
        >
          {cta.label}
        </Link>
      </div>
    </main>
  );
}
