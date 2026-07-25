/**
 * Pure reader for the non-secret claims of a Supabase access token
 * (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * Base64url-decodes the JWT payload WITHOUT verifying its signature, and returns
 * only the two claims the app needs to make a policy decision. That is safe
 * ONLY because every caller has already round-tripped the session through
 * `supabase.auth.getUser()` — which validates the token against the auth server
 * — before reading these claims. Never use this to establish identity.
 *
 * `session_id` is what binds a sensitive-action challenge to the browser session
 * that requested it: it changes on sign-out/sign-in and is stable across the
 * token refreshes that happen mid-flow, which is exactly the lifetime a
 * step-up challenge should have. It is treated as an opaque value — the app
 * stores only a keyed digest of it.
 *
 * `utils/supabase/middleware.ts` keeps its own tiny `aal` reader: it runs on the
 * Edge runtime (no `Buffer`) and must not gain a Node-only dependency. This
 * module is for Node route handlers.
 */

export interface AccessTokenClaims {
  /** Opaque auth-session identifier, or null when the claim is absent/unreadable. */
  sessionId: string | null;
  /** Assurance level, or null when absent/unreadable. */
  aal: "aal1" | "aal2" | null;
}

const EMPTY: AccessTokenClaims = { sessionId: null, aal: null };

export function readAccessTokenClaims(
  accessToken: string | null | undefined,
): AccessTokenClaims {
  if (!accessToken) return EMPTY;
  const payloadSegment = accessToken.split(".")[1];
  if (!payloadSegment) return EMPTY;
  try {
    const json = Buffer.from(payloadSegment, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { session_id?: unknown; aal?: unknown };
    const sessionId =
      typeof parsed.session_id === "string" && parsed.session_id.length > 0
        ? parsed.session_id
        : null;
    const aal =
      parsed.aal === "aal2" ? "aal2" : parsed.aal === "aal1" ? "aal1" : null;
    return { sessionId, aal };
  } catch {
    // A malformed token yields no claims; callers fail closed rather than
    // proceeding with an unbound challenge.
    return EMPTY;
  }
}
