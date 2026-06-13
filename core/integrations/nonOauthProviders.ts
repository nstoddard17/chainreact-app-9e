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

/** The non-OAuth/system pseudo-provider ids. Keep this narrow. */
export const NON_OAUTH_PROVIDERS: ReadonlySet<string> = new Set(["native"]);

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
