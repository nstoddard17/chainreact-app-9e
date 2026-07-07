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
 * Shared guards + error mapping for the QuickBooks options resolvers —
 * QUICKBOOKS-1. Mirrors the Calendly/Typeform/Asana `_shared` posture.
 *
 * Error sanitization (nothing provider-raw reaches the browser):
 *   - `IntegrationActionRequiredError` / leaked `Unauthorized401Error`
 *     → `INTEGRATION_DISCONNECTED` ("Reconnect QuickBooks…").
 *   - `InsufficientScopeError` (403) → `PROVIDER_REAUTH_REQUIRED` — a
 *     refresh keeps the same granted scopes, so the fix is re-consent.
 *   - Anything else → `PROVIDER_ERROR` with a static message.
 *
 * Access gating is central: `quickbooks` is an ACCOUNT credential
 * (core/integrations/credentialSharing.ts), so
 * `services/options/resolveOptionsSource.ts` account-shares these
 * resolvers — no creator pinning, and no resolver-side auth logic.
 * Labels stay names-only (no emails, no amounts, no balances).
 */

export function requireQuickbooksIntegration(
  ctx: OptionsResolverContext,
): IntegrationRecord {
  if (!ctx.integration) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "No active QuickBooks connection. Connect QuickBooks Online first.",
    );
  }
  return ctx.integration;
}

/** Map a wrapper/API failure to a sanitized OptionsResolverError. Never returns. */
export function mapQuickbooksOptionsError(err: unknown, what: string): never {
  if (
    err instanceof IntegrationActionRequiredError ||
    err instanceof Unauthorized401Error
  ) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "Reconnect QuickBooks Online and try again.",
    );
  }
  if (err instanceof InsufficientScopeError) {
    throw new OptionsResolverError(
      "PROVIDER_REAUTH_REQUIRED",
      "Your QuickBooks connection is missing a required permission. Reconnect QuickBooks Online to grant it.",
    );
  }
  throw new OptionsResolverError(
    "PROVIDER_ERROR",
    `Couldn't load QuickBooks ${what}. Try again.`,
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
