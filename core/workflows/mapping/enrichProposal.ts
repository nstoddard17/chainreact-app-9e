/**
 * Preview enrichment after a schema-dependent resource is chosen
 * (TYPEFORM-DYNAMIC-OUTPUTS-UI-AND-AGENT-CLOSEOUT-1, Phase 5).
 *
 * The last gap in the arc. The agent proposes the right four nodes but cannot map anything yet,
 * because the trigger's per-question outputs do not exist until the user picks a form. This module
 * runs the moment they pick it: it takes the EXISTING proposal plus the now-resolved upstream
 * outputs, fills the fields it can justify, and leaves everything else alone.
 *
 * The whole design is about what it must NOT do. It never rebuilds the workflow, never adds or
 * removes a node or edge, never touches a value the user typed, and never persists anything — it
 * returns a new definition object for the SAME preview, and Apply stays the only way anything
 * reaches the draft. That is why it is a pure function over the definition rather than a mutation
 * pass inside the builder store.
 *
 * Provenance is the crux of "user values always win". A non-empty field is NOT evidence of user
 * ownership — the agent fills fields too. So the caller passes the set of fields the AGENT wrote
 * (`agentOwnedFields`); anything outside that set is treated as the user's and is never rewritten,
 * and anything inside it is re-evaluated only while it is still unresolved.
 */

import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import {
  buildSummaryBody,
  mapFieldSemantically,
  toReference,
  type MappingCandidate,
} from "./semanticFieldMapping";

/** One destination field the enricher may fill, as its registry metadata describes it. */
export interface EnrichableField {
  readonly name: string;
  readonly label?: string | undefined;
  readonly type?: string | undefined;
  /** True when the platform treats this as a long-form body (drives summary construction). */
  readonly isBody?: boolean | undefined;
}

export interface EnrichNodeSpec {
  readonly nodeId: string;
  readonly fields: readonly EnrichableField[];
}

/** Why a field was left for the user. Surfaced in the preview so the reason is visible, not implied. */
export type EnrichmentNoteKind = "ambiguous" | "missing";

export interface EnrichmentNote {
  readonly nodeId: string;
  readonly field: string;
  readonly kind: EnrichmentNoteKind;
  /** Safe, user-facing sentence. Never a raw provider error or a value. */
  readonly message: string;
  /** For `ambiguous`: the paths the user must choose between. */
  readonly candidates?: readonly string[];
}

export interface EnrichProposalInput {
  /** The proposal exactly as it stands. Returned unchanged when nothing can be enriched. */
  readonly definition: WorkflowDefinition;
  /** The source id downstream references use — the trigger node's real id. */
  readonly sourceId: string;
  /** Upstream outputs now available (static + resolved dynamic), flattened to reference paths. */
  readonly candidates: readonly MappingCandidate[];
  /** Which nodes/fields may be considered, from the real registry metadata. */
  readonly nodeSpecs: readonly EnrichNodeSpec[];
  /**
   * Fields the AGENT wrote, per node id. Only these are eligible. A field absent here is the user's
   * and is never touched — including a field they deliberately cleared.
   */
  readonly agentOwnedFields: Readonly<Record<string, readonly string[]>>;
  /** True when the user's request asked for a summary/digest, enabling body construction. */
  readonly wantsSummary?: boolean | undefined;
  /** Heading for a constructed summary body. */
  readonly summaryHeading?: string | undefined;
}

export interface EnrichProposalResult {
  readonly definition: WorkflowDefinition;
  /** `nodeId.field` → the reference written. Drives the "automatically mapped" preview state. */
  readonly mapped: Readonly<Record<string, string>>;
  readonly notes: readonly EnrichmentNote[];
  readonly changed: boolean;
}

/** A value counts as unresolved when it is absent or blank. `false` and `0` are real values. */
function isUnresolved(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/**
 * Enrich a proposal in place-ally (returning a new object), filling only justified fields.
 *
 * Ordering note: the summary body is built LAST and only from candidates, never from other nodes'
 * mapped values, so it cannot cascade one bad mapping into the email a human reads.
 */
export function enrichProposal(input: EnrichProposalInput): EnrichProposalResult {
  const mapped: Record<string, string> = {};
  const notes: EnrichmentNote[] = [];
  const specsByNode = new Map(input.nodeSpecs.map((s) => [s.nodeId, s]));
  let changed = false;

  const nodes = input.definition.nodes.map((node) => {
    const spec = specsByNode.get(node.id);
    if (!spec) return node;
    const owned = new Set(input.agentOwnedFields[node.id] ?? []);
    if (owned.size === 0) return node;

    const config: Record<string, unknown> = { ...(node.config ?? {}) };
    let nodeChanged = false;

    for (const field of spec.fields) {
      // Three independent gates, all required: the agent must own it, it must still be unresolved,
      // and it must not be the summary body (handled separately below).
      if (!owned.has(field.name)) continue;
      if (!isUnresolved(config[field.name])) continue;
      if (field.isBody === true && input.wantsSummary === true) continue;

      const outcome = mapFieldSemantically(field, input.candidates);
      if (outcome.kind === "mapped") {
        const reference = toReference(input.sourceId, outcome.candidate);
        config[field.name] = reference;
        mapped[`${node.id}.${field.name}`] = reference;
        nodeChanged = true;
      } else if (outcome.kind === "ambiguous") {
        // Deliberately map NOTHING and say why — picking one silently is a guess wearing a
        // confident face, and the user is the only one who knows which address they meant.
        notes.push({
          nodeId: node.id,
          field: field.name,
          kind: "ambiguous",
          message: `More than one field could fill '${field.label ?? field.name}'. Choose which one to use.`,
          candidates: outcome.candidates.map((c) => c.label),
        });
      } else if (outcome.kind === "missing") {
        notes.push({
          nodeId: node.id,
          field: field.name,
          kind: "missing",
          message: `The selected source has no field that matches '${field.label ?? field.name}'. Pick one manually or leave it blank.`,
        });
      }
    }

    // Summary body: built from the candidate set, only when the request asked for one.
    if (input.wantsSummary === true) {
      const bodyField = spec.fields.find((f) => f.isBody === true);
      if (bodyField && owned.has(bodyField.name) && isUnresolved(config[bodyField.name])) {
        const body = buildSummaryBody(input.sourceId, input.candidates, {
          ...(input.summaryHeading ? { heading: input.summaryHeading } : {}),
        });
        if (body !== null) {
          config[bodyField.name] = body;
          mapped[`${node.id}.${bodyField.name}`] = body;
          nodeChanged = true;
        }
      }
    }

    if (!nodeChanged) return node;
    changed = true;
    return { ...node, config };
  });

  // Identity preserved when nothing changed, so a no-op enrichment cannot mark the preview dirty.
  if (!changed) return { definition: input.definition, mapped, notes, changed: false };
  return { definition: { ...input.definition, nodes }, mapped, notes, changed: true };
}

/**
 * After the chosen resource CHANGES, find references that no longer resolve.
 *
 * Returns the fields pointing at a path the new schema does not contain. They are reported, never
 * silently repointed: repointing `company` at whatever now sits in that slot is exactly the
 * positional-mapping bug this whole arc removed, just relocated to the UI.
 */
export function findInvalidatedMappings(input: {
  readonly definition: WorkflowDefinition;
  readonly sourceId: string;
  readonly validPaths: readonly string[];
}): readonly { nodeId: string; field: string; reference: string }[] {
  const valid = new Set(input.validPaths);
  const prefix = `{{${input.sourceId}.`;
  const out: { nodeId: string; field: string; reference: string }[] = [];

  for (const node of input.definition.nodes) {
    for (const [field, value] of Object.entries(node.config ?? {})) {
      if (typeof value !== "string" || !value.includes(prefix)) continue;
      // Every reference to this source in the value must still exist in the new schema.
      const matches = value.matchAll(/\{\{([^}]+)\}\}/g);
      for (const match of matches) {
        const token = match[1]!.trim();
        if (!token.startsWith(`${input.sourceId}.`)) continue;
        const path = token.slice(input.sourceId.length + 1);
        if (!valid.has(path)) {
          out.push({ nodeId: node.id, field, reference: `{{${token}}}` });
          break;
        }
      }
    }
  }
  return out;
}
