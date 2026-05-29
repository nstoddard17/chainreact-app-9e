/**
 * System-owned id materialization for AI-proposed patches
 * (Slice 4.BUILDER-NODE-IDENTITY-1).
 *
 * Permanent V2 rule: IDs are owned by the SYSTEM; the planner's node/edge ids
 * are PATCH-LOCAL scratch values that must NEVER be persisted. This helper runs
 * at the AI preview/apply boundary (before `validateWorkflowPatch`) and:
 *
 *   1. Assigns a fresh system-owned opaque id to every AI-created node
 *      (`addNode` / `replaceTrigger`) and edge (`addEdge` / `replaceEdge.edge`).
 *   2. Rewrites every reference to those ids — edge `from`/`to`, op `nodeId`,
 *      and `{{patchLocalId.path}}` variable tokens inside config values /
 *      `repairVariableReference.newReference` — to the assigned system id.
 *   3. Validates reference integrity in one in-order pass (mirrors
 *      `applyPatchToDefinition`'s sequential semantics): a node/edge reference
 *      must resolve to an EXISTING canvas id OR a patch-local id introduced
 *      EARLIER in the same patch. An unknown reference (e.g. `action1` the
 *      model invented for an update) is rejected with UNKNOWN_NODE /
 *      INVALID_EDGE — no silent "map to the only Slack node".
 *   4. Strips any `displayName` off AI-created nodes UNCONDITIONALLY — node
 *      names are owned by the user, never the AI (no flag, no exception).
 *
 * Existing canvas nodes keep their stable ids. The envelope (patchId /
 * baseRevision / workflowId / summary / rationale) is preserved; only
 * `operations` are rewritten. Pure + deterministic given the id generators
 * (tests inject fixed generators).
 */

import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflow";
import {
  formatReference,
  parseReferences,
} from "@/core/workflows/variableReferences";
import type {
  PatchOperation,
  PatchValidationError,
  WorkflowPatch,
} from "@/services/workflows/patch/types";

export interface MaterializeAiPatchNodeIdsOptions {
  /** Override the node id generator (tests inject a deterministic one). */
  readonly nodeIdGen?: () => string;
  /** Override the edge id generator. */
  readonly edgeIdGen?: () => string;
}

export type MaterializeAiPatchNodeIdsResult =
  | {
      readonly ok: true;
      readonly patch: WorkflowPatch;
      /** patch-local node id → assigned system id. */
      readonly nodeIdMap: Readonly<Record<string, string>>;
      /** patch-local edge id → assigned system id. */
      readonly edgeIdMap: Readonly<Record<string, string>>;
    }
  | { readonly ok: false; readonly errors: PatchValidationError[] };

function defaultId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Strip the user-only `displayName` off an AI-created node (defense in depth). */
function stripDisplayName(node: WorkflowNode): WorkflowNode {
  if (node.displayName === undefined) return node;
  const next = { ...node };
  delete next.displayName;
  return next;
}

/**
 * Rewrite `{{patchLocalId.path}}` tokens in a single string to the assigned
 * system id. Tokens whose node id is not in the map (existing-node refs,
 * `{{trigger.field}}` keyword refs, AI_FIELD tokens) are left untouched.
 * Replaces right-to-left so earlier offsets stay valid.
 */
function rewriteRefsInString(
  value: string,
  nodeIdMap: Record<string, string>,
): string {
  const refs = parseReferences(value);
  if (refs.length === 0) return value;
  let out = value;
  for (const ref of [...refs].sort((a, b) => b.offset - a.offset)) {
    const sysId = nodeIdMap[ref.nodeId];
    if (!sysId) continue;
    const replacement = formatReference({ nodeId: sysId, path: ref.path });
    out = out.slice(0, ref.offset) + replacement + out.slice(ref.offset + ref.token.length);
  }
  return out;
}

/** Deep-rewrite variable tokens in any config value (string / array / object). */
function rewriteRefsDeep(value: unknown, nodeIdMap: Record<string, string>): unknown {
  if (typeof value === "string") return rewriteRefsInString(value, nodeIdMap);
  if (Array.isArray(value)) return value.map((v) => rewriteRefsDeep(v, nodeIdMap));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = rewriteRefsDeep(v, nodeIdMap);
    }
    return out;
  }
  return value;
}

function rewriteConfig(
  config: Record<string, unknown>,
  nodeIdMap: Record<string, string>,
): Record<string, unknown> {
  return rewriteRefsDeep(config, nodeIdMap) as Record<string, unknown>;
}

export function materializeAiPatchNodeIds(
  patch: WorkflowPatch,
  currentDef: WorkflowDefinition,
  options: MaterializeAiPatchNodeIdsOptions = {},
): MaterializeAiPatchNodeIdsResult {
  const nodeIdGen = options.nodeIdGen ?? (() => defaultId("node"));
  const edgeIdGen = options.edgeIdGen ?? (() => defaultId("edge"));

  const existingNodeIds = new Set(currentDef.nodes.map((n) => n.id));
  const existingEdgeIds = new Set(currentDef.edges.map((e) => e.id));
  const nodeIdMap: Record<string, string> = {};
  const edgeIdMap: Record<string, string> = {};
  const errors: PatchValidationError[] = [];

  const resolveNode = (id: string, opLabel: string, i: number): string | null => {
    if (existingNodeIds.has(id)) return id;
    if (Object.prototype.hasOwnProperty.call(nodeIdMap, id)) return nodeIdMap[id]!;
    errors.push({
      code: "UNKNOWN_NODE",
      message: `${opLabel} references node '${id}', which is not in the workflow.`,
      nodeId: id,
      operationIndex: i,
    });
    return null;
  };

  const resolveEdge = (id: string, opLabel: string, i: number): string | null => {
    if (existingEdgeIds.has(id)) return id;
    if (Object.prototype.hasOwnProperty.call(edgeIdMap, id)) return edgeIdMap[id]!;
    errors.push({
      code: "INVALID_EDGE",
      message: `${opLabel} references edge '${id}', which is not in the workflow.`,
      edgeId: id,
      operationIndex: i,
    });
    return null;
  };

  // An edge ENDPOINT that resolves to no node is an INVALID_EDGE (the
  // established code — matches `WorkflowDefinitionSchema.superRefine`), not an
  // UNKNOWN_NODE. Keeps the preview/apply error contract stable.
  const resolveEdgeEndpoint = (
    id: string,
    edgeId: string,
    opLabel: string,
    i: number,
  ): string | null => {
    if (existingNodeIds.has(id)) return id;
    if (Object.prototype.hasOwnProperty.call(nodeIdMap, id)) return nodeIdMap[id]!;
    errors.push({
      code: "INVALID_EDGE",
      message: `${opLabel} references unknown node '${id}'.`,
      edgeId,
      operationIndex: i,
    });
    return null;
  };

  const ops = patch.operations ?? [];
  const out: PatchOperation[] = [];

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    switch (op.op) {
      case "addNode":
      case "replaceTrigger": {
        if (Object.prototype.hasOwnProperty.call(nodeIdMap, op.node.id)) {
          errors.push({
            code: "DUPLICATE_NODE_ID",
            message: `Patch introduces node id '${op.node.id}' more than once.`,
            nodeId: op.node.id,
            operationIndex: i,
          });
          break;
        }
        const sysId = nodeIdGen();
        nodeIdMap[op.node.id] = sysId;
        const node = stripDisplayName({
          ...op.node,
          id: sysId,
          config: rewriteConfig(op.node.config, nodeIdMap),
        });
        out.push(op.op === "addNode" ? { op: "addNode", node } : { op: "replaceTrigger", node });
        break;
      }
      case "addEdge": {
        const sysEdgeId = edgeIdGen();
        edgeIdMap[op.edge.id] = sysEdgeId;
        const from = resolveEdgeEndpoint(op.edge.from, op.edge.id, "addEdge", i);
        const to = resolveEdgeEndpoint(op.edge.to, op.edge.id, "addEdge", i);
        if (from === null || to === null) break;
        out.push({ op: "addEdge", edge: { ...op.edge, id: sysEdgeId, from, to } });
        break;
      }
      case "updateNodeConfig": {
        const nodeId = resolveNode(op.nodeId, "updateNodeConfig", i);
        if (nodeId === null) break;
        out.push({ ...op, nodeId, config: rewriteConfig(op.config, nodeIdMap) });
        break;
      }
      case "removeNode": {
        const nodeId = resolveNode(op.nodeId, "removeNode", i);
        if (nodeId === null) break;
        out.push({ op: "removeNode", nodeId });
        break;
      }
      case "moveNode": {
        const nodeId = resolveNode(op.nodeId, "moveNode", i);
        if (nodeId === null) break;
        out.push({ ...op, nodeId });
        break;
      }
      case "repairVariableReference": {
        const nodeId = resolveNode(op.nodeId, "repairVariableReference", i);
        if (nodeId === null) break;
        out.push({
          ...op,
          nodeId,
          newReference: rewriteRefsInString(op.newReference, nodeIdMap),
        });
        break;
      }
      case "removeEdge": {
        const edgeId = resolveEdge(op.edgeId, "removeEdge", i);
        if (edgeId === null) break;
        out.push({ op: "removeEdge", edgeId });
        break;
      }
      case "replaceEdge": {
        const edgeId = resolveEdge(op.edgeId, "replaceEdge", i);
        const sysEdgeId = edgeIdGen();
        edgeIdMap[op.edge.id] = sysEdgeId;
        const from = resolveEdgeEndpoint(op.edge.from, op.edge.id, "replaceEdge", i);
        const to = resolveEdgeEndpoint(op.edge.to, op.edge.id, "replaceEdge", i);
        if (edgeId === null || from === null || to === null) break;
        out.push({ op: "replaceEdge", edgeId, edge: { ...op.edge, id: sysEdgeId, from, to } });
        break;
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, patch: { ...patch, operations: out }, nodeIdMap, edgeIdMap };
}
