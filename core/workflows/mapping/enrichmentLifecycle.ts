/**
 * When preview enrichment may run (TYPEFORM-AGENT-PREVIEW-ENRICHMENT-CLOSEOUT-1).
 *
 * Pure decision logic, deliberately separated from the React effect that acts on it. The lifecycle
 * rules are the part that is easy to get subtly wrong — enrich twice, enrich on every render, enrich
 * from a stale resolver response, or loop forever because enriching changes the state the effect
 * depends on — and all of that is testable here without rendering anything.
 *
 * PROVIDER-NEUTRAL BY CONSTRUCTION. Nothing here knows what a form, a spreadsheet or a CRM object is.
 * The only question it asks is "did a declared dynamic-output source resolve to a schema I have not
 * already enriched this proposal with?". A trigger becomes eligible by declaring
 * `dynamicOutputSource` in its metadata — never by being a particular provider.
 *
 * Loop prevention is an IDENTITY, not a flag: enrichment is keyed on
 * `(proposal, trigger node, selected resource, resolved schema)`. Enriching changes the proposal's
 * CONTENT but not that identity, so the effect settles after exactly one pass. A boolean "already
 * enriched" flag would be wrong — it could not tell "same schema again" (skip) from "the user picked
 * a different form" (enrich again).
 */

/** Status the resolver layer reports. Mirrors the builder hook's union, minus its UI-only members. */
export type DynamicOutputsReadiness =
  | "not_applicable"
  | "waiting_for_config"
  | "loading"
  | "ready"
  | "empty"
  | "retryable_error"
  | "reconnect_required"
  | "not_found";

export interface EnrichmentIdentityInput {
  /** Stable id of the proposal being previewed. Distinguishes one agent proposal from the next. */
  readonly proposalId: string;
  /** The trigger node supplying the dynamic outputs. */
  readonly triggerNodeId: string;
  /** The selected resource driving the schema (form id, sheet id, object type…). Opaque here. */
  readonly resourceValue: string;
  /** The resolved dynamic output keys. ORDER-INSENSITIVE — a reordered schema is the same schema. */
  readonly outputKeys: readonly string[];
}

/**
 * A stable fingerprint for one (proposal, trigger, resource, schema) combination.
 *
 * Sorted keys mean a provider returning its fields in a different order does not look like a new
 * schema and re-trigger enrichment. Lengths are included so `["ab"]` and `["a","b"]` cannot collide.
 */
export function computeEnrichmentIdentity(input: EnrichmentIdentityInput): string {
  const keys = [...input.outputKeys].sort();
  const schema = keys.map((k) => `${k.length}:${k}`).join(",");
  return [input.proposalId, input.triggerNodeId, input.resourceValue, schema].join("|");
}

export interface EnrichmentGateInput {
  readonly status: DynamicOutputsReadiness;
  /** Identity of the currently-resolved schema, or null when there is nothing resolved. */
  readonly identity: string | null;
  /** Identity of the last COMPLETED enrichment, or null if none has run for this preview. */
  readonly lastEnrichedIdentity: string | null;
  /** True once the user has applied or dismissed the preview — enrichment must stop. */
  readonly previewClosed: boolean;
}

export type EnrichmentDecision =
  | { readonly enrich: true; readonly identity: string }
  | { readonly enrich: false; readonly skipReason: EnrichmentSkipReason };

export type EnrichmentSkipReason =
  | "no_dynamic_source"
  | "awaiting_resource"
  | "loading"
  | "resolver_failed"
  | "empty_schema"
  | "already_enriched"
  | "preview_closed";

/**
 * The single gate. Every "do not enrich" case in the spec maps to exactly one skip reason, so a
 * surprising non-enrichment is diagnosable rather than mysterious.
 */
export function decideEnrichment(input: EnrichmentGateInput): EnrichmentDecision {
  // Applied/dismissed wins over everything: a late resolve must not mutate a preview that is gone.
  if (input.previewClosed) return { enrich: false, skipReason: "preview_closed" };

  switch (input.status) {
    case "not_applicable":
      return { enrich: false, skipReason: "no_dynamic_source" };
    case "waiting_for_config":
      return { enrich: false, skipReason: "awaiting_resource" };
    case "loading":
      return { enrich: false, skipReason: "loading" };
    case "retryable_error":
    case "reconnect_required":
    case "not_found":
      // A failed resolve carries no schema; enriching from nothing would only clear real fields.
      return { enrich: false, skipReason: "resolver_failed" };
    case "empty":
      return { enrich: false, skipReason: "empty_schema" };
    case "ready":
      break;
  }

  if (input.identity === null) return { enrich: false, skipReason: "empty_schema" };
  // The identity check is what makes this idempotent AND what lets a genuine resource change re-run.
  if (input.identity === input.lastEnrichedIdentity) {
    return { enrich: false, skipReason: "already_enriched" };
  }
  return { enrich: true, identity: input.identity };
}
