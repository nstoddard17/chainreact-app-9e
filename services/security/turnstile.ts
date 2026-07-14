/**
 * Cloudflare Turnstile bot-protection verification (SEC-3).
 *
 * App-side token verification for public auth-abuse surfaces (sign-up, sign-in,
 * password reset). The browser renders the Turnstile widget with
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; the widget produces a single-use token which
 * the server action forwards here to be verified against Cloudflare's siteverify
 * endpoint with the server-only `TURNSTILE_SECRET_KEY`.
 *
 * POSTURE — fail-closed when configured:
 *   - `TURNSTILE_SECRET_KEY` set   → verification is REQUIRED. A missing/invalid
 *     token is rejected. This is the production stance.
 *   - `TURNSTILE_SECRET_KEY` unset → verification is SKIPPED (returns "not
 *     enforced"), so local/dev and tests run without the keys. Production
 *     readiness requires the key to be set (documented in the readiness doc).
 *
 * The token is single-use and opaque; it is never logged. Cloudflare's response
 * error codes are logged in aggregate for diagnostics but never returned to the
 * client (a generic message is surfaced upstream).
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** True when server-side Turnstile enforcement is configured (secret present). */
export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.TURNSTILE_SECRET_KEY.length > 0);
}

/** True when the browser widget should render (public site key present). */
export function isTurnstileWidgetConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY &&
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY.length > 0,
  );
}

export type TurnstileResult =
  | { ok: true; enforced: boolean }
  | { ok: false };

/**
 * Verify a Turnstile token. When enforcement is off (no secret) returns
 * `{ ok: true, enforced: false }` so callers proceed. When enforcement is on, a
 * missing token is an immediate failure and a present token is checked against
 * Cloudflare siteverify; any non-success (including a network error) is a
 * fail-closed `{ ok: false }`.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Not configured → not enforced.
    return { ok: true, enforced: false };
  }

  if (!token || token.length === 0) {
    return { ok: false };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      console.warn(JSON.stringify({ event: "turnstile.siteverify.http_error", status: res.status }));
      return { ok: false };
    }
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success === true) {
      return { ok: true, enforced: true };
    }
    // Log the aggregate error codes (never the token) for diagnostics.
    console.warn(
      JSON.stringify({ event: "turnstile.verify_failed", errorCodes: data["error-codes"] ?? [] }),
    );
    return { ok: false };
  } catch {
    // Network/parse failure → fail closed.
    console.warn(JSON.stringify({ event: "turnstile.siteverify.exception" }));
    return { ok: false };
  }
}

/** The standard form field name the Turnstile widget injects for its token. */
export const TURNSTILE_FIELD_NAME = "cf-turnstile-response";
