import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import type { CheckWorkflowReviewContext } from "@/core/workflows/checkWorkflowReview";
import {
  collectBuilderValidationIssues,
  countBuilderValidationIssues,
  type RequiredFieldsByType,
} from "./collectBuilderValidationIssues";

/**
 * Build the DETERMINISTIC review context for the "Check workflow" agent action
 * (BUILDER-AGENT-RAIL-CHECK-WORKFLOW-REVIEW).
 *
 * Reuses the SAME `collectBuilderValidationIssues` that drives the header pill
 * and the validation drawer, so the agent review can never disagree with the
 * deterministic validation surface. Pure — no store/network. The summary uses
 * node labels for a friendly local description; only the issue COUNT + CODES are
 * meant to leave the browser (see `buildAgentReviewGoalText`).
 */

export interface BuildCheckReviewContextInput {
  readonly pendingNodes: readonly WorkflowNode[];
  readonly pendingEdges: readonly WorkflowEdge[];
  readonly requiredFieldsByType?: RequiredFieldsByType;
  /** provider id → friendly label (e.g. "slack" → "Slack"). Optional. */
  readonly providerLabels?: Readonly<Record<string, string>>;
}

/** Humanize a provider-scoped type, e.g. "send_channel_message" → "send channel message". */
function humanizeType(type: string): string {
  return type.replace(/[_-]+/g, " ").trim();
}

/** Friendly, local-only label for one node. Prefers the user's name, then provider + type. */
function nodeLabel(node: WorkflowNode, providerLabels?: Readonly<Record<string, string>>): string {
  const named = node.displayName?.trim();
  if (named) return named;
  const provider = providerLabels?.[node.provider] ?? node.provider;
  if (node.type.trim().length === 0) return `${provider} (action not chosen yet)`;
  return `${provider} ${humanizeType(node.type)}`;
}

/** Plain-English description of the current draft. Deterministic; local only. */
function summarizeWorkflow(
  nodes: readonly WorkflowNode[],
  providerLabels?: Readonly<Record<string, string>>,
): string {
  if (nodes.length === 0) return "This workflow is empty — it has no steps yet.";
  const trigger = nodes.find((n) => n.kind === "trigger");
  const actions = nodes.filter((n) => n.kind === "action");

  const triggerPart = trigger
    ? `starts when ${nodeLabel(trigger, providerLabels)}`
    : "has no trigger yet";

  let actionPart: string;
  if (actions.length === 0) {
    actionPart = "and has no actions yet";
  } else {
    const names = actions.map((a) => nodeLabel(a, providerLabels)).join(", ");
    const plural = actions.length === 1 ? "step" : "steps";
    actionPart = `then runs ${actions.length} ${plural}: ${names}`;
  }

  return `This workflow ${triggerPart}, ${actionPart}.`;
}

export function buildCheckReviewContext(
  input: BuildCheckReviewContextInput,
): CheckWorkflowReviewContext {
  const issues = collectBuilderValidationIssues({
    pendingNodes: input.pendingNodes,
    pendingEdges: input.pendingEdges,
    ...(input.requiredFieldsByType ? { requiredFieldsByType: input.requiredFieldsByType } : {}),
  });
  const counts = countBuilderValidationIssues(issues);
  return {
    summary: summarizeWorkflow(input.pendingNodes, input.providerLabels),
    // Every builder validation issue is an error-severity blocker today; mirror the pill count.
    blockingIssueCount: counts.errorCount,
    issueMessages: issues.map((i) => i.message),
    issueCodes: [...new Set(issues.map((i) => i.code))],
  };
}
