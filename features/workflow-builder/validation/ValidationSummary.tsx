"use client";

import type { WorkflowNode } from "@/contracts/workflow";
import { useConfigSlice } from "../state/configSlice";
import { useGraphSlice } from "../state/graphSlice";
import {
  collectBuilderValidationIssues,
  type BuilderValidationIssue,
} from "./collectBuilderValidationIssues";

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
}

/**
 * Validation summary drawer body (Slice 4.BUILDER-VALIDATION-1).
 *
 * Renders the list of `collectBuilderValidationIssues` against the
 * current `useGraphSlice` pending state. Shows a "Ready" state when
 * there are no issues, or a grouped list of error / warning rows when
 * there are. Issue rows that carry a `nodeId` are clickable and open
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
export function ValidationSummary({ onOpenNode }: Props) {
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  const openNode = useConfigSlice((s) => s.openNode);

  const issues = collectBuilderValidationIssues({
    pendingNodes,
    pendingEdges,
  });

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (issues.length === 0) {
    return (
      <div
        data-testid="validation-summary"
        data-state="ready"
        className="flex flex-col items-start gap-2 text-sm"
      >
        <p className="font-medium text-emerald-700 dark:text-emerald-300">
          Ready to run
        </p>
        <p className="text-xs text-muted-foreground">
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
      {errors.length > 0 && (
        <IssueGroup
          severity="error"
          label={`${errors.length} issue${errors.length > 1 ? "s" : ""}`}
          issues={errors}
          pendingNodes={pendingNodes}
          onOpen={handleOpen}
        />
      )}
      {warnings.length > 0 && (
        <IssueGroup
          severity="warning"
          label={`${warnings.length} warning${warnings.length > 1 ? "s" : ""}`}
          issues={warnings}
          pendingNodes={pendingNodes}
          onOpen={handleOpen}
        />
      )}
    </div>
  );
}

function IssueGroup({
  severity,
  label,
  issues,
  pendingNodes,
  onOpen,
}: {
  severity: "error" | "warning";
  label: string;
  issues: readonly BuilderValidationIssue[];
  pendingNodes: readonly WorkflowNode[];
  onOpen: (issue: BuilderValidationIssue) => void;
}) {
  const headingClass =
    severity === "error"
      ? "text-destructive"
      : "text-amber-700 dark:text-amber-300";
  return (
    <section
      data-testid={`validation-summary-${severity}-group`}
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
}: {
  issue: BuilderValidationIssue;
  pendingNodes: readonly WorkflowNode[];
  onOpen: (issue: BuilderValidationIssue) => void;
}) {
  const node = issue.nodeId
    ? pendingNodes.find((n) => n.id === issue.nodeId)
    : undefined;
  // Use the provider + type as the node label — same source the node
  // card already uses. Picker labels (Slack / Gmail / etc.) aren't in
  // the slice; the inspector covers the friendly name.
  const nodeLabel = node
    ? node.type
      ? `${node.provider} · ${node.type}`
      : `${node.provider} · (unconfigured)`
    : null;

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
  return (
    <div
      data-testid="validation-summary-issue"
      data-code={issue.code}
      className={containerClass}
    >
      <IssueBody
        message={issue.message}
        nodeLabel={nodeLabel}
        fieldName={issue.fieldName}
      />
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
