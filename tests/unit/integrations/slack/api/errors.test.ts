/**
 * @jest-environment node
 *
 * Tests for `integrations/slack/api/errors.ts` — `isSlackAuthError`.
 *
 * This classifier is the single chokepoint the Slack option-source resolver
 * uses to decide reconnect (PROVIDER_REAUTH_REQUIRED) vs generic retry
 * (PROVIDER_ERROR). V2-READY-26 added transport-level auth codes (`http_401` /
 * `http_403`) so a revoked/expired token returned as a non-2xx HTTP status maps
 * to reconnect, not a retry loop — the production-observed channel-picker gap.
 */

import { isSlackAuthError } from "@/integrations/slack/api/errors";

describe("isSlackAuthError", () => {
  it.each([
    // logical auth/token codes (HTTP-200 `{ok:false,error:...}` shape)
    "invalid_auth",
    "not_authed",
    "account_inactive",
    "token_revoked",
    "token_expired",
    // V2-READY-27 — reconnect re-grants the current manifest scope set.
    "missing_scope",
    "org_login_required",
    // V2-READY-26 — transport-level auth failures
    "http_401",
    "http_403",
  ])("classifies '%s' as an auth/reconnect error", (code) => {
    expect(isSlackAuthError(code)).toBe(true);
  });

  it.each([
    // V2-READY-30B — policy/access denials. NOT a dead grant; re-running OAuth
    // cannot fix them, so they must NOT mark reconnect-needed (they fall through
    // to the generic PROVIDER_ERROR path).
    "no_permission",
    "ekm_access_denied",
    // transient transport / server / logical — a retry may clear these
    "ratelimited",
    "http_429",
    "http_500",
    "http_502",
    "http_503",
    "internal_error",
    "unknown_error",
    // non-auth logical errors
    "channel_not_found",
    "not_in_channel",
  ])("does NOT classify '%s' as an auth error", (code) => {
    expect(isSlackAuthError(code)).toBe(false);
  });
});
