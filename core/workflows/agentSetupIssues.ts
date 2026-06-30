import type { WorkflowNode } from "@/contracts/workflow";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import { findInvalidVariableReferences } from "@/core/workflows/invalidVariableReferences";
import {
  missingRequiredFields,
  requirementLookupKey,
  type RequiredFieldsByType,
} from "@/core/workflows/requiredFields";

/**
 * Agent setup-issue read-model (CHECKLIST-ITEM-10 — empty/missing setup after a
 * React Agent change).
 *
 * After the React Agent adds or edits steps, required fields it could not safely
 * fill are left empty. This pure helper turns that situation into a small, flat
 * list of actionable "Setup needed" issues for the builder's post-apply card so a
 * user is never confused about what to do next: it says exactly which NODE and
 * FIELD need attention, an honest explanation, the next step, and whether the gap
 * blocks test / activation.
 *
 * NOT a new ruleset. Every issue is DERIVED from the existing deterministic rules:
 *   - missing required fields → `missingRequiredFields` (the SAME Q5-correct rule
 *     the header pill, validation drawer, Activate gate, and run-now preflight
 *     use), so this can never disagree with readiness.
 *   - broken variable references → `findInvalidVariableReferences` (the same
 *     detector the validation drawer's `broken_variable_reference` warning uses).
 *
 * STRICT no-leak / no-fabrication contract:
 *   - Surfaces field KEY names + author-facing LABELS only — NEVER a config value,
 *     secret, OAuth/refresh token, provider account id, or credential id. The node
 *     config is not read for values here; only emptiness is checked.
 *   - `explanation` is a SAFE, GENERIC sentence. We do NOT claim a specific reason
 *     the agent left a field empty (e.g. "couldn't infer the recipient from the
 *     old Slack message") because no per-field inference reason exists in the
 *     preview/plan data — asserting one would be fabrication.
 *   - `missing_connection` / `invalid_connection` kinds are deliberately NOT
 *     produced here: there is no deterministic connection-health signal in scope,
 *     so emitting them would invent backend state.
 *
 * Pure: no React, no fetch, no store, no I/O. `core/` imports only `contracts/` +
 * client-safe `core/` helpers.
 */

export type AgentSetupIssueKind =
  | "missing_required_field"
  | "unresolved_variable"
  | "needs_user_choice"
  | "unknown";

export interface AgentSetupIssueFocusTarget {
  readonly nodeId: string;
  /** Field KEY to highlight in the config panel. Absent → node-level focus only. */
  readonly fieldPath?: string;
}

export interface AgentSetupIssue {
  /** Stable id for React keys, built from kind + node + field. */
  readonly id: string;
  readonly kind: AgentSetupIssueKind;
  readonly workflowId: string;
  readonly nodeId: string;
  /** Friendly node label (user name → metadata name → formatted type). Never the raw id. */
  readonly nodeLabel: string;
  /** The action/trigger display name for the node type, when metadata is known. */
  readonly actionLabel?: string;
  /** Field KEY (FieldMeta.name) — drives the config-panel highlight. Never a value. */
  readonly fieldPath?: string;
  /** Author-facing field label (e.g. "To", "Channel"). Never a value. */
  readonly fieldLabel?: string;
  /** Short, user-facing headline. Labels only. */
  readonly message: string;
  /** Safe, generic why-line. Never a fabricated specific inference reason. */
  readonly explanation: string;
  /** The single next step. */
  readonly nextStep: string;
  /** True when this gap blocks a test run / activation (required-field gaps do). */
  readonly blocking: boolean;
  /** Where clicking the issue should focus the config panel. */
  readonly focusTarget?: AgentSetupIssueFocusTarget;
}

export interface BuildAgentSetupIssuesInput {
  readonly workflowId: string;
  /**
   * The agent-touched node ids to report on (e.g. the just-applied preview's added
   * node ids). Order is preserved in the output.
   */
  readonly nodeIds: readonly string[];
  /** The LIVE draft nodes. Issues recompute from this, so a gap clears once filled. */
  readonly nodes: readonly WorkflowNode[];
  /** Required-field metadata per `provider:type` (server-derived from the registry). */
  readonly requiredFieldsByType?: RequiredFieldsByType;
}

const MISSING_FIELD_EXPLANATION =
  "React added this step but didn't have enough information to fill this in safely. Choose a value to continue.";
const NO_METADATA_EXPLANATION =
  "React added this step. Review its required fields before you run.";
const BROKEN_REF_EXPLANATION =
  "This field points at a step that no longer exists, so it won't resolve when the workflow runs.";

const NO_METADATA_NEXT_STEP = "Open this step and review its required fields.";
const BROKEN_REF_NEXT_STEP = "Open the step, then re-pick the value or clear it.";

function fieldNextStep(fieldLabel: string): string {
  return `Open the ${fieldLabel} field and fill it in.`;
}

/**
 * Build the flat, actionable setup-issue list for the given agent-touched nodes.
 * One `missing_required_field` issue per empty required field (blocking), one
 * `unresolved_variable` per broken variable reference (non-blocking), and a single
 * conservative `unknown` issue for a node whose type has no metadata to confirm
 * readiness. Returns an empty array when every reported node is complete.
 */
export function buildAgentSetupIssues(
  input: BuildAgentSetupIssuesInput,
): readonly AgentSetupIssue[] {
  const { workflowId, nodeIds, nodes, requiredFieldsByType } = input;
  if (nodeIds.length === 0) return [];

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const reportSet = new Set(nodeIds);

  // Broken variable references are scanned against the FULL node list (so the
  // "does the source node exist?" check is complete), then filtered to the
  // reported nodes. Group by node for ordered emission below.
  const brokenByNode = new Map<string, ReturnType<typeof findInvalidVariableReferences>>();
  for (const ref of findInvalidVariableReferences(nodes)) {
    if (!reportSet.has(ref.nodeId)) continue;
    const bucket = brokenByNode.get(ref.nodeId);
    if (bucket) bucket.push(ref);
    else brokenByNode.set(ref.nodeId, [ref]);
  }

  const issues: AgentSetupIssue[] = [];
  for (const nodeId of nodeIds) {
    const node = byId.get(nodeId);
    if (!node) continue; // removed since the change — nothing to report
    const nodeLabel = getNodeDisplayName(node);
    const reqs = requiredFieldsByType?.[requirementLookupKey(node)];

    if (!reqs) {
      // No metadata for this type → we cannot confirm it is incomplete. Surface a
      // conservative, NON-blocking review prompt (the readiness gate likewise
      // reports no field gap for an unknown type).
      issues.push({
        id: `unknown:${nodeId}`,
        kind: "unknown",
        workflowId,
        nodeId,
        nodeLabel,
        message: `${nodeLabel} needs review.`,
        explanation: NO_METADATA_EXPLANATION,
        nextStep: NO_METADATA_NEXT_STEP,
        blocking: false,
        focusTarget: { nodeId },
      });
    } else {
      const actionLabel = reqs.displayName;
      for (const field of missingRequiredFields(node, requiredFieldsByType)) {
        issues.push({
          id: `missing_required_field:${nodeId}:${field.name}`,
          kind: "missing_required_field",
          workflowId,
          nodeId,
          nodeLabel,
          actionLabel,
          fieldPath: field.name,
          fieldLabel: field.label,
          message: `${actionLabel} needs a ${field.label}.`,
          explanation: MISSING_FIELD_EXPLANATION,
          nextStep: fieldNextStep(field.label),
          blocking: true,
          focusTarget: { nodeId, fieldPath: field.name },
        });
      }
    }

    // Broken variable references on this node (deleted/unknown source step). Soft
    // (non-blocking) — mirrors the validation drawer's warning severity.
    for (const ref of brokenByNode.get(nodeId) ?? []) {
      issues.push({
        id: `unresolved_variable:${nodeId}:${ref.fieldKey}`,
        kind: "unresolved_variable",
        workflowId,
        nodeId,
        nodeLabel,
        fieldPath: ref.fieldKey,
        message: `${nodeLabel} uses data from a step that no longer exists.`,
        explanation: BROKEN_REF_EXPLANATION,
        nextStep: BROKEN_REF_NEXT_STEP,
        blocking: false,
        focusTarget: { nodeId, fieldPath: ref.fieldKey },
      });
    }
  }

  return issues;
}

/** True when at least one issue blocks a test run / activation. */
export function hasBlockingSetupIssue(
  issues: readonly AgentSetupIssue[],
): boolean {
  return issues.some((i) => i.blocking);
}
