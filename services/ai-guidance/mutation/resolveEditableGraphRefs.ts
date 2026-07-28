/**
 * Opaque editable-graph refs → real node ids (HERMES-AGENT-WORKFLOW-EDITOR-LIVE).
 *
 * The conversational-editor model only ever sees OPAQUE refs (`node_1`, `node_2`, …) for the user's
 * existing steps and declares NEW steps with `new_`-prefixed refs. This pure step translates a model
 * patch back onto the real local draft BEFORE `materializeAiPatchNodeIds` / `validateWorkflowPatch`:
 *
 *   - Every reference to an EXISTING step (op `nodeId`, edge `from`/`to`, removeEdge/replaceEdge edge
 *     ids' endpoints, and `{{ref.path}}` variable tokens in config) is rewritten from its opaque ref to
 *     the real node id via the PRIVATE `refMap`.
 *   - A `new_`-prefixed ref (a node the model adds) is left untouched — `materializeAiPatchNodeIds`
 *     assigns it a real system id.
 *   - ANY other reference — an invented ref, a real id the model should never have, or a STALE ref from
 *     an older draft version that no longer maps — is REJECTED with an exact, secret-free reason. No
 *     silent "the only Slack node" guess.
 *   - A node the model ADDS (`addNode` / `replaceTrigger`) MUST use a `new_` ref, never an existing ref.
 *
 * An EXISTING connection is targeted by its opaque edge ref (`edge_1`, …) for removeEdge / replaceEdge;
 * the edge ref map translates it to the real edge id (unknown edge ref → rejected). A NEW edge the model
 * adds carries a patch-local id that materialize re-mints — its ENDPOINTS are node refs, resolved here.
 * Pure + deterministic; never throws.
 */

import {
  formatReference,
  parseReferences,
} from "@/core/workflows/variables/variableReferences";
import { NEW_NODE_REF_PREFIX } from "@/contracts/editableWorkflowGraph";
import type { PatchOperation } from "@/services/workflows/patch/types";

export type ResolveEditableGraphRefsResult =
  | { readonly ok: true; readonly operations: PatchOperation[] }
  | { readonly ok: false; readonly message: string };

function isNewRef(ref: string): boolean {
  return ref.startsWith(NEW_NODE_REF_PREFIX);
}

/** Rewrite `{{existingRef.path}}` tokens in a string to `{{realId.path}}`. Other tokens are untouched. */
function rewriteTokensInString(value: string, refMap: ReadonlyMap<string, string>): string {
  const refs = parseReferences(value);
  if (refs.length === 0) return value;
  let out = value;
  for (const ref of [...refs].sort((a, b) => b.offset - a.offset)) {
    const realId = refMap.get(ref.nodeId);
    if (!realId) continue; // new_ ref or keyword token (trigger/AI_FIELD) — leave for materialize/validate
    const replacement = formatReference({ nodeId: realId, path: ref.path });
    out = out.slice(0, ref.offset) + replacement + out.slice(ref.offset + ref.token.length);
  }
  return out;
}

function rewriteTokensDeep(value: unknown, refMap: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") return rewriteTokensInString(value, refMap);
  if (Array.isArray(value)) return value.map((v) => rewriteTokensDeep(v, refMap));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = rewriteTokensDeep(v, refMap);
    return out;
  }
  return value;
}

export function resolveEditableGraphRefs(
  operations: readonly PatchOperation[],
  refMap: ReadonlyMap<string, string>,
  edgeRefMap: ReadonlyMap<string, string> = new Map(),
): ResolveEditableGraphRefsResult {
  const out: PatchOperation[] = [];

  /** Resolve a reference to an EXISTING step. new_ refs pass through; anything unknown fails. */
  const resolveExisting = (ref: string): string | null => {
    const realId = refMap.get(ref);
    if (realId) return realId;
    if (isNewRef(ref)) return ref;
    return null;
  };

  // SAFE copy — never expose the raw opaque ref to the user (requirement: no raw refs in the rail).
  const unknownRefMessage = (_ref: string): string =>
    "I referenced a step that's no longer in your current workflow — it may have changed. Ask me again and I'll work against the latest version of your canvas.";
  const unknownEdgeMessage = (_ref: string): string =>
    "I referenced a connection that's no longer in your current workflow — it may have changed. Ask me again and I'll work against the latest version of your canvas.";

  for (const op of operations) {
    switch (op.op) {
      case "addNode":
      case "replaceTrigger": {
        // A new/replacement node MUST be a new_ ref, never an existing ref the model is reusing.
        if (refMap.has(op.node.id)) {
          return { ok: false, message: "I couldn't add that step because it collided with an existing one. Ask me again and I'll work against the latest version of your canvas." };
        }
        const node = { ...op.node, config: rewriteTokensDeep(op.node.config, refMap) as Record<string, unknown> };
        out.push(op.op === "addNode" ? { op: "addNode", node } : { op: "replaceTrigger", node });
        break;
      }
      case "updateNodeConfig": {
        const id = resolveExisting(op.nodeId);
        if (id === null) return { ok: false, message: unknownRefMessage(op.nodeId) };
        out.push({ ...op, nodeId: id, config: rewriteTokensDeep(op.config, refMap) as Record<string, unknown> });
        break;
      }
      case "removeNode": {
        const id = resolveExisting(op.nodeId);
        if (id === null) return { ok: false, message: unknownRefMessage(op.nodeId) };
        out.push({ op: "removeNode", nodeId: id });
        break;
      }
      case "moveNode": {
        const id = resolveExisting(op.nodeId);
        if (id === null) return { ok: false, message: unknownRefMessage(op.nodeId) };
        out.push({ ...op, nodeId: id });
        break;
      }
      case "repairVariableReference": {
        const id = resolveExisting(op.nodeId);
        if (id === null) return { ok: false, message: unknownRefMessage(op.nodeId) };
        out.push({ ...op, nodeId: id, newReference: rewriteTokensInString(op.newReference, refMap) });
        break;
      }
      case "addEdge": {
        const from = resolveExisting(op.edge.from);
        const to = resolveExisting(op.edge.to);
        if (from === null) return { ok: false, message: unknownRefMessage(op.edge.from) };
        if (to === null) return { ok: false, message: unknownRefMessage(op.edge.to) };
        out.push({ op: "addEdge", edge: { ...op.edge, from, to } });
        break;
      }
      case "replaceEdge": {
        const edgeId = edgeRefMap.get(op.edgeId);
        if (!edgeId) return { ok: false, message: unknownEdgeMessage(op.edgeId) };
        const from = resolveExisting(op.edge.from);
        const to = resolveExisting(op.edge.to);
        if (from === null) return { ok: false, message: unknownRefMessage(op.edge.from) };
        if (to === null) return { ok: false, message: unknownRefMessage(op.edge.to) };
        out.push({ ...op, edgeId, edge: { ...op.edge, from, to } });
        break;
      }
      case "removeEdge": {
        // Target an EXISTING connection by its opaque edge ref → real edge id (unknown → reject).
        const edgeId = edgeRefMap.get(op.edgeId);
        if (!edgeId) return { ok: false, message: unknownEdgeMessage(op.edgeId) };
        out.push({ op: "removeEdge", edgeId });
        break;
      }
    }
  }

  return { ok: true, operations: out };
}
