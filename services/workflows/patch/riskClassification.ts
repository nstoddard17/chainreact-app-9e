import type { RiskLevel } from "@/contracts/actionMeta";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import { findConfirmationRequiredActions } from "@/services/workflows/riskConfirmation";
import { getActionMeta } from "@/services/discovery/_registry";
import type {
  PatchOperation,
  PatchValidationWarning,
  RiskReason,
} from "./types";

/**
 * Deterministic risk/confirmation classification for a patch (Slice 4.AI-3).
 *
 * NEVER trusts the patch's proposed risk. Reuses the canonical
 * `findConfirmationRequiredActions` enumerator (fails closed on unknown meta)
 * so AI edits use the SAME confirmation rule as human edits. `riskLevel: high`
 * alone does NOT force confirmation — only isDestructive / requiresConfirmation
 * (or structural removal-orphan / trigger-swap) do, mirroring riskConfirmation.ts.
 */

const RISK_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

export interface RiskClassification {
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  riskReasons: RiskReason[];
  warnings: PatchValidationWarning[];
}

export function classifyPatchRisk(
  original: WorkflowDefinition,
  candidate: WorkflowDefinition,
  operations: readonly PatchOperation[],
): RiskClassification {
  let riskLevel: RiskLevel = "low";
  let requiresConfirmation = false;
  const riskReasons: RiskReason[] = [];
  const warnings: PatchValidationWarning[] = [];

  // Action nodes the patch adds or reconfigures.
  const affectedActionIds = new Set<string>();
  for (const op of operations) {
    if (op.op === "addNode" && op.node.kind === "action") affectedActionIds.add(op.node.id);
    if (op.op === "updateNodeConfig") affectedActionIds.add(op.nodeId);
  }
  const affectedActions = candidate.nodes.filter(
    (n) => n.kind === "action" && affectedActionIds.has(n.id),
  );

  // Reuse the canonical confirmation enumerator (fails closed on unknown meta).
  const conf = findConfirmationRequiredActions(affectedActions);
  if (conf.requiresConfirmation) {
    requiresConfirmation = true;
    riskLevel = "high";
    for (const a of conf.actions) {
      riskReasons.push({
        code: "confirmation_required_action",
        message: `Action '${a.displayName}' requires typed confirmation.`,
        nodeId: a.nodeId,
      });
    }
  }

  // riskLevel from each affected action's meta (does NOT alone force
  // confirmation — mirrors riskConfirmation.ts semantics).
  for (const n of affectedActions) {
    const meta = getActionMeta(`${n.provider}:${n.type}`);
    if (!meta) {
      riskLevel = "high";
      riskReasons.push({
        code: "unknown_action_safety",
        message: `Action '${n.provider}:${n.type}' has no metadata; treated as high-risk.`,
        nodeId: n.id,
      });
      continue;
    }
    if (meta.isDestructive) {
      riskLevel = "high";
      riskReasons.push({
        code: "destructive_action",
        message: `Action '${meta.displayName}' is destructive.`,
        nodeId: n.id,
      });
    } else if (meta.riskLevel === "high") {
      riskLevel = maxRisk(riskLevel, "high");
      riskReasons.push({
        code: "high_risk_action",
        message: `Action '${meta.displayName}' is high-risk.`,
        nodeId: n.id,
      });
    } else if (meta.riskLevel === "medium") {
      riskLevel = maxRisk(riskLevel, "medium");
      riskReasons.push({
        code: "medium_risk_action",
        message: `Action '${meta.displayName}' mutates external state.`,
        nodeId: n.id,
      });
    }
  }

  // Structural risk: removals + trigger swap.
  for (const op of operations) {
    if (op.op === "removeNode") {
      riskLevel = maxRisk(riskLevel, "medium");
      riskReasons.push({
        code: "removes_user_work",
        message: `Removes node '${op.nodeId}'.`,
        nodeId: op.nodeId,
      });
      warnings.push({
        code: "DELETES_USER_WORK",
        message: `Node '${op.nodeId}' and its edges are removed.`,
        nodeId: op.nodeId,
      });
      if (original.edges.some((e) => e.from === op.nodeId)) {
        requiresConfirmation = true;
        riskReasons.push({
          code: "orphans_downstream",
          message: `Removing '${op.nodeId}' disconnects downstream nodes.`,
          nodeId: op.nodeId,
        });
        warnings.push({
          code: "ORPHANS_DOWNSTREAM",
          message: `Removing '${op.nodeId}' leaves downstream nodes without an inbound path.`,
          nodeId: op.nodeId,
        });
      }
    }
    if (op.op === "removeEdge") {
      const removed = original.edges.find((e) => e.id === op.edgeId);
      if (removed) {
        const toStillHasIncoming = candidate.edges.some((e) => e.to === removed.to);
        if (!toStillHasIncoming && candidate.nodes.some((n) => n.id === removed.to)) {
          riskLevel = maxRisk(riskLevel, "medium");
          warnings.push({
            code: "ORPHANS_DOWNSTREAM",
            message: `Removing edge '${op.edgeId}' leaves node '${removed.to}' with no inbound path.`,
            edgeId: op.edgeId,
          });
          riskReasons.push({
            code: "orphans_downstream",
            message: `Edge removal disconnects '${removed.to}'.`,
            nodeId: removed.to,
          });
          requiresConfirmation = true;
        }
      }
    }
    if (op.op === "replaceTrigger") {
      riskLevel = maxRisk(riskLevel, "medium");
      requiresConfirmation = true;
      riskReasons.push({
        code: "replaces_trigger",
        message: "Replaces the workflow trigger.",
        nodeId: op.node.id,
      });
      warnings.push({
        code: "DELETES_USER_WORK",
        message: "The previous trigger node is removed.",
      });
    }
  }

  return { riskLevel, requiresConfirmation, riskReasons, warnings };
}
