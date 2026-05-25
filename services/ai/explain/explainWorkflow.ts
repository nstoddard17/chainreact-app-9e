/**
 * Read-only whole-workflow explainer (Slice 4.AI-4).
 *
 * Composes the AI-2 read-only context tools into a grounded, deterministic
 * explanation of what a workflow does. NO model calls, NO mutation, NO DB
 * writes. Ownership / NOT_FOUND are enforced by the underlying AI-2 tools and
 * propagated verbatim.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §2/§3.
 */

import { getActionMeta, getTriggerMeta } from "@/services/ai/tools/providerCatalog";
import {
  getWorkflowGraphForAI,
  getWorkflowSummaryForAI,
  getWorkflowValidationStateForAI,
} from "@/services/ai/tools/workflowContext";
import { aiToolOk, type AiToolResult } from "@/services/ai/tools/types";
import type {
  WorkflowExplanation,
  WorkflowExplanationEdge,
  WorkflowExplanationStep,
  WorkflowExplanationTrigger,
  WorkflowExplanationValidation,
} from "./types";

function buildSummaryText(
  name: string,
  trigger: WorkflowExplanationTrigger | null,
  steps: readonly WorkflowExplanationStep[],
  highRiskCount: number,
  validation: WorkflowExplanationValidation,
): string {
  const triggerClause = trigger
    ? `is triggered by "${trigger.displayName}" (${trigger.activation})`
    : "has no trigger yet, so it can only be started manually";

  const stepClause =
    steps.length === 0
      ? "It has no action steps yet"
      : `Then it runs ${steps.length} step${steps.length === 1 ? "" : "s"}: ${steps
          .map((s) => s.displayName)
          .join(" → ")}`;

  const riskClause =
    highRiskCount > 0
      ? ` ${highRiskCount} step${highRiskCount === 1 ? "" : "s"} are high-risk and need confirmation before running.`
      : "";

  const validationClause = !validation.available
    ? ""
    : validation.ok
      ? " It is currently valid."
      : ` It has ${validation.errorCount} issue${validation.errorCount === 1 ? "" : "s"} to fix before it can run.`;

  return `The workflow "${name}" ${triggerClause}. ${stepClause}.${riskClause}${validationClause}`;
}

export async function explainWorkflowForAI(
  userId: string,
  workflowId: string,
): Promise<AiToolResult<WorkflowExplanation>> {
  // Summary is the primary grounding source (ownership + NOT_FOUND enforced here).
  const summaryRes = await getWorkflowSummaryForAI(userId, workflowId);
  if (!summaryRes.ok) return summaryRes;
  const summary = summaryRes.data;

  // Graph supplies the edges (data flow); same ownership guard applies.
  const graphRes = await getWorkflowGraphForAI(userId, workflowId);
  if (!graphRes.ok) return graphRes;
  const dataFlow: WorkflowExplanationEdge[] = graphRes.data.edges.map((e) => ({
    from: e.from,
    to: e.to,
    ...(e.label !== undefined ? { label: e.label } : {}),
  }));

  // Validation is best-effort — a degraded section never fails the explanation.
  const validationRes = await getWorkflowValidationStateForAI(userId, workflowId);
  const validation: WorkflowExplanationValidation = validationRes.ok
    ? {
        available: true,
        ok: validationRes.data.ok,
        errorCount: validationRes.data.issues.filter((i) => i.severity === "error").length,
        warningCount: validationRes.data.issues.filter((i) => i.severity === "warning").length,
        issueSummaries: validationRes.data.issues.map((i) => i.message),
      }
    : { available: false, ok: false, errorCount: 0, warningCount: 0, issueSummaries: [] };

  // Trigger detail (description + activation) from the registry — in-memory.
  let trigger: WorkflowExplanationTrigger | null = null;
  if (summary.trigger) {
    const metaRes = getTriggerMeta(summary.trigger.key);
    trigger = {
      nodeId: summary.trigger.nodeId,
      key: summary.trigger.key,
      displayName: summary.trigger.displayName,
      description: metaRes.ok ? metaRes.data.description : "",
      activation: summary.trigger.activation,
    };
  }

  // Step detail (description + risk + integration need) from the registry.
  const steps: WorkflowExplanationStep[] = summary.actions.map((a) => {
    const metaRes = getActionMeta(a.key);
    return {
      nodeId: a.nodeId,
      key: a.key,
      displayName: a.displayName,
      description: metaRes.ok ? metaRes.data.description : "",
      riskLevel: metaRes.ok ? metaRes.data.riskLevel : "low",
      requiresIntegration: metaRes.ok ? metaRes.data.requiresIntegration : false,
    };
  });

  const notes: string[] = [];
  if (!trigger) notes.push("This workflow has no trigger; it can only be run manually.");
  if (summary.actions.length === 0) notes.push("This workflow has no action steps yet.");
  if (summary.unknownNodes.length > 0) {
    notes.push(
      `${summary.unknownNodes.length} node(s) use an unrecognized provider/action and may need to be reconfigured.`,
    );
  }
  if (summary.requiresIntegrationProviders.length > 0) {
    notes.push(
      `Requires connected integrations: ${summary.requiresIntegrationProviders.join(", ")}.`,
    );
  }

  return aiToolOk({
    workflowId: summary.workflowId,
    name: summary.name,
    state: summary.state,
    summaryText: buildSummaryText(summary.name, trigger, steps, summary.highRiskNodes.length, validation),
    trigger,
    steps,
    dataFlow,
    providersUsed: summary.providersUsed,
    requiresIntegrationProviders: summary.requiresIntegrationProviders,
    highRiskNodes: summary.highRiskNodes,
    unknownNodes: summary.unknownNodes,
    validation,
    notes,
  });
}
