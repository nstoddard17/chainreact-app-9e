import type { ActivationFn } from "@/services/triggers/activationRegistry";
import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";

/**
 * Shared APP-LEVEL trigger lifecycle for all four QuickBooks triggers —
 * QUICKBOOKS-1.
 *
 * Intuit webhooks are configured ONCE per app in the developer portal
 * (endpoint URL + entity checklist + verifier token, per environment).
 * There is NO per-workflow provider webhook to create or delete, so:
 *
 *   - **Activation creates NO provider resource.** It validates the
 *     integration and returns the config patch that the lifecycle's
 *     `trigger_resources` upsert persists — that row IS the internal
 *     trigger-interest registration the receive route fans out to.
 *     `realmId` (the integration's providerAccountId) is stamped into
 *     the config so the P-S2 dispatch filter can fail-closed scope
 *     events to this company.
 *   - **Deactivation deletes NO provider resource** — removing the
 *     trigger_resources row IS the interest removal (Dropbox app-level
 *     precedent: no remote create → no remote delete).
 *   - **No renewal** — Intuit webhooks don't expire; no
 *     `type: "subscription-watch"` marker, so the renewal cron never
 *     touches these rows.
 */

export const quickbooksAppLevelActivate: ActivationFn = async ({
  integration,
}) => {
  const realmId = integration.providerAccountId;
  if (typeof realmId !== "string" || realmId.length === 0) {
    // Defensive — oauth.ts refuses to persist a row without a realmId,
    // so this only fires on a corrupted row. Fail activation loudly
    // rather than register an interest row no event could ever match.
    throw new Error(
      "quickbooks trigger activate: the integration row has no realmId (providerAccountId). Reconnect QuickBooks.",
    );
  }
  return {
    appLevelWebhook: true,
    realmId,
  };
};

export const quickbooksAppLevelDeactivate: DeactivationFn = async () => {
  // Intentionally a no-op: the app-level Intuit webhook is shared
  // infrastructure; the lifecycle layer deleting the trigger_resources
  // row is the entire deactivation.
};
