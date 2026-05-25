import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/facebook/errors";
import { OptionsResolverError } from "@/services/options/types";

/**
 * Shared error-classification helper for the Facebook options
 * resolvers — Slice 3.FACEBOOK-3.
 *
 * Facebook authenticates resolver calls with the connected user's
 * (long-lived) token via `refreshAndRetry`, with page-scoped reads
 * deriving a Page token at runtime. The failure surface a resolver sees:
 *
 *   - `IntegrationActionRequiredError` / a leaked `Unauthorized401Error`:
 *     the user token is expired / revoked and Facebook is non-refreshable
 *     (no true refresh token — the `fb_exchange_token` re-exchange can't
 *     run unattended). The user must reconnect → `INTEGRATION_DISCONNECTED`.
 *
 *   - `FacebookPermissionError` (missing scope / Page role) /
 *     `RateLimitError` / generic `FacebookApiError` / anything else →
 *     `PROVIDER_ERROR` with a static caller-friendly message. The provider
 *     error's OWN message is NEVER passed through — `FacebookPermissionError`
 *     in particular carries an internal Meta App-Review / Advanced-Access
 *     hint that must NOT reach end-user-facing copy. The transport layer
 *     already strips tokens / the `appsecret_proof` / raw bodies from its
 *     error tags; this helper additionally drops the message entirely.
 *
 * `NotFoundError` (page not manageable / list node gone) is NOT classified
 * here — each page-scoped resolver checks it BEFORE calling this helper and
 * returns empty `items` (the cascade fallback shared with Dropbox / Monday).
 * Re-exported for convenience.
 */
export function classifyFacebookResolverError(
  err: unknown,
  resourceLabel: string,
): OptionsResolverError {
  if (
    err instanceof IntegrationActionRequiredError ||
    err instanceof Unauthorized401Error
  ) {
    return new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "Reconnect Facebook and try again.",
    );
  }
  return new OptionsResolverError(
    "PROVIDER_ERROR",
    `Couldn't load Facebook ${resourceLabel}. Try again.`,
  );
}

export { NotFoundError };
