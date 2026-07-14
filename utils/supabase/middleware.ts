import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideMfaChallenge } from "@/services/auth/mfaChallengeGuard";

/**
 * Read the `aal` claim from a Supabase access token WITHOUT verifying its
 * signature (the token is trusted here because it just round-tripped through
 * `getUser()` against the auth server). Base64url-decodes the JWT payload and
 * returns the assurance level, or null if it can't be read. Never throws.
 */
function readAalClaim(accessToken: string | undefined): "aal1" | "aal2" | null {
  if (!accessToken) return null;
  const payloadSegment = accessToken.split(".")[1];
  if (!payloadSegment) return null;
  try {
    // Edge-runtime safe: use atob (Buffer isn't guaranteed on Edge). Restore
    // base64url → base64 and pad before decoding the ASCII JSON payload.
    const b64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
    const json = atob(padded);
    const aal = (JSON.parse(json) as { aal?: unknown }).aal;
    return aal === "aal2" ? "aal2" : aal === "aal1" ? "aal1" : null;
  } catch {
    return null;
  }
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: refresh the session on every request. Per Supabase SSR docs:
  // do not run other code between createServerClient and this call.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // MFA login-challenge enforcement (SEC-3). `getUser()` returns the authoritative
  // factor list; a verified factor means this user requires aal2. We read the
  // session's current level from the access-token `aal` claim and, if it's still
  // aal1 on a protected surface, divert the request to the challenge page. Users
  // WITHOUT a verified factor are never affected — so this is safe for everyone
  // who hasn't opted into MFA. The check is skipped entirely when there's no user.
  if (user) {
    const hasVerifiedFactor = Boolean(
      (user.factors ?? []).some((f) => f.status === "verified" && f.factor_type === "totp"),
    );
    if (hasVerifiedFactor) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const decision = decideMfaChallenge({
        hasVerifiedFactor,
        currentAal: readAalClaim(session?.access_token),
        pathname: request.nextUrl.pathname,
      });
      if (decision.action === "challenge") {
        const url = request.nextUrl.clone();
        url.pathname = decision.redirectTo;
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}
