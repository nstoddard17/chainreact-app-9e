/**
 * Read-only node-level explainer (Slice 4.AI-4).
 *
 * Explains a single node: what it does, how each config field is populated
 * (by STATUS, never by raw value), its risk, integration need, and the
 * upstream variables it can map from. Composes AI-2 tools; NO model calls, NO
 * mutation, NO DB writes.
 *
 * No-leak: a configured field is described as set / mapped / AI-generated /
 * hidden — the literal value is never echoed (it could be PII, a message body,
 * etc.). Variable-reference tokens (`{{nodeId.path}}`) are safe to surface.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §2/§3.
 */

import { parseReferences } from "@/core/workflows/variableReferences";
import { getActionMeta, getTriggerMeta } from "@/services/ai/tools/providerCatalog";
import type { NodeRiskView } from "@/services/ai/tools/providerCatalog";
import { getConnectedIntegrationsForAI } from "@/services/ai/tools/integrations";
import { getWorkflowGraphForAI } from "@/services/ai/tools/workflowContext";
import { getAvailableVariablesForAI } from "@/services/ai/tools/variables";
import { REDACTED } from "@/services/ai/tools/redact";
import { aiToolErr, aiToolOk, type AiToolResult } from "@/services/ai/tools/types";
import type {
  ConfigFieldStatus,
  NodeConfigFieldExplanation,
  NodeExplanation,
} from "./types";

const LOW_RISK: NodeRiskView = {
  riskLevel: "low",
  isDestructive: false,
  requiresConfirmation: false,
  riskDescription: null,
};

/** Classify a config value WITHOUT surfacing it (no-leak). */
function detectFieldStatus(value: unknown): {
  status: ConfigFieldStatus;
  references?: string[];
} {
  if (value === undefined || value === null) return { status: "not_set" };
  if (typeof value === "string") {
    if (value.trim() === "") return { status: "not_set" };
    if (value === REDACTED) return { status: "redacted" };
    if (value.includes("{{AI_FIELD:")) return { status: "ai_generated" };
    const refs = parseReferences(value);
    if (refs.length > 0) {
      return { status: "variable_reference", references: refs.map((r) => r.token) };
    }
    return { status: "literal" };
  }
  if (Array.isArray(value)) return { status: "list" };
  if (typeof value === "object") return { status: "structured" };
  return { status: "literal" }; // number / boolean
}

export async function explainNodeForAI(
  userId: string,
  workflowId: string,
  nodeId: string,
): Promise<AiToolResult<NodeExplanation>> {
  const graphRes = await getWorkflowGraphForAI(userId, workflowId);
  if (!graphRes.ok) return graphRes;

  const node = graphRes.data.nodes.find((n) => n.id === nodeId);
  if (!node) {
    return aiToolErr("NOT_FOUND", `No node '${nodeId}' in workflow '${workflowId}'.`);
  }
  const key = `${node.provider}:${node.type}`;

  const meta = node.kind === "action" ? getActionMeta(key) : getTriggerMeta(key);
  if (!meta.ok) {
    // Unknown node type — explain honestly, never guess.
    return aiToolOk({
      workflowId,
      nodeId,
      key,
      kind: node.kind,
      displayName: key,
      description: "This node uses an unrecognized provider/action type.",
      summaryText: `Node "${nodeId}" uses an unrecognized type "${key}" and may need to be reconfigured.`,
      requiresIntegration: false,
      integrationConnected: null,
      risk: LOW_RISK,
      configFields: [],
      availableVariableCount: 0,
      availableVariables: [],
      notes: [
        "This node's provider/action is not in the registry; it can't be safely described or edited until it's a known type.",
      ],
    });
  }

  const risk: NodeRiskView =
    "riskLevel" in meta.data
      ? {
          riskLevel: meta.data.riskLevel,
          isDestructive: meta.data.isDestructive,
          requiresConfirmation: meta.data.requiresConfirmation,
          riskDescription: meta.data.riskDescription,
        }
      : LOW_RISK;

  const configFields: NodeConfigFieldExplanation[] = meta.data.fields.map((f) => {
    const { status, references } = detectFieldStatus(node.config[f.name]);
    return {
      field: f.name,
      label: f.label,
      required: f.required,
      status,
      ...(references ? { references } : {}),
    };
  });

  // Upstream variables this node can map from (schema only, no values).
  const varsRes = await getAvailableVariablesForAI(userId, workflowId, nodeId);
  const availableVariables = varsRes.ok ? varsRes.data.variables : [];

  // Integration connectivity (only when the node needs one).
  // TW-4: scope to the workflow's account + creator policy (22D-3) so a Team
  // workflow reports the credential the run will actually use (account-shared
  // or the creator's), and never a co-member's personal credential.
  let integrationConnected: boolean | null = null;
  if (meta.data.requiresIntegration) {
    const conn = await getConnectedIntegrationsForAI(userId, workflowId);
    integrationConnected = conn.ok
      ? conn.data.integrations.some((i) => i.provider === node.provider)
      : null;
  }

  const notes: string[] = [];
  const missingRequired = configFields
    .filter((c) => c.required && c.status === "not_set")
    .map((c) => c.label);
  if (missingRequired.length > 0) {
    notes.push(`Missing required field(s): ${missingRequired.join(", ")}.`);
  }
  if (meta.data.requiresIntegration && integrationConnected === false) {
    notes.push(`Requires a connected ${node.provider} integration, which is not connected.`);
  }
  if (risk.riskLevel === "high" || risk.isDestructive || risk.requiresConfirmation) {
    notes.push("This is a high-risk action and will require confirmation before it runs.");
  }

  const setCount = configFields.filter((c) => c.status !== "not_set").length;
  const kindLabel = node.kind === "trigger" ? "Trigger" : "Action";
  const summaryText =
    `${kindLabel} "${meta.data.displayName}" (${key}). ${meta.data.description} ` +
    `${setCount}/${configFields.length} field(s) configured; ` +
    `${availableVariables.length} upstream variable(s) available.`;

  return aiToolOk({
    workflowId,
    nodeId,
    key,
    kind: node.kind,
    displayName: meta.data.displayName,
    description: meta.data.description,
    summaryText: summaryText.trim(),
    requiresIntegration: meta.data.requiresIntegration,
    integrationConnected,
    risk,
    configFields,
    availableVariableCount: availableVariables.length,
    availableVariables,
    notes,
  });
}
