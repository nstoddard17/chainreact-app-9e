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
 * Shared guards + error mapping for the Typeform options resolvers —
 * Slice 5.TYPEFORM-1. Mirrors the Asana/Trello/Monday `_shared` posture.
 *
 * Error sanitization (nothing provider-raw reaches the browser):
 *   - `IntegrationActionRequiredError` / leaked `Unauthorized401Error`
 *     → `INTEGRATION_DISCONNECTED` ("Reconnect Typeform…").
 *   - `InsufficientScopeError` (403) → `PROVIDER_REAUTH_REQUIRED` — a
 *     refresh keeps the same granted scopes, so the fix is re-consent.
 *   - Anything else → `PROVIDER_ERROR` with a static message.
 *
 * Personal-credential gating (NOT_WORKFLOW_OWNER / OWNER_MUST_CONNECT)
 * is enforced centrally by `services/options/resolveOptionsSource.ts`
 * via the `typeform: "personal"` classification — resolvers never see a
 * non-owner request for a team workflow.
 */

export function requireTypeformIntegration(
  ctx: OptionsResolverContext,
): IntegrationRecord {
  if (!ctx.integration) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "No active Typeform connection. Connect Typeform first.",
    );
  }
  return ctx.integration;
}

/** Map a wrapper/API failure to a sanitized OptionsResolverError. Never returns. */
export function mapTypeformOptionsError(err: unknown, what: string): never {
  if (
    err instanceof IntegrationActionRequiredError ||
    err instanceof Unauthorized401Error
  ) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "Reconnect Typeform and try again.",
    );
  }
  if (err instanceof InsufficientScopeError) {
    throw new OptionsResolverError(
      "PROVIDER_REAUTH_REQUIRED",
      "Your Typeform connection is missing a required permission. Reconnect Typeform to grant it.",
    );
  }
  throw new OptionsResolverError(
    "PROVIDER_ERROR",
    `Couldn't load Typeform ${what}. Try again.`,
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
