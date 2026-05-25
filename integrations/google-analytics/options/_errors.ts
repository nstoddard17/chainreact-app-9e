import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { AnalyticsNotFoundError } from "@/integrations/_shared/google/api/analytics/errors";
import { OptionsResolverError } from "@/services/options/types";

/**
 * Shared error-classification helper for the Google Analytics options
 * resolvers — Slice 3.GOOGLE-ANALYTICS-3.
 *
 * GA authenticates resolver calls with the connected user's refreshable
 * Google OAuth token via `refreshAndRetry`. Failure surface:
 *   - `IntegrationActionRequiredError` (refresh failed / not supported) or a
 *     leaked `Unauthorized401Error` → the user must reconnect →
 *     `INTEGRATION_DISCONNECTED`.
 *   - `AnalyticsQuotaError` / `AnalyticsApiError` / anything else →
 *     `PROVIDER_ERROR` with a static caller-friendly message. The provider
 *     error's own message is NEVER passed through (the transport already
 *     reduces GA errors to a sanitized `error.status` tag; this drops even
 *     that from user-facing copy). No Google OAuth verification / sensitive-
 *     scope caveats are ever surfaced to users.
 *
 * `AnalyticsNotFoundError` (missing parent account/property) is NOT
 * classified here — each cascade resolver checks it BEFORE calling this and
 * returns empty `items` (the cascade fallback shared with Dropbox / Monday /
 * Facebook). Re-exported for convenience.
 */
export function classifyGoogleAnalyticsResolverError(
  err: unknown,
  resourceLabel: string,
): OptionsResolverError {
  if (
    err instanceof IntegrationActionRequiredError ||
    err instanceof Unauthorized401Error
  ) {
    return new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "Reconnect Google Analytics and try again.",
    );
  }
  return new OptionsResolverError(
    "PROVIDER_ERROR",
    `Couldn't load Google Analytics ${resourceLabel}. Try again.`,
  );
}

export { AnalyticsNotFoundError };
