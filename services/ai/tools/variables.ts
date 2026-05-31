/**
 * AI grounding tool for upstream variable availability (Slice 4.AI-2).
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §5.
 *
 * Answers "which variables can node X reference?" by mirroring the runtime
 * contract: the engine seeds `variables[<nodeId>] = <node output>` only AFTER
 * a node executes, so a node may only reference its strict ANCESTORS. This
 * tool returns the flattened output/payload SCHEMA paths of those ancestors —
 * never actual run-data values. Read-only; no model calls.
 *
 * Reuses the pure helpers `findUpstreamNodes` (graph topology) and
 * `formatReference` (canonical `{{nodeId.path}}` token) from core/workflows so
 * the agent and the builder share one definition of "upstream".
 */

import type { OutputMeta, OutputType } from "@/contracts/actionMeta";
import type { WorkflowNode } from "@/contracts/workflow";
import { formatReference } from "@/core/workflows/variableReferences";
import { findUpstreamNodes } from "@/core/workflows/upstreamVariables";
import {
  getActionMeta as lookupActionMeta,
  getTriggerMeta as lookupTriggerMeta,
} from "@/services/discovery/_registry";
import { getById, type WorkflowRecord } from "@/repositories/workflows";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import {
  aiToolErr,
  aiToolOk,
  MAX_AVAILABLE_VARIABLES,
  MAX_OUTPUT_FLATTEN_DEPTH,
  type AiToolResult,
} from "./types";

const TRIGGER_ALIAS = "trigger";

export interface AvailableVariable {
  /** Upstream node id whose output exposes this path. */
  readonly nodeId: string;
  /** `provider:type` of the upstream node. */
  readonly nodeType: string;
  readonly nodeKind: WorkflowNode["kind"];
  /** Dotted path within the upstream output, e.g. `from` or `message.text`. */
  readonly path: string;
  /** Canonical reference token to insert, e.g. `{{n2.message.text}}`. */
  readonly reference: string;
  readonly type: OutputType;
  readonly description?: string;
  /** Preserved from the output metadata's `sensitive` flag. */
  readonly sensitive: boolean;
}

export interface AvailableVariablesView {
  readonly nodeId: string;
  readonly variables: readonly AvailableVariable[];
  /**
   * `"trigger"` when a trigger node is upstream (so `{{trigger.path}}` is also
   * valid at runtime, mirroring the engine's seeded alias); null otherwise.
   */
  readonly triggerAlias: string | null;
  /** Upstream nodes whose metadata is unavailable — their outputs can't be enumerated. */
  readonly unknownUpstreamNodeIds: readonly string[];
  /** True when the variable list was clipped to `MAX_AVAILABLE_VARIABLES`. */
  readonly truncated: boolean;
}

interface FlatOutput {
  readonly path: string;
  readonly type: OutputType;
  readonly description?: string;
  readonly sensitive: boolean;
}

/**
 * Flatten an output tree into dotted paths. A `sensitive` parent is listed but
 * NOT descended into (its subtree is treated as opaque-sensitive, mirroring
 * the redaction helper's "don't descend into a sensitive subtree" rule).
 */
function flattenOutputs(
  outputs: readonly OutputMeta[],
  parentPath: string,
  depth: number,
): FlatOutput[] {
  const out: FlatOutput[] = [];
  for (const o of outputs) {
    const path = parentPath ? `${parentPath}.${o.name}` : o.name;
    const sensitive = o.sensitive === true;
    out.push({
      path,
      type: o.type,
      ...(o.description !== undefined ? { description: o.description } : {}),
      sensitive,
    });
    if (!sensitive && o.fields && o.fields.length > 0 && depth < MAX_OUTPUT_FLATTEN_DEPTH) {
      out.push(...flattenOutputs(o.fields, path, depth + 1));
    }
  }
  return out;
}

/** Resolve a node's output/payload schema, or null when no metadata exists. */
function outputsForNode(node: WorkflowNode): readonly OutputMeta[] | null {
  if (!node.type) return null;
  const key = `${node.provider}:${node.type}`;
  if (node.kind === "trigger") {
    const meta = lookupTriggerMeta(key);
    return meta ? meta.payloadShape : null;
  }
  const meta = lookupActionMeta(key);
  return meta ? meta.outputs : null;
}

export async function getAvailableVariablesForAI(
  userId: string,
  workflowId: string,
  nodeId: string,
): Promise<AiToolResult<AvailableVariablesView>> {
  let record: WorkflowRecord | null;
  try {
    record = await getById(workflowId);
  } catch {
    return aiToolErr("SERVER_ERROR", "Couldn't load the workflow.");
  }
  if (!record) {
    return aiToolErr("NOT_FOUND", `No workflow '${workflowId}'.`);
  }
  // 4.ACCOUNT-MODEL-7: account-ownership guard (defense-in-depth atop RLS).
  // created_by_user_id is provenance and is never consulted here.
  let accountId: string;
  try {
    accountId = (await ensurePersonalAccount(userId)).id;
  } catch {
    return aiToolErr("SERVER_ERROR", "Couldn't load the workflow.");
  }
  if (record.accountId !== accountId) {
    return aiToolErr("NOT_FOUND", `No workflow '${workflowId}'.`);
  }

  const def = record.draftDefinition;
  const nodesById = new Map(def.nodes.map((n) => [n.id, n]));
  if (!nodesById.has(nodeId)) {
    return aiToolErr("NOT_FOUND", `No node '${nodeId}' in workflow '${workflowId}'.`);
  }

  const ancestorIds = [
    ...findUpstreamNodes({ currentNodeId: nodeId, nodes: def.nodes, edges: def.edges }),
  ].sort();

  const variables: AvailableVariable[] = [];
  const unknownUpstreamNodeIds: string[] = [];
  let triggerAlias: string | null = null;
  let truncated = false;

  for (const ancestorId of ancestorIds) {
    const node = nodesById.get(ancestorId);
    if (!node) continue;
    if (node.kind === "trigger") triggerAlias = TRIGGER_ALIAS;

    const outputs = outputsForNode(node);
    if (outputs === null) {
      unknownUpstreamNodeIds.push(ancestorId);
      continue;
    }

    const nodeType = `${node.provider}:${node.type}`;
    for (const flat of flattenOutputs(outputs, "", 0)) {
      if (variables.length >= MAX_AVAILABLE_VARIABLES) {
        truncated = true;
        break;
      }
      variables.push({
        nodeId: ancestorId,
        nodeType,
        nodeKind: node.kind,
        path: flat.path,
        reference: formatReference({ nodeId: ancestorId, path: flat.path }),
        type: flat.type,
        ...(flat.description !== undefined ? { description: flat.description } : {}),
        sensitive: flat.sensitive,
      });
    }
    if (truncated) break;
  }

  return aiToolOk({
    nodeId,
    variables,
    triggerAlias,
    unknownUpstreamNodeIds,
    truncated,
  });
}
