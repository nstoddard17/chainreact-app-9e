import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "@/contracts/workflowDefinition";
import type { PatchOperation, PatchValidationError } from "./types";

/**
 * Pure, atomic application of patch operations to a WorkflowDefinition
 * (Slice 4.AI-3).
 *
 * Guarantees:
 *   - The input definition is NEVER mutated (it is deep-cloned first).
 *   - Operations apply in order onto the clone.
 *   - ATOMIC: if any operation cannot be applied (e.g. references a missing
 *     node/edge), application aborts and returns a typed error with NO
 *     candidate — partial application is never returned.
 *   - Untouched nodes/edges are preserved exactly (the clone copies them).
 *
 * This step does NOT do semantic validation (registry grounding, config,
 * variable refs, risk, cost) — that is `validateWorkflowPatch`'s job. It only
 * produces the candidate definition the patch describes, or the first
 * structural application error.
 */

export type ApplyPatchResult =
  | { ok: true; definition: WorkflowDefinition }
  | { ok: false; errors: PatchValidationError[] };

function clone(def: WorkflowDefinition): WorkflowDefinition {
  // WorkflowDefinition is JSON-safe (ids, strings, config record, position).
  return JSON.parse(JSON.stringify(def)) as WorkflowDefinition;
}

function findNodeIndex(nodes: WorkflowNode[], id: string): number {
  return nodes.findIndex((n) => n.id === id);
}

export function applyPatchToDefinition(
  original: WorkflowDefinition,
  operations: readonly PatchOperation[],
): ApplyPatchResult {
  const def = clone(original);

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i]!;

    switch (op.op) {
      case "addNode": {
        def.nodes.push(op.node);
        break;
      }

      case "updateNodeConfig": {
        const idx = findNodeIndex(def.nodes, op.nodeId);
        if (idx === -1) {
          return {
            ok: false,
            errors: [
              {
                code: "UNKNOWN_NODE",
                message: `updateNodeConfig references node '${op.nodeId}', which is not in the workflow.`,
                nodeId: op.nodeId,
                operationIndex: i,
              },
            ],
          };
        }
        const node = def.nodes[idx]!;
        node.config = op.replace
          ? { ...op.config }
          : { ...node.config, ...op.config };
        break;
      }

      case "removeNode": {
        const idx = findNodeIndex(def.nodes, op.nodeId);
        if (idx === -1) {
          return {
            ok: false,
            errors: [
              {
                code: "UNKNOWN_NODE",
                message: `removeNode references node '${op.nodeId}', which is not in the workflow.`,
                nodeId: op.nodeId,
                operationIndex: i,
              },
            ],
          };
        }
        def.nodes.splice(idx, 1);
        // Cascade: drop every edge touching the removed node.
        def.edges = def.edges.filter(
          (e) => e.from !== op.nodeId && e.to !== op.nodeId,
        );
        break;
      }

      case "addEdge": {
        def.edges.push(op.edge);
        break;
      }

      case "removeEdge": {
        const idx = def.edges.findIndex((e) => e.id === op.edgeId);
        if (idx === -1) {
          return {
            ok: false,
            errors: [
              {
                code: "INVALID_EDGE",
                message: `removeEdge references edge '${op.edgeId}', which is not in the workflow.`,
                edgeId: op.edgeId,
                operationIndex: i,
              },
            ],
          };
        }
        def.edges.splice(idx, 1);
        break;
      }

      case "replaceEdge": {
        const idx = def.edges.findIndex((e) => e.id === op.edgeId);
        if (idx === -1) {
          return {
            ok: false,
            errors: [
              {
                code: "INVALID_EDGE",
                message: `replaceEdge references edge '${op.edgeId}', which is not in the workflow.`,
                edgeId: op.edgeId,
                operationIndex: i,
              },
            ],
          };
        }
        def.edges[idx] = op.edge;
        break;
      }

      case "moveNode": {
        const idx = findNodeIndex(def.nodes, op.nodeId);
        if (idx === -1) {
          return {
            ok: false,
            errors: [
              {
                code: "UNKNOWN_NODE",
                message: `moveNode references node '${op.nodeId}', which is not in the workflow.`,
                nodeId: op.nodeId,
                operationIndex: i,
              },
            ],
          };
        }
        def.nodes[idx]!.position = { ...op.position };
        break;
      }

      case "repairVariableReference": {
        const idx = findNodeIndex(def.nodes, op.nodeId);
        if (idx === -1) {
          return {
            ok: false,
            errors: [
              {
                code: "UNKNOWN_NODE",
                message: `repairVariableReference references node '${op.nodeId}', which is not in the workflow.`,
                nodeId: op.nodeId,
                operationIndex: i,
              },
            ],
          };
        }
        def.nodes[idx]!.config[op.fieldPath] = op.newReference;
        break;
      }

      case "replaceTrigger": {
        if (op.node.kind !== "trigger") {
          return {
            ok: false,
            errors: [
              {
                code: "INVALID_PATCH",
                message: `replaceTrigger requires a node with kind 'trigger' (got '${op.node.kind}').`,
                nodeId: op.node.id,
                operationIndex: i,
              },
            ],
          };
        }
        // Remove existing trigger node(s), re-point their outgoing edges to the
        // new trigger so downstream wiring is preserved, then add the new node.
        const oldTriggerIds = def.nodes
          .filter((n) => n.kind === "trigger")
          .map((n) => n.id);
        def.nodes = def.nodes.filter((n) => n.kind !== "trigger");
        for (const edge of def.edges) {
          if (oldTriggerIds.includes(edge.from)) edge.from = op.node.id;
        }
        def.nodes.push(op.node);
        break;
      }
    }
  }

  return { ok: true, definition: def };
}

/** Re-export for callers building previews of removed wiring. */
export type { WorkflowEdge };
