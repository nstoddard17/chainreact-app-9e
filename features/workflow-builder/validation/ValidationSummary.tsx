"use client";

import type { WorkflowNode } from "@/contracts/workflow";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import { useConfigSlice } from "../state/configSlice";
import { useGraphSlice } from "../state/graphSlice";
import {
  collectBuilderValidationIssues,
  type BuilderValidationIssue,
} from "./collectBuilderValidationIssues";
import {
  categorizeValidationIssue,
  validationCategoryLabel,
  VALIDATION_CATEGORY_ORDER,
  type ValidationIssueCategory,
} from "./validationIssueCategory";

interface Props {
  /**
   * Optional callback fired after the slice has been told to open a
   * node. The parent (`WorkflowBuilder`) uses this to flip the right
   * drawer mode from `validation` to `inspector`. Optional because the
   * configSlice transition by itself triggers the drawer flip via the
   * existing transition-refs in `WorkflowBuilder` — this callback is
   * just a hook for tests / future composition.
   */
  onOpenNode?: (nodeId: string) => void;
  /**
   * Slice 4.BUILDER-TRIGGER-RECOVERY-1 — optional callback that opens the
   * trigger picker. When provided, the `no_trigger` issue row renders an
   * inline "Choose trigger" action button so the missing-trigger error is
   * directly actionable from the validation drawer (it carries no `nodeId`,
   * so it is otherwise non-clickable). WorkflowBuilder wires this to
   * `openTriggerPicker`.
   */
  onChooseTrigger?: () => void;
  /**
   * BUILDER-READINESS — required-field metadata per `provider:type`. Threaded so
   * the summary lists `missing_required_field` issues (e.g. "HTTP Request needs a
   * Method"), staying in sync with the header pill count. Optional (no map → no
   * required-field rows), preserving isolated-test behavior.
   */
  requiredFieldsByType?: import("./collectBuilderValidationIssues").RequiredFieldsByType;
}

/**
 * Validation summary drawer body (Slice 4.BUILDER-VALIDATION-1).
 *
 * Renders the list of `collectBuilderValidationIssues` against the
 * current `useGraphSlice` pending state. Shows a "Ready" state when
 * there are no issues, or the issues grouped by user-meaningful category
 * ("Needs your input" / "Workflow setup" / "Check your data") when there
 * are (Slice 4.BUILDER-VALIDATION-CATEGORIES — presentational grouping
 * only; severity + blocking semantics are unchanged). Issue rows that
 * carry a `nodeId` are clickable and open
 * the inspector for that node via `configSlice.openNode` — the
 * existing transition-ref machinery in `WorkflowBuilder` then flips
 * the right drawer from `validation` to `inspector`.
 *
 * Boundary rules:
 *   - Provider-agnostic: no per-provider strings, no per-provider
 *     branches. Node labels come from the slice + helpers only.
 *   - Read-only with respect to the graph: clicking an issue dispatches
 *     `configSlice.openNode`, which is the same path the canvas click
 *     and the NodeList Configure button already use. It does NOT
 *     mutate graphSlice (no add / remove / config-change side effects).
 *   - No fetch. No backend call. No AI service call.
 */
export function ValidationSummary({
  onOpenNode,
  onChooseTrigger,
  requiredFieldsByType,
}: Props) {
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  const openNode = useConfigSlice((s) => s.openNode);

  const issues = collectBuilderValidationIssues({
    pendingNodes,
    pendingEdges,
    requiredFieldsByType,
  });

  // Group by user-meaningful category (Slice 4.BUILDER-VALIDATION-CATEGORIES).
  // Presentational only — severity/blocking semantics are unchanged; each row
  // keeps its error/warning styling. "Needs your input" leads so a user who just
  // created a workflow from a template sees the required setup fields first.
  const groups = VALIDATION_CATEGORY_ORDER.map((category) => ({
    category,
    issues: issues.filter((i) => categorizeValidationIssue(i.code) === category),
  })).filter((g) => g.issues.length > 0);

  if (issues.length === 0) {
    return (
      <div
        data-testid="validation-summary"
        data-state="ready"
        className="flex flex-col items-start gap-2 p-3 text-[13px]"
      >
        <p
          className="font-semibold"
          style={{ color: "var(--builder-success)" }}
        >
          Ready to run
        </p>
        <p className="text-[11.5px]" style={{ color: "var(--builder-muted)" }}>
          No builder validation issues detected.
        </p>
      </div>
    );
  }

  function handleOpen(issue: BuilderValidationIssue): void {
    if (!issue.nodeId) return;
    const node = pendingNodes.find((n) => n.id === issue.nodeId);
    if (!node) return;
    openNode({ nodeId: issue.nodeId, initialValues: node.config });
    onOpenNode?.(issue.nodeId);
  }

  return (
    <div
      data-testid="validation-summary"
      data-state="has-issues"
      className="flex flex-col gap-3 text-sm"
    >
      {groups.map((group) => (
        <IssueGroup
          key={group.category}
          category={group.category}
          issues={group.issues}
          pendingNodes={pendingNodes}
          onOpen={handleOpen}
          onChooseTrigger={onChooseTrigger}
        />
      ))}
    </div>
  );
}

function IssueGroup({
  category,
  issues,
  pendingNodes,
  onOpen,
  onChooseTrigger,
}: {
  category: ValidationIssueCategory;
  issues: readonly BuilderValidationIssue[];
  pendingNodes: readonly WorkflowNode[];
  onOpen: (issue: BuilderValidationIssue) => void;
  onChooseTrigger?: () => void;
}) {
  // Heading color follows the group's actual severity (all-warning → amber, else
  // destructive) so styling stays driven by severity, not hard-coded per category.
  const hasError = issues.some((i) => i.severity === "error");
  const headingClass = hasError
    ? "text-destructive"
    : "text-amber-700 dark:text-amber-300";
  const label = `${validationCategoryLabel(category)} · ${issues.length}`;
  return (
    <section
      data-testid="validation-summary-group"
      data-category={category}
      data-severity={hasError ? "error" : "warning"}
      className="flex flex-col gap-2"
    >
      <h3 className={`text-xs font-semibold uppercase tracking-wide ${headingClass}`}>
        {label}
      </h3>
      <ul className="flex flex-col gap-1">
        {issues.map((issue) => (
          <li key={issue.id}>
            <IssueRow
              issue={issue}
              pendingNodes={pendingNodes}
              onOpen={onOpen}
              onChooseTrigger={onChooseTrigger}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function IssueRow({
  issue,
  pendingNodes,
  onOpen,
  onChooseTrigger,
}: {
  issue: BuilderValidationIssue;
  pendingNodes: readonly WorkflowNode[];
  onOpen: (issue: BuilderValidationIssue) => void;
  onChooseTrigger?: () => void;
}) {
  const node = issue.nodeId
    ? pendingNodes.find((n) => n.id === issue.nodeId)
    : undefined;
  // Slice 4.BUILDER-NODE-IDENTITY-1 — friendly user-facing label (custom node
  // name → metadata-derived default → formatted type key), never the raw
  // provider:type key or node id.
  const nodeLabel = node ? getNodeDisplayName(node) : null;

  const containerClass =
    severity(issue.severity) +
    " w-full rounded border px-3 py-2 text-left text-xs transition";

  if (issue.nodeId) {
    return (
      <button
        type="button"
        onClick={() => onOpen(issue)}
        data-testid="validation-summary-issue"
        data-code={issue.code}
        data-node-id={issue.nodeId}
        className={`${containerClass} hover:brightness-95 dark:hover:brightness-110`}
      >
        <IssueBody
          message={issue.message}
          nodeLabel={nodeLabel}
          fieldName={issue.fieldName}
        />
      </button>
    );
  }

  // Slice 4.BUILDER-TRIGGER-RECOVERY-1 — the graph-level `no_trigger` issue
  // carries no nodeId so it can't open an inspector. When the parent supplies
  // `onChooseTrigger`, render an inline action button so the missing-trigger
  // error is directly fixable from the validation drawer.
  const showChooseTrigger =
    issue.code === "no_trigger" && onChooseTrigger !== undefined;

  return (
    <div
      data-testid="validation-summary-issue"
      data-code={issue.code}
      className={containerClass}
    >
      <span className="flex items-start justify-between gap-2">
        <IssueBody
          message={issue.message}
          nodeLabel={nodeLabel}
          fieldName={issue.fieldName}
        />
        {showChooseTrigger ? (
          <button
            type="button"
            onClick={onChooseTrigger}
            data-testid="validation-choose-trigger"
            className="shrink-0 rounded border border-current px-2 py-1 text-[11px] font-medium hover:brightness-95 dark:hover:brightness-110"
          >
            Choose trigger
          </button>
        ) : null}
      </span>
    </div>
  );
}

function IssueBody({
  message,
  nodeLabel,
  fieldName,
}: {
  message: string;
  nodeLabel: string | null;
  fieldName?: string;
}) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-medium">{message}</span>
      {nodeLabel && (
        <span className="text-[11px] text-muted-foreground">
          {nodeLabel}
          {fieldName ? ` · ${fieldName}` : ""}
        </span>
      )}
    </span>
  );
}

function severity(s: "error" | "warning"): string {
  return s === "error"
    ? "border-destructive/40 bg-destructive/5 text-destructive"
    : "border-amber-300/50 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300";
}
