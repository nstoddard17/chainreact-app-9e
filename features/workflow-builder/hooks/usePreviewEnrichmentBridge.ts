"use client";

import { useCallback, useMemo } from "react";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import {
  findInvalidatedMappings,
  type EnrichNodeSpec,
  type EnrichmentNote,
} from "@/core/workflows/mapping/enrichProposal";
import { dynamicOutputPath } from "@/core/workflows/mapping/dynamicTriggerOutputs";
import {
  toAgentOwnedFields,
  type PreviewFieldProvenance,
} from "@/core/workflows/mapping/previewProvenance";
import {
  useDynamicTriggerOutputs,
  type DynamicTriggerOutputsStatus,
} from "./useDynamicTriggerOutputs";
import { usePreviewEnrichment } from "./usePreviewEnrichment";
import {
  findProviderActionByKey,
  useProviderActionsForProviders,
} from "./useProviderActions";
import {
  findProviderTriggerByKey,
  useProviderTriggers,
} from "./useProviderTriggers";

/**
 * The bridge between the preview owner and the enrichment hook
 * (REACT-AGENT-PREVIEW-PROVENANCE-CLOSEOUT-1).
 *
 * `usePreviewEnrichment` was written complete but never called — it needs a resolved trigger schema
 * and real registry metadata, and `useBuilderPreview` has neither. This hook supplies exactly that
 * and nothing else: it resolves the PROPOSAL's trigger + action metadata through the same catalog
 * hooks the rest of the builder uses, runs the generic dynamic-output resolver over the proposal's
 * (not the draft's) trigger config, and hands the result to the enricher.
 *
 * Why it cannot reuse `useUpstreamVariables`: that hook reads `pendingNodes` — the LIVE draft. A
 * preview's nodes do not exist in the draft until Apply, which is the entire point of a preview. So
 * the resolution has to run over `previewOverlay.proposedDefinition` instead.
 *
 * PROVIDER-NEUTRAL. Eligibility comes from the trigger metadata's generic `dynamicOutputSource`
 * declaration — a config field, a resolver id, and an attach point. Nothing here names a provider,
 * a resource kind, or a key format.
 *
 * Hook profile is FIXED: every hook below is called unconditionally, with `null` / `[]` when there is
 * no preview. Those are the established disabled forms — `useProviderTriggers(null)` and
 * `useProviderActionsForProviders([])` short-circuit to idle without fetching — so an open builder
 * with no preview issues no extra requests.
 */

export interface PreviewEnrichmentBridgeResult {
  /** `nodeId.field` → reference written by the last enrichment. Drives the "mapped" rows. */
  readonly mapped: Readonly<Record<string, string>>;
  /**
   * `nodeId.field` → the upstream field's HUMAN label, so the preview can say "Mapped from upstream:
   * Work email" rather than echoing an encoded path the user never chose and cannot interpret.
   */
  readonly mappedLabels: Readonly<Record<string, string>>;
  /** True when the trigger declares a schema-dependent source whose resource is not chosen yet. */
  readonly awaitingResource: boolean;
  /** Ambiguous / missing explanations from the last enrichment. */
  readonly notes: readonly EnrichmentNote[];
  /** Generic resolve state of the proposal trigger's dynamic outputs. */
  readonly status: DynamicTriggerOutputsStatus;
  /** Safe, user-facing copy for a non-ready state. Never a raw provider error. */
  readonly message: string | null;
  /** Retry the schema resolve. No-op unless the status is a retryable error. */
  readonly retry: () => void;
  /**
   * Mappings pointing at a path the CURRENT schema no longer contains — reported after the user
   * changes the selected resource, never silently repointed.
   */
  readonly invalidated: readonly { nodeId: string; field: string; reference: string }[];
}

const NO_MAPPED: Readonly<Record<string, string>> = Object.freeze({});
const NO_NOTES: readonly EnrichmentNote[] = Object.freeze([]);
const NO_INVALID: readonly { nodeId: string; field: string; reference: string }[] = Object.freeze([]);
const NO_SPECS: readonly EnrichNodeSpec[] = Object.freeze([]);
const NO_PROVIDERS: readonly string[] = Object.freeze([]);

/**
 * Which of an action's fields the enricher may consider.
 *
 * Deliberately conservative and metadata-driven: a field must be a plain value the mapper can fill
 * with a reference. Structured editors (rows, schemas, files, cron) are excluded — a `{{…}}` string
 * is not a valid value for them, so "mapping" one would produce config the runtime cannot use.
 * Credential/connection material is excluded outright: those are never the agent's to choose.
 */
const ENRICHABLE_FIELD_TYPES = new Set(["text", "textarea", "select", "combobox", "number", "date", "datetime"]);

function toNodeSpec(nodeId: string, meta: ActionMeta): EnrichNodeSpec {
  const fields = meta.fields
    .filter((f) => ENRICHABLE_FIELD_TYPES.has(f.type))
    .filter((f) => f.sensitivity !== "secret" && f.sensitivity !== "connection")
    .map((f) => ({
      name: f.name,
      label: f.label,
      type: f.type,
      // A long-form field is where a generated summary belongs. Metadata decides, not a name match.
      ...(f.type === "textarea" ? { isBody: true } : {}),
    }));
  return { nodeId, fields };
}

export function usePreviewEnrichmentBridge(input: {
  /** The proposal being previewed, or null when no EDIT preview is open. */
  readonly definition: WorkflowDefinition | null;
  /** Stable id for this proposal, so a NEW proposal may enrich again. */
  readonly proposalId: string | null;
  /** Fields the AGENT owns, per node id — everything else belongs to the user. */
  readonly agentOwnedFields: Readonly<Record<string, readonly string[]>>;
  /** True once applied or dismissed. */
  readonly previewClosed: boolean;
  /** True when the original request asked for a summary/digest. */
  readonly wantsSummary?: boolean | undefined;
  readonly summaryHeading?: string | undefined;
  /** Receives the enriched proposal. The preview owner decides how to store it. */
  readonly onEnriched: (definition: WorkflowDefinition) => void;
  readonly workflowId?: string | undefined;
}): PreviewEnrichmentBridgeResult {
  const definition = input.definition;

  // The proposal's trigger — the only node whose outputs can be schema-dependent.
  const triggerNode = useMemo(
    () => definition?.nodes.find((n) => n.kind === "trigger") ?? null,
    [definition],
  );

  // ── metadata resolution (disabled forms when there is no preview) ─────────────────────────────
  const providerTriggers = useProviderTriggers(triggerNode?.provider ?? null);
  const triggerMeta = useMemo(() => {
    if (!triggerNode) return undefined;
    return findProviderTriggerByKey(providerTriggers.triggers, `${triggerNode.provider}:${triggerNode.type}`);
  }, [triggerNode, providerTriggers.triggers]);

  const actionProviderIds = useMemo(() => {
    if (!definition) return NO_PROVIDERS;
    return [...new Set(definition.nodes.filter((n) => n.kind === "action").map((n) => n.provider))];
  }, [definition]);
  const providerActions = useProviderActionsForProviders(actionProviderIds);

  // ── generic dynamic-output resolution over the PROPOSAL's trigger config ─────────────────────
  const dynamic = useDynamicTriggerOutputs({
    meta: triggerMeta,
    config: triggerNode?.config,
    ...(triggerNode ? { nodeId: triggerNode.id } : {}),
    ...(input.workflowId !== undefined ? { workflowId: input.workflowId } : {}),
  });

  const declaration = triggerMeta?.dynamicOutputSource;
  const attachUnder = declaration?.attachUnder ?? null;
  const resourceValue = useMemo(() => {
    if (!declaration || !triggerNode) return null;
    const raw = triggerNode.config?.[declaration.configField];
    return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
  }, [declaration, triggerNode]);

  const nodeSpecs = useMemo<readonly EnrichNodeSpec[]>(() => {
    if (!definition) return NO_SPECS;
    const specs: EnrichNodeSpec[] = [];
    for (const node of definition.nodes) {
      if (node.kind !== "action") continue;
      const meta = findProviderActionByKey(
        providerActions.byProvider[node.provider] ?? [],
        `${node.provider}:${node.type}`,
      );
      if (!meta) continue; // catalog still loading, or unknown capability — never guessed at
      specs.push(toNodeSpec(node.id, meta));
    }
    return specs;
  }, [definition, providerActions.byProvider]);

  const onEnriched = input.onEnriched;
  const enrichment = usePreviewEnrichment({
    definition,
    proposalId: input.proposalId,
    triggerNodeId: triggerNode?.id ?? null,
    resourceValue,
    status: dynamic.status,
    outputs: dynamic.outputs,
    dynamicAttachUnder: attachUnder,
    nodeSpecs,
    agentOwnedFields: input.agentOwnedFields,
    ...(input.wantsSummary !== undefined ? { wantsSummary: input.wantsSummary } : {}),
    ...(input.summaryHeading !== undefined ? { summaryHeading: input.summaryHeading } : {}),
    previewClosed: input.previewClosed,
    onEnriched: (result) => onEnriched(result.definition),
  });

  /**
   * References the NEW schema can no longer satisfy, after the user swapped the selected resource.
   *
   * Computed only when a schema is actually resolved — an error or loading state carries no valid
   * path set, and treating "I don't know the paths" as "none of them are valid" would condemn every
   * correct mapping in the proposal.
   */
  const invalidated = useMemo(() => {
    if (!definition || !triggerNode || !triggerMeta || dynamic.status !== "ready" || attachUnder === null) {
      return NO_INVALID;
    }
    const parent = dynamic.outputs.find((o) => o.name === attachUnder);
    if (!parent) return NO_INVALID;
    // Canonical path composition — the same helper the merger and picker use, so a "valid path" here
    // is character-identical to the one the agent proposed.
    const childPaths = (parent.fields ?? [])
      .map((child) => dynamicOutputPath(triggerMeta, child.name))
      .filter((p): p is string => p !== null);
    const validPaths = [...dynamic.outputs.map((o) => o.name), ...childPaths];
    const found = findInvalidatedMappings({ definition, sourceId: triggerNode.id, validPaths });
    return found.length > 0 ? found : NO_INVALID;
  }, [definition, triggerNode, triggerMeta, dynamic.status, dynamic.outputs, attachUnder]);

  /**
   * Resolve each written reference back to the upstream field's human label.
   *
   * The reference carries the canonical PATH (stable, machine-facing); the label is what the person
   * reading the preview recognises. Matching by path — not by position or by name similarity — keeps
   * the two in step even when the key had to be encoded.
   */
  const mappedLabels = useMemo(() => {
    const mapped = enrichment.mapped;
    if (!triggerNode || attachUnder === null || Object.keys(mapped).length === 0) return NO_MAPPED;
    const parent = dynamic.outputs.find((o) => o.name === attachUnder);
    const labelByPath = new Map<string, string>();
    for (const child of parent?.fields ?? []) {
      labelByPath.set(`${attachUnder}.${child.name}`, child.description ?? child.name);
    }
    const out: Record<string, string> = {};
    for (const [key, reference] of Object.entries(mapped)) {
      // A summary body contains many references; there is no single upstream field to name.
      const match = /^\{\{([^}]+)\}\}$/.exec(reference.trim());
      if (!match) continue;
      const token = match[1]!.trim();
      if (!token.startsWith(`${triggerNode.id}.`)) continue;
      const label = labelByPath.get(token.slice(triggerNode.id.length + 1));
      if (label !== undefined) out[key] = label;
    }
    return out;
  }, [enrichment.mapped, triggerNode, attachUnder, dynamic.outputs]);

  return {
    mapped: enrichment.mapped ?? NO_MAPPED,
    mappedLabels,
    notes: enrichment.notes ?? NO_NOTES,
    status: dynamic.status,
    message: dynamic.message,
    retry: dynamic.retry,
    invalidated,
    awaitingResource: dynamic.status === "waiting_for_config",
  };
}

/** The overlay shape this composition needs — structural, so the preview owner keeps its own type. */
interface EnrichableOverlay {
  readonly proposedDefinition?: WorkflowDefinition | undefined;
  readonly agentChangeId?: string | undefined;
}

/**
 * Bind enrichment to the preview overlay's state.
 *
 * Kept next to the bridge rather than inside the preview owner because it is one idea — "an enriched
 * proposal replaces the SAME overlay's proposal, and nothing else about that overlay changes". The
 * updater preserves the plan, the correlation id, the base version and the transcript by construction:
 * it rewrites exactly one field, and only when a proposal is actually being previewed.
 */
export function usePreviewEnrichmentForOverlay<T extends EnrichableOverlay>(input: {
  readonly overlay: T | null;
  readonly setOverlay: (updater: (prev: T | null) => T | null) => void;
  readonly provenance: PreviewFieldProvenance;
  readonly workflowId?: string | undefined;
}): PreviewEnrichmentBridgeResult {
  const setOverlay = input.setOverlay;
  const onEnriched = useCallback(
    (definition: WorkflowDefinition) => {
      setOverlay((prev) =>
        prev && prev.proposedDefinition ? { ...prev, proposedDefinition: definition } : prev,
      );
    },
    [setOverlay],
  );

  const agentOwnedFields = useMemo(() => toAgentOwnedFields(input.provenance), [input.provenance]);

  return usePreviewEnrichmentBridge({
    definition: input.overlay?.proposedDefinition ?? null,
    proposalId: input.overlay?.agentChangeId ?? null,
    agentOwnedFields,
    // No overlay means applied or dismissed — a late resolve must never touch a closed preview.
    previewClosed: input.overlay === null,
    onEnriched,
    ...(input.workflowId !== undefined ? { workflowId: input.workflowId } : {}),
  });
}
