import {
  IntegrationActionRequiredError,
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionItem,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

/**
 * Shared guards + error mapping for the HubSpot options resolvers —
 * RESOLVERS-1. Mirrors the QuickBooks/Calendly/Typeform `_shared` posture
 * (the pre-existing per-file HubSpot resolvers inline the same mapping;
 * new resolvers route through here instead of copying it again).
 *
 * Error sanitization (nothing provider-raw reaches the browser):
 *   - `IntegrationActionRequiredError` / leaked `Unauthorized401Error`
 *     → `INTEGRATION_DISCONNECTED` ("Reconnect HubSpot…").
 *   - `InsufficientScopeError` (403 — HubSpot MISSING_SCOPES) →
 *     `PROVIDER_REAUTH_REQUIRED` — a refresh keeps the same granted
 *     scopes, so the fix is re-consent, not retry.
 *   - Anything else → `PROVIDER_ERROR` with a static message.
 *
 * Labels stay names/titles only — no emails, no amounts, no raw HubSpot
 * property values beyond the record's display property. The record id may
 * appear in `description` for disambiguation.
 */

export function requireHubspotIntegration(
  ctx: OptionsResolverContext,
): IntegrationRecord {
  if (!ctx.integration) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "No active HubSpot integration. Connect HubSpot first.",
    );
  }
  return ctx.integration;
}

/** Map a wrapper/API failure to a sanitized OptionsResolverError. Never returns. */
export function mapHubspotOptionsError(err: unknown, what: string): never {
  if (
    err instanceof IntegrationActionRequiredError ||
    err instanceof Unauthorized401Error
  ) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "Reconnect HubSpot and try again.",
    );
  }
  if (err instanceof InsufficientScopeError) {
    throw new OptionsResolverError(
      "PROVIDER_REAUTH_REQUIRED",
      "Your HubSpot connection is missing a required permission. Reconnect HubSpot to grant it.",
    );
  }
  throw new OptionsResolverError(
    "PROVIDER_ERROR",
    `Couldn't load HubSpot ${what}. Try again.`,
  );
}

/** Case-insensitive substring filter on labels, then alpha sort. */
export function filterAndSortByLabel(
  items: readonly OptionItem[],
  q: string,
): OptionItem[] {
  const lowerQ = q.toLowerCase();
  const filtered =
    lowerQ.length > 0
      ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
      : [...items];
  return filtered.sort((a, b) => a.label.localeCompare(b.label));
}
