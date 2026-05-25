import type { OutputMeta } from "@/contracts/actionMeta";
import type {
  WorkflowDefinition,
  WorkflowNode,
} from "@/contracts/workflowDefinition";
import { parseReferences } from "@/core/workflows/variableReferences";
import { findUpstreamNodes } from "@/core/workflows/upstreamVariables";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import type { PatchValidationError } from "./types";

/**
 * Variable-reference validation for patched node configs (Slice 4.AI-3).
 *
 * Confirms every `{{nodeId.path}}` reference (1) is well-formed, (2) points to
 * an existing node, (3) points UPSTREAM (a strict ancestor — its output is
 * actually available at runtime), and (4) names an output path the source's
 * metadata exposes. `{{AI_FIELD:...}}` is an agent construct, NOT a variable —
 * it is deliberately skipped (mirrors `parseReferences`).
 */

const TRIGGER_ALIAS = "trigger";
const RAW_TOKEN_RE = /\{\{([^}]*)\}\}/g;
const OPAQUE_OUTPUT_TYPES = new Set(["object", "array", "unknown", "fileRef"]);

/** Mirror of the resolver's node-id parse rule (variableReferences.parseContent). */
function isParseableRef(content: string): boolean {
  if (content.length === 0) return false;
  if (content[0] === "." || content[0] === "[") return false;
  const dotIdx = content.indexOf(".");
  const bracketIdx = content.indexOf("[");
  const seps = [dotIdx, bracketIdx].filter((n) => n >= 0);
  if (seps.length === 0) return true; // whole content is the node id
  return Math.min(...seps) > 0; // non-empty node id before the first separator
}

function outputsForNode(node: WorkflowNode): readonly OutputMeta[] | null {
  if (!node.type) return null;
  const key = `${node.provider}:${node.type}`;
  if (node.kind === "trigger") {
    const m = getTriggerMeta(key);
    return m ? m.payloadShape : null;
  }
  const m = getActionMeta(key);
  return m ? m.outputs : null;
}

/** Walk an output tree; tolerate descending into opaque/sensitive subtrees. */
function isKnownOutputPath(
  outputs: readonly OutputMeta[],
  rawPath: string,
): boolean {
  const normalized = rawPath.replace(/\[\d+\]/g, "");
  const segments = normalized.split(".").filter((s) => s.length > 0);
  if (segments.length === 0) return true; // reference to the node itself

  let level: readonly OutputMeta[] = outputs;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const match = level.find((o) => o.name === seg);
    if (!match) return false;
    const isLast = i === segments.length - 1;
    if (isLast) return true;
    if (match.sensitive) return true; // opaque subtree — accept deeper
    if (match.fields && match.fields.length > 0) {
      level = match.fields;
      continue;
    }
    // No declared children: accept deeper only for opaque container types.
    return OPAQUE_OUTPUT_TYPES.has(match.type);
  }
  return true;
}

function collectStringLeaves(
  value: unknown,
  out: { key: string; value: string }[],
  key: string,
  depth: number,
): void {
  if (depth > 6) return;
  if (typeof value === "string") {
    out.push({ key, value });
  } else if (Array.isArray(value)) {
    for (const item of value) collectStringLeaves(item, out, key, depth + 1);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStringLeaves(v, out, key, depth + 1);
  }
}

/** Validate variable references inside one node's config. */
export function checkNodeVariableReferences(
  candidate: WorkflowDefinition,
  node: WorkflowNode,
): PatchValidationError[] {
  const errors: PatchValidationError[] = [];
  const nodeIds = new Set(candidate.nodes.map((n) => n.id));
  const ancestors = new Set(
    findUpstreamNodes({
      currentNodeId: node.id,
      nodes: candidate.nodes,
      edges: candidate.edges,
    }),
  );
  const nodesById = new Map(candidate.nodes.map((n) => [n.id, n]));

  const leaves: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(node.config)) {
    collectStringLeaves(v, leaves, k, 0);
  }

  for (const { key, value } of leaves) {
    // 1. Malformed-token detection: a raw {{...}} that isn't AI_FIELD and
    //    isn't a parseable reference.
    let m: RegExpExecArray | null;
    RAW_TOKEN_RE.lastIndex = 0;
    while ((m = RAW_TOKEN_RE.exec(value)) !== null) {
      const content = m[1]!.trim();
      if (content.startsWith("AI_FIELD:")) continue; // agent construct — not a variable
      if (!isParseableRef(content)) {
        errors.push({
          code: "INVALID_VARIABLE_REFERENCE",
          message: `Malformed variable reference '${m[0]}' in field '${key}'.`,
          nodeId: node.id,
          path: key,
        });
      }
    }

    // 2. Well-formed references: existence + upstream + output path.
    for (const ref of parseReferences(value)) {
      if (ref.nodeId === TRIGGER_ALIAS) {
        const triggerNode = candidate.nodes.find((n) => n.kind === "trigger");
        if (!triggerNode) {
          errors.push({
            code: "INVALID_VARIABLE_REFERENCE",
            message: `Field '${key}' references '{{trigger...}}' but the workflow has no trigger.`,
            nodeId: node.id,
            path: key,
          });
          continue;
        }
        // The engine seeds `{{trigger}}` globally (no ancestor requirement),
        // but we can still validate the path against the trigger's payload.
        const triggerOutputs = outputsForNode(triggerNode);
        if (triggerOutputs && ref.path && !isKnownOutputPath(triggerOutputs, ref.path)) {
          errors.push({
            code: "MISSING_OUTPUT_PATH",
            message: `Field '${key}' references 'trigger.${ref.path}', which the trigger's payload does not expose.`,
            nodeId: node.id,
            path: `trigger.${ref.path}`,
          });
        }
        continue;
      }
      if (!nodeIds.has(ref.nodeId)) {
        errors.push({
          code: "INVALID_VARIABLE_REFERENCE",
          message: `Field '${key}' references node '${ref.nodeId}', which is not in the workflow.`,
          nodeId: node.id,
          path: key,
        });
        continue;
      }
      if (!ancestors.has(ref.nodeId)) {
        errors.push({
          code: "DOWNSTREAM_VARIABLE_REFERENCE",
          message: `Field '${key}' references node '${ref.nodeId}', which is not upstream of '${node.id}' (its output isn't available here).`,
          nodeId: node.id,
          path: key,
        });
        continue;
      }
      const sourceNode = nodesById.get(ref.nodeId)!;
      const outputs = outputsForNode(sourceNode);
      if (outputs && ref.path && !isKnownOutputPath(outputs, ref.path)) {
        errors.push({
          code: "MISSING_OUTPUT_PATH",
          message: `Field '${key}' references '${ref.nodeId}.${ref.path}', which that node's output does not expose.`,
          nodeId: node.id,
          path: `${ref.nodeId}.${ref.path}`,
        });
      }
    }
  }
  return errors;
}
