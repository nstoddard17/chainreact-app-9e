/**
 * Deterministic per-category repair strategies (Slice 4.AI-7).
 *
 * Each builder returns a `StrategyOutcome` (repairability + reason + 0..n patch
 * operations + recommendations). The orchestrator turns operations into a
 * WorkflowPatch and runs AI-5 preview. NONE of these invent config values,
 * providers, actions, or fields; auth/billing failures produce recommendations
 * only (never a patch). All grounded in the live registry via `getNodeSchema`.
 */

import { parseReferences } from "@/core/workflows/variableReferences";
import { getNodeSchema } from "@/services/ai/tools/providerCatalog";
import { getAvailableVariablesForAI } from "@/services/ai/tools/variables";
import type {
  ValidationIssue,
  WorkflowGraphNodeView,
  WorkflowGraphView,
} from "@/services/ai/tools/workflowContext";
import type { PatchOperation } from "@/services/workflows/patch/types";
import type { RequiredUserInput, StrategyOutcome } from "./types";

// ─── Recommendation-only outcomes (no patch) ─────────────────────────────────

export function runNotFailedOutcome(): StrategyOutcome {
  return {
    repairability: "noSafeRepair",
    reasonCode: "RUN_NOT_FAILED",
    operations: [],
    requiredUserInput: [],
    recommendations: ["This run did not fail — there is nothing to repair."],
    confidence: "high",
    safetyNotes: [],
  };
}

export function disconnectedOutcome(provider: string | null): StrategyOutcome {
  const p = provider ?? "the required integration";
  return {
    repairability: "needsUserInput",
    reasonCode: "DISCONNECTED_INTEGRATION",
    operations: [],
    requiredUserInput: [],
    recommendations: [`Reconnect ${p} (or connect it) in Integrations, then re-run the workflow.`],
    confidence: "low",
    safetyNotes: ["Repair never reads or modifies credentials/tokens."],
  };
}

export function unknownNodeOutcome(): StrategyOutcome {
  return {
    repairability: "noSafeRepair",
    reasonCode: "UNKNOWN_NODE_METADATA",
    operations: [],
    requiredUserInput: [],
    recommendations: [
      "A node uses a provider/action the current build doesn't recognize. If its provider was recently added, retry later; otherwise reconfigure the node.",
    ],
    confidence: "low",
    safetyNotes: ["No provider/action/field metadata was invented."],
  };
}

export function billingOutcome(): StrategyOutcome {
  return {
    repairability: "needsUserInput",
    reasonCode: "BILLING_LIMIT",
    operations: [],
    requiredUserInput: [],
    recommendations: [
      "This run hit the task limit. Upgrade your plan or wait for the next billing period, then re-run.",
    ],
    confidence: "low",
    safetyNotes: ["Repair never changes billing or task settings."],
  };
}

export function missingTriggerOutcome(): StrategyOutcome {
  return {
    repairability: "needsUserInput",
    reasonCode: "MISSING_TRIGGER",
    operations: [],
    requiredUserInput: [],
    recommendations: ["This workflow has no trigger. Add a trigger that matches how you want it to start."],
    confidence: "low",
    safetyNotes: [],
  };
}

export function downstreamReferenceOutcome(): StrategyOutcome {
  return {
    repairability: "needsUserInput",
    reasonCode: "INVALID_VARIABLE_REFERENCE",
    operations: [],
    requiredUserInput: [],
    recommendations: [
      "A step references data from a later step. Re-point it to an upstream step's output.",
    ],
    confidence: "low",
    safetyNotes: [],
  };
}

export function noDeterministicRepairOutcome(): StrategyOutcome {
  return {
    repairability: "noSafeRepair",
    reasonCode: "NO_DETERMINISTIC_REPAIR",
    operations: [],
    requiredUserInput: [],
    recommendations: ["No safe automatic repair is available for this failure. Review the failed step."],
    confidence: "low",
    safetyNotes: [],
  };
}

// ─── Patch-producing outcomes ────────────────────────────────────────────────

/**
 * Missing required fields. Only TEXT / TEXTAREA fields are auto-filled with an
 * `{{AI_FIELD:…}}` generative placeholder (the designed mechanism for uncertain
 * text). Any other field type (select / number / file / …) needs a real value
 * the user must supply → `needsUserInput`, never an invented value.
 */
export function buildMissingFieldOutcome(
  graph: WorkflowGraphView,
  missingIssues: readonly ValidationIssue[],
): StrategyOutcome {
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const aiFieldByNode = new Map<string, Record<string, unknown>>();
  const userInput: RequiredUserInput[] = [];

  for (const issue of missingIssues) {
    if (!issue.nodeId || !issue.field) continue;
    const node = nodesById.get(issue.nodeId);
    if (!node) {
      userInput.push({ nodeId: issue.nodeId, field: issue.field, label: issue.field, kind: "config_value" });
      continue;
    }
    const schema = getNodeSchema(`${node.provider}:${node.type}`);
    const fieldMeta = schema.ok ? schema.data.fields.find((f) => f.name === issue.field) : undefined;
    const label = fieldMeta?.label ?? issue.field;
    if (fieldMeta && (fieldMeta.type === "text" || fieldMeta.type === "textarea")) {
      const cfg = aiFieldByNode.get(issue.nodeId) ?? {};
      cfg[issue.field] = `{{AI_FIELD:${issue.field}}}`;
      aiFieldByNode.set(issue.nodeId, cfg);
    } else {
      userInput.push({ nodeId: issue.nodeId, field: issue.field, label, kind: "config_value" });
    }
  }

  // Conservative: if anything needs a real value, propose no patch.
  if (userInput.length > 0) {
    return {
      repairability: "needsUserInput",
      reasonCode: "MISSING_REQUIRED_FIELD",
      operations: [],
      requiredUserInput: userInput,
      recommendations: ["Fill the missing required field(s) before re-running."],
      confidence: "medium",
      safetyNotes: ["Some required fields need real values only you can supply — no value was invented."],
    };
  }

  const operations: PatchOperation[] = [...aiFieldByNode.entries()].map(([nodeId, config]) => ({
    op: "updateNodeConfig",
    nodeId,
    config,
  }));
  if (operations.length === 0) {
    return noDeterministicRepairOutcome();
  }
  return {
    repairability: "repairable",
    reasonCode: "MISSING_REQUIRED_FIELD",
    operations,
    requiredUserInput: [],
    recommendations: [
      "Filled missing text field(s) with an AI-generated placeholder ({{AI_FIELD:…}}) — review before applying.",
    ],
    confidence: "medium",
    safetyNotes: ["AI_FIELD placeholders are generated at runtime; confirm they match your intent."],
  };
}

function needsUserInputForVariable(reason: string): StrategyOutcome {
  return {
    repairability: "needsUserInput",
    reasonCode: "INVALID_VARIABLE_REFERENCE",
    operations: [],
    requiredUserInput: [],
    recommendations: [reason],
    confidence: "low",
    safetyNotes: [],
  };
}

function configStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

/**
 * Invalid variable reference. Proposes `repairVariableReference` ONLY when there
 * is exactly one broken reference in the failed node AND exactly one upstream
 * variable whose path matches it — an unambiguous, deterministic replacement.
 * Anything ambiguous → `needsUserInput`.
 */
export async function buildVariableRepairOutcome(
  userId: string,
  workflowId: string,
  graph: WorkflowGraphView,
  failedNodeId: string | null,
): Promise<StrategyOutcome> {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const node: WorkflowGraphNodeView | undefined = failedNodeId
    ? graph.nodes.find((n) => n.id === failedNodeId)
    : undefined;
  if (!node) {
    return needsUserInputForVariable("Couldn't locate the node with the broken variable reference.");
  }

  const broken: Array<{ configKey: string; refPath: string }> = [];
  for (const [key, value] of Object.entries(node.config)) {
    for (const str of configStrings(value)) {
      for (const ref of parseReferences(str)) {
        if (ref.nodeId !== "trigger" && !nodeIds.has(ref.nodeId)) {
          broken.push({ configKey: key, refPath: ref.path });
        }
      }
    }
  }

  if (broken.length !== 1) {
    return needsUserInputForVariable(
      broken.length === 0
        ? "No broken variable reference was found to repair."
        : "Multiple broken variable references — repair them manually.",
    );
  }

  const b = broken[0]!;
  const vars = await getAvailableVariablesForAI(userId, workflowId, node.id);
  if (!vars.ok) {
    return needsUserInputForVariable("Couldn't determine available upstream variables.");
  }
  const candidates = vars.data.variables.filter((v) => v.path === b.refPath);
  if (candidates.length !== 1) {
    return needsUserInputForVariable(
      candidates.length === 0
        ? "No upstream variable matches the broken reference."
        : "Several upstream variables match — choose one manually.",
    );
  }

  return {
    repairability: "repairable",
    reasonCode: "INVALID_VARIABLE_REFERENCE",
    operations: [
      { op: "repairVariableReference", nodeId: node.id, fieldPath: b.configKey, newReference: candidates[0]!.reference },
    ],
    requiredUserInput: [],
    recommendations: [`Re-point the broken reference in "${b.configKey}" to an available upstream value.`],
    confidence: "medium",
    safetyNotes: [],
  };
}

/**
 * Dangling edges (an endpoint references a node not in the graph) → propose
 * `removeEdge`. Returns null when there are no dangling edges (so the caller
 * can fall through to another category). Deterministic + safe.
 */
export function buildEdgeRepairOutcome(graph: WorkflowGraphView): StrategyOutcome | null {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const dangling = graph.edges.filter((e) => !nodeIds.has(e.from) || !nodeIds.has(e.to));
  if (dangling.length === 0) return null;
  return {
    repairability: "repairable",
    reasonCode: "INVALID_EDGE",
    operations: dangling.map((e) => ({ op: "removeEdge", edgeId: e.id })),
    requiredUserInput: [],
    recommendations: [`Remove ${dangling.length} edge(s) pointing to a missing node.`],
    confidence: "high",
    safetyNotes: [],
  };
}
