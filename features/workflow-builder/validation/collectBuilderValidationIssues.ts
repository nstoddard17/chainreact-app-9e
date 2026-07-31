import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import {
  isRequiredValueMissing,
  missingRequiredFields,
  missingRequiredGroups,
  requirementLookupKey,
  type NodeTypeRequirement,
  type NodeTypeRequirements,
  type RequiredFieldsByType,
} from "@/core/workflows/requiredFields";
import { findGraphIssues } from "@/core/workflows/executionReadiness";
import { findInvalidVariableReferences } from "@/core/workflows/invalidVariableReferences";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import { validateRoutesValue } from "../config-modal/fields/_routesValidator";
import { validateSchemaFieldsValue } from "../config-modal/fields/_schemaFieldsValidator";

/**
 * Builder-level validation issue collection (Slice 4.BUILDER-VALIDATION-1;
 * graph-integrity added in B).
 *
 * Pure helper. Derives a flat list of issues from the builder's pending graph
 * state. Reused by the header pill (count only) and the `ValidationSummary`
 * drawer (full list).
 *
 * Required-field + graph-integrity rules now come from the shared
 * `core/workflows` validator (one ruleset across builder + every server
 * execution entry path). This file maps the shared result into the builder's
 * `BuilderValidationIssue` shape and adds the builder-only `unconfigured_node` /
 * `router_routes_invalid` checks.
 *
 * Issue types:
 *   - `no_trigger` (error) — no trigger node.
 *   - `multiple_triggers` (error) — more than one trigger.
 *   - `unconfigured_node` (error) — node added but never picked a type.
 *   - `router_routes_invalid` (error) — native router with invalid routes.
 *   - `missing_required_field` (error) — a typed node left a required field empty.
 *   - `missing_required_group` (error) — a cross-field "at least one of" requirement
 *     (e.g. Gmail send needs a text OR HTML body) is unsatisfied. One issue per group.
 *   - `unreachable_node` (error) — action not connected to the trigger (won't run).
 *   - `stale_edge` (error) — an edge references a node that no longer exists.
 *   - `self_loop_edge` (error) — an edge connects a step to itself (CS-1; now a shared
 *     runtime/readiness issue, surfaced here too).
 *   - `broken_variable_reference` (warning) — a field references a step that no longer
 *     exists (deleted/unknown node). Soft (non-blocking) like the inline field warning,
 *     but surfaced in the drawer so a prefilled-looking field is never read as complete.
 *
 * Boundary rules: pure; provider-agnostic (only the native router type literal
 * is special-cased, as before). The required-field + connectivity rules live in
 * `core/` so this never becomes a second source of truth.
 */

export type {
  NodeTypeRequirement,
  NodeTypeRequirements,
  RequiredFieldsByType,
};
export {
  isRequiredValueMissing,
  missingRequiredFields,
  missingRequiredGroups,
  requirementLookupKey,
};

export type BuilderValidationSeverity = "error" | "warning";

export type BuilderValidationIssueCode =
  | "no_trigger"
  | "multiple_triggers"
  | "unconfigured_node"
  | "router_routes_invalid"
  | "schema_fields_invalid"
  | "missing_required_field"
  | "missing_required_group"
  | "unreachable_node"
  | "stale_edge"
  | "self_loop_edge"
  | "missing_branch_edge"
  | "stale_branch_edge"
  | "broken_variable_reference";

export interface BuilderValidationIssue {
  /** Stable id for React keys. Built from `code` + node/edge id. */
  readonly id: string;
  readonly code: BuilderValidationIssueCode;
  readonly severity: BuilderValidationSeverity;
  /** Short, author-facing message. Plain English, no jargon. */
  readonly message: string;
  /** When set, the drawer renders the issue as a button that opens the
   * inspector for that node. Absent for graph-level issues (no_trigger, stale_edge). */
  readonly nodeId?: string;
  /** When set, hints which field inside the node is the source of the issue. */
  readonly fieldName?: string;
  /**
   * BUILDER-ISSUES-RAIL-1 — the field's author-facing LABEL ("Channel"), when the issue is about a
   * specific named field. Carried alongside `fieldName` (the KEY) so the drawer can write an exact
   * next step ("Open the Channel field and fill it in.") without re-deriving it from metadata it
   * would have to be threaded separately. A label, never a value.
   */
  readonly fieldLabel?: string;
}

export interface CollectBuilderValidationIssuesInput {
  readonly pendingNodes: readonly WorkflowNode[];
  readonly pendingEdges: readonly WorkflowEdge[];
  /**
   * Required-field metadata per node type. Optional so callers / tests that
   * don't pass it keep their behavior (no `missing_required_field` issues).
   */
  readonly requiredFieldsByType?: RequiredFieldsByType;
  /**
   * AI-PROVIDER-4 — `schema-fields` field definitions per node type
   * (`${provider}:${type}` → the node's schema-fields FieldMetas). Optional:
   * callers that don't pass it get no `schema_fields_invalid` issues, so
   * existing behavior is unchanged. Metadata-driven rather than hardcoded to
   * one action key, because BOTH AI actions (CS-5/CS-6) carry schema editors.
   */
  readonly schemaFieldsByType?: Readonly<Record<string, readonly SchemaFieldsFieldRef[]>>;
}

/** Minimal shape needed to validate one `schema-fields` config value. */
export interface SchemaFieldsFieldRef {
  readonly name: string;
  readonly label: string;
  readonly required?: boolean;
}

const ROUTER_NODE_TYPE = "native:router";

export function collectBuilderValidationIssues(
  input: CollectBuilderValidationIssuesInput,
): readonly BuilderValidationIssue[] {
  const issues: BuilderValidationIssue[] = [];

  const triggers = input.pendingNodes.filter((n) => n.kind === "trigger");
  if (triggers.length === 0) {
    issues.push({
      id: "no_trigger",
      code: "no_trigger",
      severity: "error",
      message: "Add a trigger to your workflow.",
    });
  }

  for (const node of input.pendingNodes) {
    if (node.type === "") {
      issues.push({
        id: `unconfigured_node:${node.id}`,
        code: "unconfigured_node",
        severity: "error",
        message:
          node.kind === "trigger"
            ? "Choose a specific trigger for this node."
            : "Choose a specific action for this node.",
        nodeId: node.id,
      });
      // Skip per-config validation on a node that hasn't picked its type yet.
      continue;
    }
    if (node.type === ROUTER_NODE_TYPE) {
      const routesValue = (node.config ?? {}).routes;
      const result = validateRoutesValue(routesValue);
      if (result.error !== null) {
        issues.push({
          id: `router_routes_invalid:${node.id}`,
          code: "router_routes_invalid",
          severity: "error",
          message: result.error,
          nodeId: node.id,
          fieldName: "routes",
        });
      }
      continue;
    }

    // AI-PROVIDER-4 — structural check for `schema-fields` editors (the AI
    // provider's user-defined schemas). Same shape as the router check: a
    // structurally invalid schema is an error the drawer can point at.
    const schemaFields = input.schemaFieldsByType?.[requirementLookupKey(node)];
    if (schemaFields) {
      for (const field of schemaFields) {
        const result = validateSchemaFieldsValue((node.config ?? {})[field.name], {
          required: field.required === true,
        });
        if (result.error !== null) {
          issues.push({
            id: `schema_fields_invalid:${node.id}:${field.name}`,
            code: "schema_fields_invalid",
            severity: "error",
            message: `${field.label}: ${result.error}`,
            nodeId: node.id,
            fieldName: field.name,
          });
        }
      }
    }

    // BUILDER-READINESS — required fields empty (shared rule). Display name
    // prefers the node's user label, then the metadata display name.
    const reqs = input.requiredFieldsByType?.[requirementLookupKey(node)];
    if (reqs) {
      const displayName = node.displayName ?? reqs.displayName;
      for (const field of missingRequiredFields(node, input.requiredFieldsByType)) {
        issues.push({
          id: `missing_required_field:${node.id}:${field.name}`,
          code: "missing_required_field",
          severity: "error",
          message: `${displayName} needs a ${field.label}.`,
          nodeId: node.id,
          fieldName: field.name,
          fieldLabel: field.label,
        });
      }
      // WORKFLOW-LIVE-TEST-2 — cross-field "at least one of" groups. ONE issue
      // per unsatisfied group (never one per member), naming every field that
      // would satisfy it, and focusing the first visible member so selecting
      // the issue opens somewhere the user can actually act.
      for (const group of missingRequiredGroups(node, input.requiredFieldsByType)) {
        const first = group.fields[0]!;
        const options = group.fields.map((f) => f.label).join(" or ");
        issues.push({
          id: `missing_required_group:${node.id}:${group.fields.map((f) => f.name).join("+")}`,
          code: "missing_required_group",
          severity: "error",
          message: `${displayName}: ${group.message} (${options})`,
          nodeId: node.id,
          fieldName: first.name,
          fieldLabel: first.label,
        });
      }
    }
  }

  // Connectivity / graph integrity (B) — from the shared core validator so the
  // builder, the run-now preflight, and the engine agree. `no_trigger` is kept
  // inline above (contract-stable id/copy); we take the structural issues here.
  // Unreachable is suppressed for a node already flagged `unconfigured_node`
  // (type === "") — one actionable signal per node, not two.
  const unconfiguredNodeIds = new Set(
    input.pendingNodes.filter((n) => n.type === "").map((n) => n.id),
  );
  for (const g of findGraphIssues(input.pendingNodes, input.pendingEdges)) {
    if (g.code === "no_trigger") continue;
    if (
      g.code === "unreachable_node" &&
      g.nodeId !== undefined &&
      unconfiguredNodeIds.has(g.nodeId)
    ) {
      continue;
    }
    issues.push({
      id:
        g.code === "stale_edge" ||
        g.code === "self_loop_edge" ||
        g.code === "stale_branch_edge"
          ? `${g.code}:${g.edgeId}`
          : g.code === "missing_branch_edge"
            ? // Multiple missing routes per node (e.g. true AND false) each
              // need their own stable row.
              `${g.code}:${g.nodeId}:${g.branchLabel}`
            : `${g.code}:${g.nodeId}`,
      code: g.code,
      severity: "error",
      message: g.message,
      ...(g.nodeId !== undefined ? { nodeId: g.nodeId } : {}),
    });
  }

  // Broken variable references — a field points at a step that no longer exists
  // (deleted/unknown source node). Pure graph check (no metadata): the prewired
  // official templates reference only the trigger + existing steps, so they are
  // never flagged. Soft (warning) — non-blocking like the inline field warning,
  // but it keeps the drawer from reading a stale-but-prefilled-looking field as
  // ready. The message names the step + field, never the raw `{{...}}` token (it
  // can carry a node id) and never a provider-resource id.
  const nodeById = new Map(input.pendingNodes.map((n) => [n.id, n]));
  const seenBrokenRefKeys = new Set<string>();
  for (const broken of findInvalidVariableReferences(input.pendingNodes)) {
    const key = `${broken.nodeId}:${broken.fieldKey}`;
    if (seenBrokenRefKeys.has(key)) continue; // one issue per (node, field)
    seenBrokenRefKeys.add(key);
    const node = nodeById.get(broken.nodeId);
    const displayName = node ? getNodeDisplayName(node) : "A step";
    issues.push({
      id: `broken_variable_reference:${key}`,
      code: "broken_variable_reference",
      severity: "warning",
      message: `${displayName} uses data from a step that no longer exists. Re-pick the value or clear it.`,
      nodeId: broken.nodeId,
      fieldName: broken.fieldKey,
    });
  }

  return issues;
}

/**
 * Convenience aggregate for the header pill. Renders as
 * `{errors} error(s) · {warnings} warning(s)` or `Ready`.
 */
export interface BuilderValidationCounts {
  readonly errorCount: number;
  readonly warningCount: number;
  readonly totalCount: number;
}

export function countBuilderValidationIssues(
  issues: readonly BuilderValidationIssue[],
): BuilderValidationCounts {
  let errorCount = 0;
  let warningCount = 0;
  for (const issue of issues) {
    if (issue.severity === "error") errorCount++;
    else warningCount++;
  }
  return { errorCount, warningCount, totalCount: errorCount + warningCount };
}
