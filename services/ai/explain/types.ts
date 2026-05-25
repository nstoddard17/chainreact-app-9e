/**
 * Result types for the read-only workflow explainer (Slice 4.AI-4).
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §2/§3.
 *
 * AI-4 is DETERMINISTIC: it composes the AI-2 read-only context tools into a
 * grounded, secret-free explanation of a workflow / node. NO model calls, NO
 * mutation, NO DB writes. The eventual LLM narration layer is a later wrapper
 * that consumes these structured facts — it is not part of this slice.
 *
 * No-leak contract: explanations describe configuration by FIELD KEY + STATUS
 * (set / mapped / AI-generated / hidden), NEVER by raw config VALUE. Variable-
 * reference tokens (`{{nodeId.path}}`) are safe to surface — they name an
 * upstream output path, not a resolved value.
 */

import type { RiskLevel } from "@/contracts/actionMeta";
import type { TriggerActivation } from "@/contracts/triggerMeta";
import type { WorkflowState } from "@/contracts/workflow";
import type { AvailableVariable } from "@/services/ai/tools/variables";
import type { NodeRiskView } from "@/services/ai/tools/providerCatalog";
import type {
  HighRiskNodeView,
  UnknownNodeView,
} from "@/services/ai/tools/workflowContext";

// ─── Whole-workflow explanation ──────────────────────────────────────────────

export interface WorkflowExplanationTrigger {
  readonly nodeId: string;
  readonly key: string;
  readonly displayName: string;
  readonly description: string;
  readonly activation: TriggerActivation;
}

export interface WorkflowExplanationStep {
  readonly nodeId: string;
  readonly key: string;
  readonly displayName: string;
  readonly description: string;
  readonly riskLevel: RiskLevel;
  readonly requiresIntegration: boolean;
}

export interface WorkflowExplanationEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
}

export interface WorkflowExplanationValidation {
  readonly available: boolean;
  readonly ok: boolean;
  readonly errorCount: number;
  readonly warningCount: number;
  /** Issue messages from the AI-2 validation tool (already secret-free). */
  readonly issueSummaries: readonly string[];
}

export interface WorkflowExplanation {
  readonly workflowId: string;
  readonly name: string;
  readonly state: WorkflowState;
  /** Deterministic plain-English narration assembled from the facts below. */
  readonly summaryText: string;
  readonly trigger: WorkflowExplanationTrigger | null;
  /** Action steps in workflow-definition order (data flow conveys true order). */
  readonly steps: readonly WorkflowExplanationStep[];
  readonly dataFlow: readonly WorkflowExplanationEdge[];
  readonly providersUsed: readonly string[];
  readonly requiresIntegrationProviders: readonly string[];
  readonly highRiskNodes: readonly HighRiskNodeView[];
  readonly unknownNodes: readonly UnknownNodeView[];
  readonly validation: WorkflowExplanationValidation;
  /** Plain-English caveats (no trigger, unknown nodes, missing integrations, …). */
  readonly notes: readonly string[];
}

// ─── Node-level explanation ──────────────────────────────────────────────────

/**
 * How a single config field is populated — described WITHOUT echoing the value
 * so a literal value (e.g. an email address or message body) never leaks into
 * an explanation.
 */
export type ConfigFieldStatus =
  | "not_set"
  | "literal" // a fixed value is present (value intentionally NOT surfaced)
  | "variable_reference" // mapped from upstream output via {{nodeId.path}}
  | "ai_generated" // {{AI_FIELD:...}} runtime-generated value
  | "redacted" // value was secret-redacted upstream by AI-2
  | "list" // an array value
  | "structured"; // a nested object value

export interface NodeConfigFieldExplanation {
  readonly field: string; // FieldMeta.name (key, never a value)
  readonly label: string; // FieldMeta.label
  readonly required: boolean;
  readonly status: ConfigFieldStatus;
  /** For `variable_reference`: the safe `{{nodeId.path}}` token(s) found. */
  readonly references?: readonly string[];
}

export interface NodeExplanation {
  readonly workflowId: string;
  readonly nodeId: string;
  readonly key: string;
  readonly kind: "trigger" | "action";
  readonly displayName: string;
  readonly description: string;
  /** Deterministic plain-English narration. */
  readonly summaryText: string;
  readonly requiresIntegration: boolean;
  /** True/false when `requiresIntegration`; null when not applicable / unknown. */
  readonly integrationConnected: boolean | null;
  readonly risk: NodeRiskView;
  readonly configFields: readonly NodeConfigFieldExplanation[];
  readonly availableVariableCount: number;
  /** Upstream output SCHEMA the node can map from (no run-data values). */
  readonly availableVariables: readonly AvailableVariable[];
  readonly notes: readonly string[];
}
