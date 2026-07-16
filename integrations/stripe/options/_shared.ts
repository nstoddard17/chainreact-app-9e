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
 * Shared guards + error mapping for the Stripe options resolvers —
 * RESOLVERS-1. Mirrors the QuickBooks/Calendly `_shared` posture.
 *
 * Error sanitization (nothing provider-raw reaches the browser):
 *   - `IntegrationActionRequiredError` / leaked `Unauthorized401Error`
 *     → `INTEGRATION_DISCONNECTED` ("Reconnect Stripe…").
 *   - `InsufficientScopeError` → `PROVIDER_REAUTH_REQUIRED`.
 *   - Anything else → `PROVIDER_ERROR` with a static message (the
 *     Stripe error envelope never crosses to the client).
 *
 * Label policy: customer labels are NAMES only (never email, phone,
 * address, or balance); subscription labels are customer-name + status
 * (the sub id rides in `description`); price labels may include the
 * merchant's own catalog amount ("$29.00/month") — that is the
 * merchant's public pricing, not customer PII, and without it prices
 * are indistinguishable.
 */

export function requireStripeIntegration(
  ctx: OptionsResolverContext,
): IntegrationRecord {
  if (!ctx.integration) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "No active Stripe connection. Connect Stripe first.",
    );
  }
  return ctx.integration;
}

/** Map a wrapper/API failure to a sanitized OptionsResolverError. Never returns. */
export function mapStripeOptionsError(err: unknown, what: string): never {
  if (
    err instanceof IntegrationActionRequiredError ||
    err instanceof Unauthorized401Error
  ) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "Reconnect Stripe and try again.",
    );
  }
  if (err instanceof InsufficientScopeError) {
    throw new OptionsResolverError(
      "PROVIDER_REAUTH_REQUIRED",
      "Your Stripe connection is missing a required permission. Reconnect Stripe to grant it.",
    );
  }
  throw new OptionsResolverError(
    "PROVIDER_ERROR",
    `Couldn't load Stripe ${what}. Try again.`,
  );
}

/** Case-insensitive substring filter on labels + descriptions, then alpha sort. */
export function filterAndSortByLabel(
  items: readonly OptionItem[],
  q: string,
): OptionItem[] {
  const lowerQ = q.toLowerCase();
  const filtered =
    lowerQ.length > 0
      ? items.filter(
          (item) =>
            item.label.toLowerCase().includes(lowerQ) ||
            (item.description ?? "").toLowerCase().includes(lowerQ),
        )
      : [...items];
  return filtered.sort((a, b) => a.label.localeCompare(b.label));
}

/** "$29.00/month" style price label fragment from minor units. */
export function formatPriceAmount(
  unitAmount: number | null,
  currency: string,
  interval: string | null,
): string {
  if (unitAmount === null) return "custom pricing";
  const major = (unitAmount / 100).toFixed(2);
  const cur = currency.toUpperCase();
  return interval ? `${major} ${cur}/${interval}` : `${major} ${cur}`;
}
