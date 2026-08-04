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

/* ------------------------------------------------------------------ *
 * Central CAPTCHA requirement policy (LOCAL-AUTH-CAPTCHA-BYPASS-1)
 * ------------------------------------------------------------------ *
 *
 * ONE decision, used by every auth surface: does this environment require a
 * CAPTCHA token, or is the bypass explicitly approved? Before this policy the
 * app inferred "no site key ⇒ no captcha", which silently *attempted* a bypass
 * everywhere the key was missing — and failed opaquely wherever the Supabase
 * project enforces captcha (e.g. local `next dev` against an enforcing
 * project). Now the mode is decided here and a required-but-unconfigured
 * environment FAILS VISIBLY instead of degrading.
 *
 * The environment axis is the Supabase project the build targets
 * (`NEXT_PUBLIC_SUPABASE_URL`) — the same backend that actually enforces the
 * captcha — NEVER the browser hostname alone, which is spoofable. The project
 * refs mirror `scripts/lib/env-target.mjs` (kept as literals here because app
 * code cannot import the .mjs script guard; both cite each other).
 *
 * Approved modes:
 *   - production project           → "required", unconditionally.
 *   - approved development project → "disabled" (its Supabase bot protection is
 *     intentionally OFF; hosted v2-dev builds against it via branch-scoped env).
 *     A LOCAL dev server against it additionally requires a loopback browser
 *     host, so a LAN visitor to someone's `next dev` does not inherit the bypass.
 *   - loopback Supabase (the local stack) + `next dev` + loopback browser host
 *     → "disabled".
 *   - anything else — unknown previews, unknown backends, missing env —
 *     → "required". Fail closed.
 */

export type CaptchaMode = "required" | "disabled";

export interface CaptchaPolicyInput {
  /** `process.env.NODE_ENV` — "development" only under a local dev server. */
  nodeEnv: string | undefined;
  /** `NEXT_PUBLIC_SUPABASE_URL` — the auth backend this build targets. */
  supabaseUrl: string | undefined;
  /**
   * Browser hostname when known. `undefined` during SSR and the first client
   * render (hydration must not fork on it); the client re-resolves after mount
   * and a non-loopback host revokes a local bypass.
   */
  hostname: string | undefined;
}

/** Production Supabase project — mirrors PRODUCTION_PROJECT_REF in scripts/lib/env-target.mjs. */
const PRODUCTION_SUPABASE_HOST = "qcepijemjlkssfkvzlio.supabase.co";
/** chainreact-dev — the ONLY hosted project with an approved captcha bypass. */
const DEVELOPMENT_SUPABASE_HOST = "syvnzqzctnywakgyykmz.supabase.co";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** Loopback check; accepts the URL-API bracketed IPv6 form ("[::1]"). */
function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return LOOPBACK_HOSTS.has(normalized);
}

function parseHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * True only while a developer is plausibly at the machine: a local dev server
 * (`next dev`; a Vercel build can never be "development") reached over
 * loopback. An `undefined` hostname is accepted because SSR/first-paint cannot
 * know it — the client re-checks after mount and flips a LAN visit back to
 * "required".
 */
function isLocalDevelopmentContext(input: CaptchaPolicyInput): boolean {
  if (input.nodeEnv !== "development") return false;
  return input.hostname === undefined || isLoopbackHostname(input.hostname);
}

/**
 * Classification of the Supabase project a build targets — the AUTHORITATIVE
 * base for the captcha mode (LOCAL-AUTH-CAPTCHA-BYPASS-2). The browser
 * hostname can only ever make the result MORE restrictive, never authorize a
 * bypass on its own.
 */
export type SupabaseTargetClass = "production" | "development" | "local-stack" | "unknown";

/** Classify `NEXT_PUBLIC_SUPABASE_URL`. Ports, paths, and trailing slashes are irrelevant. */
export function classifySupabaseTarget(supabaseUrl: string | undefined): SupabaseTargetClass {
  const host = parseHost(supabaseUrl);
  if (!host) return "unknown"; // missing or malformed — fail closed upstream
  if (host === PRODUCTION_SUPABASE_HOST) return "production";
  if (host === DEVELOPMENT_SUPABASE_HOST) return "development";
  if (isLoopbackHostname(host)) return "local-stack";
  return "unknown";
}

/** The single source of truth for whether an auth surface requires a CAPTCHA token. */
export function resolveCaptchaMode(input: CaptchaPolicyInput): CaptchaMode {
  // Jest-only: unit suites run with NODE_ENV=test and no meaningful public
  // env, and the pre-policy behaviour there was "no widget, no gate". A real
  // build can never take this branch — `next build` forces "production" and
  // `next dev` forces "development".
  if (input.nodeEnv === "test") return "disabled";

  switch (classifySupabaseTarget(input.supabaseUrl)) {
    // Production backend: captcha required no matter where the app is served
    // from (a localhost dev server included) — never a silent bypass.
    case "production":
      return "required";

    // Approved development project (bot protection intentionally off).
    // Hosted v2-dev builds are NODE_ENV=production → disabled as configured.
    // A local dev server against it must also be viewed over loopback.
    case "development":
      if (input.nodeEnv === "production") return "disabled";
      return isLocalDevelopmentContext(input) ? "disabled" : "required";

    // Local Supabase stack: only ever a bypass for a loopback-viewed dev server.
    case "local-stack":
      return isLocalDevelopmentContext(input) ? "disabled" : "required";

    // Unknown backend / preview / staging-like / missing env — fail closed.
    case "unknown":
      return "required";
  }
}

/**
 * Convenience for client components: resolve the mode from the build's public
 * env plus the (post-mount) browser hostname. Pure environment reads only — no
 * `window` access here, so it is also safe during SSR with `hostname` omitted.
 */
export function resolveBrowserCaptchaMode(hostname?: string): CaptchaMode {
  return resolveCaptchaMode({
    nodeEnv: process.env.NODE_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    hostname,
  });
}

/** The build's Supabase target class, from the same env the mode is resolved from. */
export function browserSupabaseTargetClass(): SupabaseTargetClass {
  return classifySupabaseTarget(process.env.NEXT_PUBLIC_SUPABASE_URL);
}
