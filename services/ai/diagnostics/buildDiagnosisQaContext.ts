import type { OutputMeta } from "@/contracts/actionMeta";
import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflow";
import { findUpstreamNodes } from "@/core/workflows/upstreamVariables";
import {
  getActionMeta as lookupActionMeta,
  getTriggerMeta as lookupTriggerMeta,
} from "@/services/discovery/_registry";
import type { AgentWorkflowDiagnosisDTO } from "./diagnoseWorkflowForAgent";
import {
  buildDiagnosisExplainContext,
  type DiagnosisExplainContext,
} from "./buildDiagnosisExplainContext";

/**
 * Allow-list projector for the workflow diagnosis Q&A model call (Slice 4.AI-DIAG-QA-2).
 *
 * Q&A reuses the SAME safe diagnosis projection as "Explain with AI"
 * (`buildDiagnosisExplainContext`) — defense-in-depth single allow-list seam — and
 * OPTIONALLY adds a SAFE summary of the data available at the user's selected node.
 *
 * The selected-node summary is **path / type / description / sensitive-flag ONLY**
 * (Marcus decision): NO field VALUES, NO raw node ids, and NO `{{nodeId.path}}`
 * reference tokens (those embed a node id). It is built from the SAME re-derived,
 * already-authorized workflow definition the diagnosis used — not from the personal-
 * account-scoped variables tool — so it is correct for team/business workflows too.
 *
 * Pure + dependency-light (registry meta lookups only); no I/O, no model, no mutation.
 */

/** One safe available-data field for the selected node. Names/types only — never values. */
export interface SelectedNodeDataField {
  /** Dotted output path, e.g. `from` or `message.text`. A field NAME, never a value. */
  readonly path: string;
  /** Output type from the registry metadata. */
  readonly type: string;
  /** Static metadata description, when present. */
  readonly description?: string;
  /** The output metadata's `sensitive` flag (so the model can advise carefully). */
  readonly sensitive: boolean;
}

export interface SelectedNodeDataSummary {
  /** Safe available-data fields (capped). Empty when the node has no enumerable upstream data. */
  readonly available: readonly SelectedNodeDataField[];
  /** True when the list was clipped to the cap (so the model doesn't over-claim completeness). */
  readonly truncated: boolean;
}

export interface DiagnosisQaContext extends DiagnosisExplainContext {
  /** Present only when a valid selectedNodeId resolved to enumerable upstream data. */
  readonly selectedNode?: SelectedNodeDataSummary;
}

/** Hard cap so a huge graph can't bloat the prompt/ledger. */
const MAX_SELECTED_NODE_FIELDS = 60;
/** Output-tree flatten depth cap (mirrors the variables tool). */
const MAX_FLATTEN_DEPTH = 4;

/** Resolve a node's output/payload schema from the registry, or null when unknown. */
function outputsForNode(node: WorkflowNode): readonly OutputMeta[] | null {
  if (!node.type) return null;
  const key = `${node.provider}:${node.type}`;
  if (node.kind === "trigger") return lookupTriggerMeta(key)?.payloadShape ?? null;
  return lookupActionMeta(key)?.outputs ?? null;
}

/**
 * Flatten outputs into safe {path,type,description?,sensitive} entries. A `sensitive`
 * parent is listed but NOT descended into (its subtree is opaque-sensitive — mirrors the
 * variables tool's redaction rule). Never emits a value, node id, or reference token.
 */
function flattenSafe(
  outputs: readonly OutputMeta[],
  parentPath: string,
  depth: number,
  acc: SelectedNodeDataField[],
): void {
  for (const o of outputs) {
    if (acc.length >= MAX_SELECTED_NODE_FIELDS) return;
    const path = parentPath ? `${parentPath}.${o.name}` : o.name;
    const sensitive = o.sensitive === true;
    acc.push({
      path,
      type: o.type,
      ...(o.description !== undefined ? { description: o.description } : {}),
      sensitive,
    });
    if (!sensitive && o.fields && o.fields.length > 0 && depth < MAX_FLATTEN_DEPTH) {
      flattenSafe(o.fields, path, depth + 1, acc);
    }
  }
}

/**
 * Build the SAFE selected-node data summary from an already-authorized workflow
 * definition. Returns undefined when `selectedNodeId` is missing, not a node in this
 * graph (bogus → ignored, never echoed), or has no enumerable upstream data. The summary
 * lists the data a step at `selectedNodeId` could reference (its strict ancestors'
 * output SCHEMA) — names/types only, no values, no ids, no reference tokens.
 */
export function buildSelectedNodeDataSummary(
  def: WorkflowDefinition,
  selectedNodeId: string | undefined,
): SelectedNodeDataSummary | undefined {
  if (!selectedNodeId) return undefined;
  const nodesById = new Map(def.nodes.map((n) => [n.id, n]));
  if (!nodesById.has(selectedNodeId)) return undefined; // bogus id → ignored

  const ancestorIds = [
    ...findUpstreamNodes({ currentNodeId: selectedNodeId, nodes: def.nodes, edges: def.edges }),
  ].sort();

  const available: SelectedNodeDataField[] = [];
  for (const ancestorId of ancestorIds) {
    if (available.length >= MAX_SELECTED_NODE_FIELDS) break;
    const node = nodesById.get(ancestorId);
    if (!node) continue;
    const outputs = outputsForNode(node);
    if (outputs === null) continue; // unknown metadata → skip (no leak, no guess)
    flattenSafe(outputs, "", 0, available);
  }

  if (available.length === 0) return undefined;
  return { available, truncated: available.length >= MAX_SELECTED_NODE_FIELDS };
}

/**
 * Project an access==="OK" diagnosis DTO (+ optional safe selected-node summary) into the
 * Q&A model context. Reuses the explain allow-list verbatim and appends only the safe
 * selected-node summary — never spreads raw DTO/graph data.
 */
export function buildDiagnosisQaContext(
  dto: AgentWorkflowDiagnosisDTO,
  selectedNode?: SelectedNodeDataSummary,
): DiagnosisQaContext {
  const base = buildDiagnosisExplainContext(dto);
  return {
    ...base,
    ...(selectedNode ? { selectedNode } : {}),
  };
}
