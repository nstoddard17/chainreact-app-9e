/**
 * Cloudflare Turnstile bot-protection wiring (SEC-3).
 *
 * ARCHITECTURE (Supabase-native verification): the browser widget produces a
 * single-use Turnstile token; that token is forwarded to the Supabase Auth SDK via
 * the supported `options.captchaToken` and **Supabase verifies it server-side**
 * against the Turnstile secret configured in the Supabase dashboard
 * (Authentication → Bot & Abuse Protection). The app deliberately does NOT call
 * Cloudflare siteverify itself — a Turnstile token is single-use, so redeeming it
 * app-side would consume it and Supabase would then reject the request with
 * "captcha protection: request disallowed (no/invalid captcha_token)". Verification
 * lives in exactly one place: Supabase.
 *
 * This module therefore holds only the shared, framework-agnostic bits:
 *   - the form field name the token travels in, and
 *   - whether the browser widget is configured (public site key present).
 *
 * The Turnstile SECRET is NOT read by this app — it lives in the Supabase
 * dashboard. The app only needs `NEXT_PUBLIC_TURNSTILE_SITE_KEY` for the widget.
 */

/** The form field the Turnstile token travels in (read by the auth server actions). */
export const TURNSTILE_FIELD_NAME = "cf-turnstile-response";

/** True when the browser widget should render (public site key present). */
export function isTurnstileWidgetConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY &&
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY.length > 0,
  );
}

/**
 * Extract the Turnstile token from a submitted auth form, normalized for the
 * Supabase `captchaToken` option: a present non-empty string, otherwise undefined
 * (so Supabase simply sees no token — correct for the not-configured/dev case).
 */
export function readCaptchaToken(formData: FormData): string | undefined {
  const raw = formData.get(TURNSTILE_FIELD_NAME);
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}
