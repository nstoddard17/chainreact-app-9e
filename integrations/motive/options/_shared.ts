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
 * Shared guards + error mapping for the Motive options resolvers — MOTIVE-1.
 * Mirrors the QuickBooks `_shared` posture.
 *
 * Error sanitization (nothing provider-raw reaches the browser):
 *   - `IntegrationActionRequiredError` / leaked `Unauthorized401Error`
 *     → `INTEGRATION_DISCONNECTED` ("Reconnect Motive…").
 *   - `InsufficientScopeError` (403) → `PROVIDER_REAUTH_REQUIRED` — a
 *     refresh keeps the same granted scopes, so the fix is re-consent.
 *   - Anything else → `PROVIDER_ERROR` with a static message.
 *
 * Access gating is central: `motive` is an ACCOUNT credential
 * (core/integrations/credentialSharing.ts), so
 * `services/options/resolveOptionsSource.ts` account-shares these
 * resolvers — no creator pinning, and no resolver-side auth logic.
 * Labels stay recognizable but never leak tokens/credential-labels/owner-ids.
 */

export function requireMotiveIntegration(
  ctx: OptionsResolverContext,
): IntegrationRecord {
  if (!ctx.integration) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "No active Motive connection. Connect Motive first.",
    );
  }
  return ctx.integration;
}

/** Map a wrapper/API failure to a sanitized OptionsResolverError. Never returns. */
export function mapMotiveOptionsError(err: unknown, what: string): never {
  if (
    err instanceof IntegrationActionRequiredError ||
    err instanceof Unauthorized401Error
  ) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "Reconnect Motive and try again.",
    );
  }
  if (err instanceof InsufficientScopeError) {
    throw new OptionsResolverError(
      "PROVIDER_REAUTH_REQUIRED",
      "Your Motive connection is missing a required permission. Reconnect Motive to grant it.",
    );
  }
  throw new OptionsResolverError(
    "PROVIDER_ERROR",
    `Couldn't load Motive ${what}. Try again.`,
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
