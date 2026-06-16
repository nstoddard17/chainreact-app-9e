/**
 * V2-READY-44 — synthetic, NON-REAL secret-shaped fixtures for tests.
 *
 * The whole point: NO source file in the repo should contain a literal
 * `xox?-...` Slack-token-shaped string, so secret scanners (GitHub push
 * protection, etc.) never flag a fixture. But redaction / no-leak / detection
 * tests still need a value that LOOKS like a credential at runtime. This module
 * is the single place that provides both:
 *
 *   - `SLACK_TOKEN_PLACEHOLDER` — a deliberately NON-token-shaped string. Use it
 *     for OPAQUE passthrough credential mocks (the value is only ever handed to a
 *     mocked API call and asserted echoed back — it is never pattern-matched).
 *
 *   - `fakeSlackBotToken()` / `fakeSlackUserToken()` / `fakeSlackAppToken()` —
 *     values ASSEMBLED AT RUNTIME from split fragments, so the SOURCE holds no
 *     literal token shape while the returned value DOES match our Slack-token
 *     detection regex (e.g. `core`/`redact` `xox[baprs]-...`). Use these where a
 *     test must prove a token is DETECTED or REDACTED.
 *
 * Redaction tests that depend on an exact pre-existing fixture value instead
 * inline the same split-join (`["xoxb", ...].join("-")`) so the value is
 * byte-identical to before — that is equally valid and keeps the assertion exact.
 */

const dash = (...parts: string[]): string => parts.join("-");
const slug = (label: string): string => label.replace(/[^A-Za-z0-9]/g, "") || "fixture";

/** Runtime-assembled Slack BOT token shape (`xoxb-...`). Never a literal in source. */
export const fakeSlackBotToken = (label = "fixture"): string =>
  dash("xoxb", "1111111111", "2222222222", slug(label));

/** Runtime-assembled Slack USER token shape (`xoxp-...`). */
export const fakeSlackUserToken = (label = "fixture"): string =>
  dash("xoxp", "3333333333", "4444444444", slug(label));

/** Runtime-assembled Slack APP/ADMIN token shape (`xoxa-...`). */
export const fakeSlackAppToken = (label = "fixture"): string =>
  dash("xoxa", "5555555555", "6666666666", slug(label));

/**
 * Deliberately NON-token-shaped placeholder for opaque passthrough credential
 * mocks. Does NOT match any Slack-token pattern, so it is safe in source AND it
 * is obvious to a reader that it is a fixture, not a secret.
 */
export const SLACK_TOKEN_PLACEHOLDER = "slack_bot_token_test_fixture_redacted";

/**
 * V2-READY-46 — the same runtime-assembly idea extended to the other
 * high-confidence provider secret shapes (GitHub tokens, Stripe secret keys,
 * Google API/OAuth tokens, Stripe webhook secrets). Each returns a value that
 * MATCHES the corresponding detector regex at runtime, while the SOURCE here
 * holds no literal `prefix + body` string (the prefix and body are separate
 * fragments joined at call time), so secret scanners never flag this module.
 *
 * Use these wherever a test must prove one of these shapes is DETECTED,
 * REDACTED, or never-survives-encryption. The `slug(label)` keeps values stable
 * + unique per call site without ever introducing a literal token in source.
 */
const join_ = (...parts: string[]): string => parts.join("_");
/** Deterministic ≥16-char alnum body — keeps the assembled value detector-matching. */
const fakeBody = (label: string): string => "FAKE" + slug(label) + "0123456789abcdef";

/** Runtime-assembled GitHub classic PAT shape (`ghp_…`). Matches `ghp_[A-Za-z0-9]{16,}`. */
export const fakeGitHubPat = (label = "fixture"): string => join_("ghp", fakeBody(label));

/** Runtime-assembled GitHub OAuth user-token shape (`gho_…`). Matches `gho_[A-Za-z0-9]{16,}`. */
export const fakeGitHubOAuthToken = (label = "fixture"): string => join_("gho", fakeBody(label));

/** Runtime-assembled Stripe LIVE secret-key shape (`sk_live_…`). Matches `sk_(live|test)_[A-Za-z0-9]{16,}`. */
export const fakeStripeLiveKey = (label = "fixture"): string => join_("sk", "live", fakeBody(label));

/** Runtime-assembled Stripe TEST secret-key shape (`sk_test_…`). */
export const fakeStripeTestKey = (label = "fixture"): string => join_("sk", "test", fakeBody(label));

/** Runtime-assembled Stripe webhook-signing-secret shape (`whsec_…`). */
export const fakeStripeWebhookSecret = (label = "fixture"): string => join_("whsec", fakeBody(label));

/** Runtime-assembled Google API key shape (`AIza…`). Matches `AIza[A-Za-z0-9_-]{20,}`. */
export const fakeGoogleApiKey = (label = "fixture"): string => "AIza" + fakeBody(label) + "ghijkl";

/** Runtime-assembled Google OAuth access-token shape (`ya29.…`). */
export const fakeGoogleAccessToken = (label = "fixture"): string =>
  ["ya29", fakeBody(label)].join(".");

/** Runtime-assembled Google OAuth refresh-token shape (`1//…`). */
export const fakeGoogleRefreshToken = (label = "fixture"): string =>
  "1" + "//" + fakeBody(label);
