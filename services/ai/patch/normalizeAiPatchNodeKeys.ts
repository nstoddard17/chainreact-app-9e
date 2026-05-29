/**
 * Normalize self-qualified node keys in an AI-proposed patch
 * (Slice 4.PROVIDER-CATALOG-INTEGRITY-1).
 *
 * The planner is instructed (PATCH_SHAPE_GUIDE) to split a catalog key
 * `provider:type` into a node's separate `provider` + `type` fields. When it
 * doesn't — e.g. it emits `{ provider: "gmail", type: "gmail:new_email" }` —
 * the validator builds the lookup key as `${provider}:${type}` and gets the
 * malformed `gmail:gmail:new_email`, which resolves to nothing and rejects a
 * trigger/action that is actually supported.
 *
 * This pure pass corrects exactly that mistake: for every `addNode` /
 * `replaceTrigger` node whose `type` starts with its OWN `<provider>:` prefix,
 * strip the redundant prefix so the node validates against the real registered
 * key. It is deliberately STRICT — it only strips a prefix that exactly equals
 * the node's provider, so a mismatched prefix (`provider:"gmail"` +
 * `type:"outlook:new_email"`) is left intact and still rejects, and genuinely
 * unknown nodes still fail validation. It does NOT weaken validation; it only
 * resolves the unambiguous "didn't split the catalog key" case to the node the
 * model clearly intended.
 *
 * Applied at the AI ingestion boundary (preview + apply) BEFORE validation, so
 * both the preview lookup and the persisted node's dispatch `type` are correct.
 */

import type { WorkflowNode } from "@/contracts/workflow";
import type { PatchOperation, WorkflowPatch } from "@/services/workflows/patch/types";

function normalizeNode(node: WorkflowNode): WorkflowNode {
  if (node.provider.length === 0) return node;
  const prefix = `${node.provider}:`;
  if (!node.type.startsWith(prefix)) return node;
  return { ...node, type: node.type.slice(prefix.length) };
}

export function normalizeAiPatchNodeKeys(patch: WorkflowPatch): WorkflowPatch {
  const ops = patch.operations ?? [];
  let changed = false;
  const operations: PatchOperation[] = ops.map((op) => {
    if (op.op === "addNode") {
      const node = normalizeNode(op.node);
      if (node !== op.node) {
        changed = true;
        return { op: "addNode", node };
      }
    } else if (op.op === "replaceTrigger") {
      const node = normalizeNode(op.node);
      if (node !== op.node) {
        changed = true;
        return { op: "replaceTrigger", node };
      }
    }
    return op;
  });
  return changed ? { ...patch, operations } : patch;
}
