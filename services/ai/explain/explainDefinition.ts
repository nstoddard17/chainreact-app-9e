/**
 * Pure in-memory workflow-definition explainer (Slice 4.AI-5 support).
 *
 * `explainWorkflowForAI` (AI-4) explains a SAVED workflow (DB-backed). The
 * patch preview (AI-5) needs to explain a CANDIDATE definition that only
 * exists in memory — it must NOT be written to the DB just to describe it.
 * This pure helper does exactly that: given a `WorkflowDefinition`, it produces
 * the same kind of grounded, deterministic explanation directly from the graph
 * + the registry (`getActionMeta`/`getTriggerMeta` — pure registry reads).
 *
 * Pure: no DB, no model calls, no mutation. It cannot fail, so it returns the
 * explanation directly (no `AiToolResult` wrapper). Config VALUES are never
 * read here — only node identity + registry metadata — so nothing can leak.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §2/§3.
 */

import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflow";
import { getActionMeta, getTriggerMeta } from "@/services/ai/tools/providerCatalog";
import type {
  HighRiskNodeView,
  UnknownNodeView,
} from "@/services/ai/tools/workflowContext";
import type {
  WorkflowExplanationEdge,
  WorkflowExplanationStep,
  WorkflowExplanationTrigger,
} from "./types";

export interface WorkflowDefinitionExplanation {
  readonly trigger: WorkflowExplanationTrigger | null;
  readonly steps: readonly WorkflowExplanationStep[];
  readonly dataFlow: readonly WorkflowExplanationEdge[];
  readonly providersUsed: readonly string[];
  readonly requiresIntegrationProviders: readonly string[];
  readonly highRiskNodes: readonly HighRiskNodeView[];
  readonly unknownNodes: readonly UnknownNodeView[];
  readonly summaryText: string;
  readonly notes: readonly string[];
}

function nodeKey(node: WorkflowNode): string {
  return `${node.provider}:${node.type}`;
}

function buildSummaryText(
  name: string | undefined,
  trigger: WorkflowExplanationTrigger | null,
  steps: readonly WorkflowExplanationStep[],
  highRiskCount: number,
): string {
  const subject = name ? `The workflow "${name}"` : "This workflow";
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
  return `${subject} ${triggerClause}. ${stepClause}.${riskClause}`;
}

export function explainWorkflowDefinition(
  def: WorkflowDefinition,
  opts: { name?: string } = {},
): WorkflowDefinitionExplanation {
  let trigger: WorkflowExplanationTrigger | null = null;
  const steps: WorkflowExplanationStep[] = [];
  const highRiskNodes: HighRiskNodeView[] = [];
  const unknownNodes: UnknownNodeView[] = [];
  const providersUsed = new Set<string>();
  const requiresIntegrationProviders = new Set<string>();

  for (const node of def.nodes) {
    if (node.provider) providersUsed.add(node.provider);
    const key = nodeKey(node);

    if (node.kind === "trigger") {
      const metaRes = node.type ? getTriggerMeta(key) : null;
      if (metaRes && metaRes.ok) {
        trigger = {
          nodeId: node.id,
          key,
          displayName: metaRes.data.displayName,
          description: metaRes.data.description,
          activation: metaRes.data.activation,
        };
        if (metaRes.data.requiresIntegration) requiresIntegrationProviders.add(node.provider);
      } else {
        unknownNodes.push({ nodeId: node.id, key });
      }
      continue;
    }

    const metaRes = node.type ? getActionMeta(key) : null;
    if (!metaRes || !metaRes.ok) {
      unknownNodes.push({ nodeId: node.id, key });
      continue;
    }
    steps.push({
      nodeId: node.id,
      key,
      displayName: metaRes.data.displayName,
      description: metaRes.data.description,
      riskLevel: metaRes.data.riskLevel,
      requiresIntegration: metaRes.data.requiresIntegration,
    });
    if (metaRes.data.requiresIntegration) requiresIntegrationProviders.add(node.provider);
    if (
      metaRes.data.riskLevel === "high" ||
      metaRes.data.isDestructive ||
      metaRes.data.requiresConfirmation
    ) {
      highRiskNodes.push({
        nodeId: node.id,
        key,
        riskLevel: metaRes.data.riskLevel,
        isDestructive: metaRes.data.isDestructive,
        requiresConfirmation: metaRes.data.requiresConfirmation,
      });
    }
  }

  const dataFlow: WorkflowExplanationEdge[] = def.edges.map((e) => ({
    from: e.from,
    to: e.to,
    ...(e.label !== undefined ? { label: e.label } : {}),
  }));

  const notes: string[] = [];
  if (!trigger) notes.push("This workflow has no trigger; it can only be run manually.");
  if (steps.length === 0) notes.push("This workflow has no action steps yet.");
  if (unknownNodes.length > 0) {
    notes.push(`${unknownNodes.length} node(s) use an unrecognized provider/action.`);
  }
  const integrationProviders = [...requiresIntegrationProviders].sort();
  if (integrationProviders.length > 0) {
    notes.push(`Requires connected integrations: ${integrationProviders.join(", ")}.`);
  }

  return {
    trigger,
    steps,
    dataFlow,
    providersUsed: [...providersUsed].sort(),
    requiresIntegrationProviders: integrationProviders,
    highRiskNodes,
    unknownNodes,
    summaryText: buildSummaryText(opts.name, trigger, steps, highRiskNodes.length),
    notes,
  };
}
