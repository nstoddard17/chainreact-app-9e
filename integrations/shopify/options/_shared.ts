import {
  InsufficientScopeError,
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionItem,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

/**
 * Shared guards + error mapping for the Shopify options resolvers —
 * RESOLVERS-1. Mirrors the QuickBooks `_shared` posture.
 *
 * Auth: Shopify is NON-REFRESHABLE offline tokens, but the action
 * handlers still route through `refreshAndRetry` (which decrypts and,
 * on 401, surfaces `IntegrationActionRequiredError(reason:
 * "refresh_not_supported")`). Resolvers reuse the exact same path so
 * the per-shop pinning contract (`providerAccountId` = shop domain)
 * stays in one place.
 *
 * Error sanitization (nothing provider-raw reaches the browser):
 *   - `InsufficientScopeError` (HTTP 403 — RESOLVERS-2) →
 *     `PROVIDER_REAUTH_REQUIRED`. The integration ROW is fine; the
 *     merchant's granted scopes just don't cover the endpoint (the
 *     `read_locations` OPTIONAL-scope add is the live case). Only
 *     re-consent grants it, so the client must show Reconnect, not
 *     "try again".
 *   - `IntegrationActionRequiredError` / leaked `Unauthorized401Error`
 *     → `INTEGRATION_DISCONNECTED` ("Reconnect Shopify…") — for a
 *     non-refreshable token, reconnect IS the fix.
 *   - Anything else → `PROVIDER_ERROR` with a static message.
 */

export function requireShopifyIntegration(
  ctx: OptionsResolverContext,
): IntegrationRecord {
  if (!ctx.integration) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "No active Shopify connection. Connect your Shopify store first.",
    );
  }
  return ctx.integration;
}

/** Map a wrapper/API failure to a sanitized OptionsResolverError. Never returns. */
export function mapShopifyOptionsError(err: unknown, what: string): never {
  if (err instanceof OptionsResolverError) throw err;
  if (err instanceof InsufficientScopeError) {
    // Granted scopes don't cover the endpoint (e.g. a token minted before
    // `read_locations` was added). Reconnect — not retry — is the fix.
    throw new OptionsResolverError(
      "PROVIDER_REAUTH_REQUIRED",
      `Reconnect your Shopify store to allow listing your ${what}.`,
    );
  }
  if (
    err instanceof IntegrationActionRequiredError ||
    err instanceof Unauthorized401Error
  ) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "Reconnect your Shopify store and try again.",
    );
  }
  throw new OptionsResolverError(
    "PROVIDER_ERROR",
    `Couldn't load Shopify ${what}. Try again.`,
  );
}

/**
 * Case-insensitive substring filter on labels, PRESERVING the incoming
 * order. For lists whose provider-side order is meaningful (RESOLVERS-2:
 * orders are most-recent-first) — alpha-sorting them would bury the
 * newest order under "#1001".
 */
export function filterByLabel(
  items: readonly OptionItem[],
  q: string,
): OptionItem[] {
  const lowerQ = q.toLowerCase();
  if (lowerQ.length === 0) return [...items];
  return items.filter((item) => item.label.toLowerCase().includes(lowerQ));
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
