import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import { validateRoutesValue } from "../config-modal/fields/_routesValidator";

/**
 * Builder-level validation issue collection (Slice 4.BUILDER-VALIDATION-1).
 *
 * Pure helper. Derives a flat list of issues from the builder's pending
 * graph state. Reused by the header pill (which only needs the count)
 * and the `ValidationSummary` drawer body (which renders the full list).
 *
 * Issue types implemented in this slice (deliberately conservative —
 * only checks that have a reliable client-side signal today):
 *
 *   - `no_trigger` (error): the workflow has no trigger node. Without
 *     a trigger the workflow can't run.
 *   - `unconfigured_node` (error): a node was added via the bare
 *     `addTrigger({provider})` / `addAction({provider})` paths but
 *     never picked a specific TriggerMeta / ActionMeta. Matches the
 *     same `type === ""` signal `classifyNodeStatus` already emits as
 *     "unconfigured" and that the node-card surfaces with the
 *     "Not configured" amber chip. Same signal, same name — no second
 *     source of truth.
 *   - `router_routes_invalid` (error): native `router` action whose
 *     routes config fails the client-side `_routesValidator` (empty
 *     routes, duplicate labels, unary/binary operator mismatch, etc.).
 *     Re-uses the same validator `ConfigModalShell` gates Save with,
 *     so per-modal and builder-level signals stay aligned.
 *
 * **Deliberately deferred** (each documented as a follow-up so a future
 * slice can pick them up):
 *
 *   - **Required-field-missing errors beyond router.** Would require
 *     loading ActionMeta / TriggerMeta for each node into the builder
 *     client state — today only the active node's metadata is loaded
 *     by `ConfigModalShell`. A future slice can add a Builder-scoped
 *     metadata cache and extend this helper.
 *   - **Disconnected-integration warnings.** Requires fetching the
 *     user's integration connection state into the builder, which
 *     would be a new client read this slice deliberately avoids.
 *   - **Unreachable-node warnings** (action node with no incoming
 *     edge from a trigger-reachable subgraph). Doable via graph
 *     traversal but the edge cases around branching / router routes
 *     deserve their own slice scope.
 *
 * Boundary rules:
 *   - Pure: no slice reads, no I/O, no fetch, no provider-specific
 *     branches anywhere.
 *   - Provider-agnostic: the only provider/type string literals
 *     touched are the native router type `"native:router"` (the same
 *     literal already used by `ConfigModalShell`'s save-gate logic),
 *     so adding a new provider never requires editing this file.
 *   - Server-side validation is NOT replicated here. The router
 *     route validator is the only one shared with a runtime contract
 *     and it is duplicated from `_routesValidator`, which already
 *     mirrors the server schema.
 */

export type BuilderValidationSeverity = "error" | "warning";

export type BuilderValidationIssueCode =
  | "no_trigger"
  | "unconfigured_node"
  | "router_routes_invalid"
  | "missing_required_field";

/**
 * BUILDER-READINESS — one required field of a node type, sourced from the
 * action/trigger metadata's `fields[].required`. `name` keys into `node.config`;
 * `label` is the author-facing field name used in messages ("…needs a Method").
 */
export interface NodeTypeRequirement {
  readonly name: string;
  readonly label: string;
}

/** Required-field requirements for one node type, keyed by `provider:type`. */
export interface NodeTypeRequirements {
  readonly displayName: string;
  readonly requiredFields: readonly NodeTypeRequirement[];
}

/**
 * Map of `provider:type` (== ActionMeta/TriggerMeta `key`) → its required-field
 * requirements. Computed server-side from the discovery registry and threaded
 * into the builder; the values are STATIC (the set of required fields for a node
 * type never changes), so the client validates the LIVE config against them.
 */
export type RequiredFieldsByType = Readonly<Record<string, NodeTypeRequirements>>;

export interface BuilderValidationIssue {
  /** Stable id for React keys. Built from `code` + `nodeId` so two
   * issues on the same node don't collide. */
  readonly id: string;
  readonly code: BuilderValidationIssueCode;
  readonly severity: BuilderValidationSeverity;
  /** Short, author-facing message. Plain English, no jargon. */
  readonly message: string;
  /** When set, the drawer renders the issue as a button that opens
   * the inspector for that node. Absent for graph-level issues
   * (e.g. `no_trigger`). */
  readonly nodeId?: string;
  /** When set, hints which field inside the node is the source of the
   * issue. Today only set for `router_routes_invalid` → `"routes"`.
   * Reserved for future field-level issue codes. */
  readonly fieldName?: string;
}

export interface CollectBuilderValidationIssuesInput {
  readonly pendingNodes: readonly WorkflowNode[];
  readonly pendingEdges: readonly WorkflowEdge[];
  /**
   * BUILDER-READINESS — required-field metadata per node type. Optional so
   * existing callers / tests that don't pass it keep their behavior (no
   * `missing_required_field` issues). When supplied, each typed node is checked
   * for empty required fields.
   */
  readonly requiredFieldsByType?: RequiredFieldsByType;
}

const ROUTER_NODE_TYPE = "native:router";

/**
 * The `provider:type` key a node maps to in `RequiredFieldsByType`. Real nodes
 * store a bare `type` (e.g. `http_request`) so the key is `provider:type`; some
 * call sites / fixtures store the already-combined key (e.g. `native:router`) —
 * tolerated by passing it through unchanged when it already contains a colon.
 */
export function requirementLookupKey(node: WorkflowNode): string {
  return node.type.includes(":") ? node.type : `${node.provider}:${node.type}`;
}

/**
 * A required value is MISSING when it is undefined, null, an empty/whitespace
 * string, or an empty array. `0` and `false` are valid explicit choices and are
 * NOT missing (mirrors the handler-defaults Q5 rule).
 */
export function isRequiredValueMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/**
 * The required fields of `node` that are currently empty, per the metadata
 * lookup. Single source of truth shared by the validation issue collector and
 * the canvas node-status adapter so the header pill and the node chip never
 * diverge. Router nodes are excluded — their `routes` config has a dedicated
 * structural validator (`router_routes_invalid`).
 */
export function missingRequiredFields(
  node: WorkflowNode,
  requiredFieldsByType: RequiredFieldsByType | undefined,
): readonly NodeTypeRequirement[] {
  if (!node.type) return [];
  const key = requirementLookupKey(node);
  if (key === ROUTER_NODE_TYPE) return [];
  const reqs = requiredFieldsByType?.[key];
  if (!reqs) return [];
  return reqs.requiredFields.filter((f) =>
    isRequiredValueMissing((node.config ?? {})[f.name]),
  );
}

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
      // Skip per-config validation on a node that hasn't picked its
      // type yet — there's nothing well-defined to validate.
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
      // Router routes are validated above; skip the generic required-field pass.
      continue;
    }

    // BUILDER-READINESS — a node that picked its type but left a required field
    // empty is NOT ready. Sourced from the action/trigger metadata (no parallel
    // hardcoded rules). The display name prefers the node's user label, falling
    // back to the metadata display name.
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
        });
      }
    }
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
