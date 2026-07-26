/**
 * Cloudflare Turnstile — the CLIENT-SAFE half of the SEC-3 wiring.
 *
 * Split out of `services/security/turnstile` by TEST-SUITE-GREEN-1: the auth
 * forms under `features/` are client components and were importing these two
 * VALUES across the client/server boundary (see
 * tests/structure/client-server-boundary.test.ts and
 * docs/rules/project-structure-and-module-boundaries.md §11). Nothing here
 * touches a repository, a service, or a server client — it is the form field
 * name plus a public-env predicate — so `core/` is its correct home and the
 * server half keeps re-exporting it.
 *
 * The Turnstile SECRET is NOT read by this app: verification happens inside
 * Supabase Auth (Authentication → Bot & Abuse Protection). The browser only
 * needs the PUBLIC site key to decide whether to render the widget.
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
