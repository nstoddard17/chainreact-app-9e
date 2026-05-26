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
  | "router_routes_invalid";

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
