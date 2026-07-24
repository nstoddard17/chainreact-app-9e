/**
 * Non-OAuth / system pseudo-providers — the single source of truth.
 *
 * Some workflow nodes carry a `provider` id that is NOT an external OAuth
 * integration: they ship without a `ProviderManifest`, without an OAuth dance,
 * and without an `integrations` row. Today that is exactly `native` — the system
 * provider behind manual_trigger, scheduled_trigger, http_request,
 * format_transformer, delay, router, and if/then (and future control-flow nodes
 * like loop). See docs/slices/parity/native-nodes-1-tier-a-plan.md §7.
 *
 * Every place that derives "which providers does this workflow REQUIRE a
 * connection for" must skip these — otherwise a workflow using any system node
 * is wrongly treated as needing an OAuth connection it can never have:
 *   - activation/resume preconditions (`services/triggers/preconditions.ts`)
 *   - planner integration availability (`services/ai/tools/workflowContext.ts`)
 *   - connection diagnostics (`services/diagnostics/integrationConnection.ts`)
 *
 * This used to be a per-file `new Set(["native"])` duplicated across those
 * callers; the copies drifted (the diagnostics path forgot it, surfacing a false
 * "this provider isn't recognized" / "replace the native node" finding for a
 * valid Manual Run trigger). Centralizing it removes that drift risk.
 *
 * NARROW BY DESIGN: this set is ONLY the system/non-OAuth pseudo-providers. It is
 * NOT a generic "ignore unknown providers" switch — an unknown EXTERNAL provider
 * must still surface as `PROVIDER_UNKNOWN`.
 */

import { CONNECTIONLESS_PROVIDERS } from "./connectionlessProviders";

/**
 * The non-OAuth/system pseudo-provider ids. Keep this narrow.
 *
 * AI-PROVIDER-ROLLOUT-1 — derived from `CONNECTIONLESS_PROVIDERS`
 * (`native` + `ai`) instead of a hand-copied `["native"]`. The two lists
 * describe the same fact — "this provider has no manifest, no OAuth, no
 * integrations row" — and maintaining them separately is exactly the drift
 * this module exists to prevent: live activation of the first AI workflow
 * failed with `INTEGRATION_NOT_CONNECTED: "Connect ai"` because this copy
 * predated the CS-4 `ai` provider and nothing updated it.
 */
export const NON_OAUTH_PROVIDERS: ReadonlySet<string> = new Set(
  CONNECTIONLESS_PROVIDERS,
);

/**
 * True when `provider` is a non-OAuth/system pseudo-provider (no manifest, no
 * OAuth, no `integrations` row) and must be excluded from external
 * provider-connection requirements. A null/undefined/empty provider is NOT a
 * non-OAuth provider (callers handle the "no provider" case separately).
 */
export function isNonOauthProvider(
  provider: string | null | undefined,
): boolean {
  return provider != null && NON_OAUTH_PROVIDERS.has(provider);
}
