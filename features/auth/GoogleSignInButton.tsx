"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { GoogleG } from "./AuthGlyphs";

/**
 * Initiates Google sign-in via Supabase Auth.
 *
 * Supabase handles the entire OAuth handshake (Google credentials live in the
 * Supabase dashboard, not in V2 .env). After Google authenticates the user,
 * Supabase redirects to /auth/callback with a code; our callback route
 * exchanges it for a session.
 */
export function GoogleSignInButton({ returnTo }: { returnTo?: string } = {}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    // ANON-BUILDER-2 — forward the same-origin returnTo through the OAuth callback
    // so an anonymous draft is restored after Google sign-in. Only same-origin
    // paths are honored (the callback re-checks too).
    const safeReturn =
      returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : null;
    const callback = safeReturn
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeReturn)}`
      : `${window.location.origin}/auth/callback`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callback,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setPending(false);
    }
    // On success the supabase-js client navigates the browser to Google;
    // no further work here.
  }

  return (
    <div className="au-social">
      {/*
        RESPONSIVE-AUTH-8 — `.au-sso` is `width:100%`, so its width is an
        ALLOCATION rather than its intrinsic content size, which is what makes a
        legibility floor valid here (the responsive rule forbids floors on
        intrinsic-width buttons). 240px keeps the provider icon plus the full
        "Continue with Google" label on one line — a truncated OAuth label is an
        unusable sign-in control, not a cosmetic issue.
      */}
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="au-sso"
        data-legible-min="240"
        data-legible-what="OAuth provider control"
      >
        <GoogleG size={16} />
        {pending ? "Redirecting…" : "Continue with Google"}
      </button>
      {error && (
        <span role="alert" className="au-fld-err">
          {error}
        </span>
      )}
    </div>
  );
}
