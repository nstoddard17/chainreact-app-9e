"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { OutputMeta } from "@/contracts/actionMeta";
import {
  computeEnrichmentIdentity,
  decideEnrichment,
  type DynamicOutputsReadiness,
  type EnrichmentSkipReason,
} from "@/core/workflows/mapping/enrichmentLifecycle";
import {
  enrichProposal,
  type EnrichmentNote,
  type EnrichNodeSpec,
} from "@/core/workflows/mapping/enrichProposal";
import type { MappingCandidate } from "@/core/workflows/mapping/semanticFieldMapping";

/**
 * The missing wire: run proposal enrichment when a trigger's dynamic outputs resolve
 * (TYPEFORM-AGENT-PREVIEW-ENRICHMENT-CLOSEOUT-1).
 *
 * Everything this needs already existed — the dynamic-output merger, the semantic mapper, the
 * enricher, the preview state owner. This hook is only the connective tissue: it watches the
 * resolve state, asks the pure lifecycle gate whether to act, and hands the result back to the
 * SAME preview. It builds nothing new and rebuilds nothing.
 *
 * PROVIDER-NEUTRAL. It never inspects a provider id or a source name; eligibility comes entirely
 * from the generic dynamic-output status the trigger's metadata declaration produces. A future
 * spreadsheet-columns or CRM-properties trigger flows through this unchanged.
 *
 * Loop safety: the effect keys on the enrichment IDENTITY (proposal + trigger + resource + schema),
 * not on the proposal object. Enriching changes the proposal's content but not its identity, so the
 * effect settles after one pass; a genuine resource change produces a new identity and re-runs.
 */

export interface PreviewEnrichmentInput {
  /** The proposal currently previewed, or null when no preview is open. */
  readonly definition: WorkflowDefinition | null;
  /** Stable id for this proposal (so a NEW proposal is allowed to enrich again). */
  readonly proposalId: string | null;
  /** The trigger node whose outputs may be dynamic. */
  readonly triggerNodeId: string | null;
  /** Value of the config field driving the schema (opaque — a form id, sheet id, object type…). */
  readonly resourceValue: string | null;
  /** Generic readiness of that trigger's dynamic outputs. */
  readonly status: DynamicOutputsReadiness;
  /** The merged outputs (static + dynamic) for the trigger node. */
  readonly outputs: readonly OutputMeta[];
  /** The output name whose children are the dynamic ones (from the trigger's declaration). */
  readonly dynamicAttachUnder: string | null;
  /** Destination fields eligible for enrichment, from real registry metadata. */
  readonly nodeSpecs: readonly EnrichNodeSpec[];
  /** Provenance: which fields the AGENT wrote, per node. Everything else belongs to the user. */
  readonly agentOwnedFields: Readonly<Record<string, readonly string[]>>;
  /** True when the original request asked for a summary/digest. */
  readonly wantsSummary?: boolean | undefined;
  readonly summaryHeading?: string | undefined;
  /** True once applied or dismissed — enrichment must not touch a closed preview. */
  readonly previewClosed?: boolean | undefined;
  /** Called with the enriched definition. The preview owner decides how to store it. */
  readonly onEnriched: (result: {
    readonly definition: WorkflowDefinition;
    readonly mapped: Readonly<Record<string, string>>;
    readonly notes: readonly EnrichmentNote[];
  }) => void;
}

export interface PreviewEnrichmentResult {
  /** `nodeId.field` → reference, from the last completed enrichment. Drives the "mapped" chips. */
  readonly mapped: Readonly<Record<string, string>>;
  /** Ambiguous / missing notes from the last enrichment. */
  readonly notes: readonly EnrichmentNote[];
  /** Why the last evaluation did not enrich (null when it did). Diagnostic, not user-facing copy. */
  readonly skipReason: EnrichmentSkipReason | null;
}

const NO_MAPPED: Readonly<Record<string, string>> = Object.freeze({});
const NO_NOTES: readonly EnrichmentNote[] = Object.freeze([]);

/** Flatten the dynamic children of the attach-under output into reference paths. */
function toCandidates(
  outputs: readonly OutputMeta[],
  attachUnder: string | null,
): { candidates: MappingCandidate[]; keys: string[] } {
  if (attachUnder === null) return { candidates: [], keys: [] };
  const parent = outputs.find((o) => o.name === attachUnder);
  if (!parent) return { candidates: [], keys: [] };
  const candidates: MappingCandidate[] = [];
  const keys: string[] = [];
  for (const child of parent.fields ?? []) {
    keys.push(child.name);
    candidates.push({
      path: `${attachUnder}.${child.name}`,
      // The merger stores the human label as the child's description.
      label: child.description ?? child.name,
      type: child.type,
    });
  }
  return { candidates, keys };
}

export function usePreviewEnrichment(input: PreviewEnrichmentInput): PreviewEnrichmentResult {
  const [result, setResult] = useState<PreviewEnrichmentResult>({
    mapped: NO_MAPPED,
    notes: NO_NOTES,
    skipReason: null,
  });

  // The last identity we COMPLETED. A ref, not state: updating it must not itself re-run the effect.
  const lastEnrichedRef = useRef<string | null>(null);

  // Latest inputs, read at effect time. Keeping them out of the dependency list is what stops the
  // effect from re-running when the proposal object changes identity for unrelated reasons.
  const latest = useRef(input);
  latest.current = input;

  const { candidates, keys } = toCandidates(input.outputs, input.dynamicAttachUnder);

  const identity =
    input.proposalId !== null && input.triggerNodeId !== null && input.resourceValue !== null && keys.length > 0
      ? computeEnrichmentIdentity({
          proposalId: input.proposalId,
          triggerNodeId: input.triggerNodeId,
          resourceValue: input.resourceValue,
          outputKeys: keys,
        })
      : null;

  // A new proposal starts with a clean slate, so it may enrich even if its schema matches the old one.
  const proposalId = input.proposalId;
  useEffect(() => {
    lastEnrichedRef.current = null;
  }, [proposalId]);

  const status = input.status;
  const previewClosed = input.previewClosed === true;

  useEffect(() => {
    const decision = decideEnrichment({
      status,
      identity,
      lastEnrichedIdentity: lastEnrichedRef.current,
      previewClosed,
    });
    if (!decision.enrich) {
      setResult((prev) => (prev.skipReason === decision.skipReason ? prev : { ...prev, skipReason: decision.skipReason }));
      return;
    }

    const current = latest.current;
    if (!current.definition || !current.triggerNodeId) return;

    const enriched = enrichProposal({
      definition: current.definition,
      sourceId: current.triggerNodeId,
      candidates,
      nodeSpecs: current.nodeSpecs,
      agentOwnedFields: current.agentOwnedFields,
      ...(current.wantsSummary !== undefined ? { wantsSummary: current.wantsSummary } : {}),
      ...(current.summaryHeading !== undefined ? { summaryHeading: current.summaryHeading } : {}),
    });

    // Mark COMPLETED before notifying, so a synchronous state update from the callback cannot
    // re-enter this effect and enrich the same schema twice.
    lastEnrichedRef.current = decision.identity;
    setResult({ mapped: enriched.mapped, notes: enriched.notes, skipReason: null });

    // A no-op enrichment must not push a "new" definition — that would dirty the preview for nothing.
    if (enriched.changed) {
      current.onEnriched({
        definition: enriched.definition,
        mapped: enriched.mapped,
        notes: enriched.notes,
      });
    }
    // `candidates` is derived from `identity`; depending on the identity string keeps the effect
    // stable across renders that produce an equivalent schema in a new array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, status, previewClosed]);

  return result;
}
