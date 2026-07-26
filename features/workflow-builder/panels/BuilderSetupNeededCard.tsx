"use client";

import type { AgentSetupIssue } from "@/core/workflows/agentSetupIssues";

/**
 * "Setup needed" card (CHECKLIST-ITEM-10).
 *
 * Renders the flat `AgentSetupIssue[]` read-model (from `buildAgentSetupIssues`)
 * after a React Agent change leaves required fields empty. Each row names the
 * NODE + FIELD, gives a safe explanation + the next step, marks whether it blocks
 * test/activation, and — when the issue carries a `focusTarget` — is a button that
 * opens the node's config panel and highlights the field (`onOpenIssue`, wired to
 * `configSlice.revealNode` by the parent).
 *
 * REACT-AGENT-REVIEW-TRAY-UX-1 — the review tray keeps a resolved issue IN PLACE
 * (see `mergeReviewTrayItems`) instead of letting it vanish, so the card also takes
 * `resolvedIssueIds` (rendered as a muted "Resolved" row, excluded from the
 * blocking count) and `selectedIssueId` (the issue the user is currently editing).
 * Both are optional — a caller with only a live list behaves exactly as before.
 *
 * Presentational ONLY: no store access, no fetch, no model/gateway call, no
 * persistence. It never fills, saves, runs, or activates — clicking a row only
 * NAVIGATES to the field. All copy is labels-only (the read-model already excludes
 * values / secrets / credential ids).
 */

export interface BuilderSetupNeededCardProps {
  readonly issues: readonly AgentSetupIssue[];
  /** Ids no longer reported by the live readiness rule — shown as resolved. */
  readonly resolvedIssueIds?: ReadonlySet<string>;
  /** The issue currently being worked on (marked `aria-current`). */
  readonly selectedIssueId?: string | null;
  /** Open the node's config panel and highlight the field (navigation only). */
  readonly onOpenIssue: (issue: AgentSetupIssue) => void;
}

export function BuilderSetupNeededCard({
  issues,
  resolvedIssueIds,
  selectedIssueId,
  onOpenIssue,
}: BuilderSetupNeededCardProps) {
  if (issues.length === 0) return null;
  const isResolved = (issue: AgentSetupIssue) => resolvedIssueIds?.has(issue.id) === true;
  const blockingCount = issues.filter((i) => i.blocking && !isResolved(i)).length;

  return (
    <section
      data-testid="builder-setup-needed"
      aria-label="Setup needed"
      className="flex flex-col gap-1.5"
    >
      <div
        className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: "var(--builder-muted)" }}
      >
        <span>Setup needed</span>
        {blockingCount > 0 ? (
          <span data-testid="builder-setup-needed-blocking" style={{ color: "var(--builder-warning, #b45309)" }}>
            {blockingCount} to fix before active
          </span>
        ) : null}
      </div>

      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {issues.map((issue) => (
          <li key={issue.id}>
            <SetupIssueRow
              issue={issue}
              resolved={isResolved(issue)}
              selected={selectedIssueId === issue.id}
              onOpenIssue={onOpenIssue}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SetupIssueRow({
  issue,
  resolved,
  selected,
  onOpenIssue,
}: {
  readonly issue: AgentSetupIssue;
  readonly resolved: boolean;
  readonly selected: boolean;
  readonly onOpenIssue: (issue: AgentSetupIssue) => void;
}) {
  const body = <SetupIssueBody issue={issue} resolved={resolved} />;
  // A resolved row is muted; the selected row keeps an accent edge so the user can
  // see which item they are currently filling in when they re-expand the tray.
  const style = {
    borderColor: selected ? "var(--builder-accent)" : "var(--builder-border)",
    background: "var(--builder-panel-2)",
    ...(resolved ? { opacity: 0.65 } : {}),
  };
  const marks = {
    "data-kind": issue.kind,
    "data-node-id": issue.nodeId,
    "data-resolved": resolved ? "true" : "false",
    "data-selected": selected ? "true" : "false",
  } as const;

  // Only render a button when there's somewhere to focus. A focus-less issue
  // (none in v1, but kept honest) renders as plain text rather than a dead click.
  if (!issue.focusTarget) {
    return (
      <div
        data-testid="builder-setup-needed-issue"
        {...marks}
        className="w-full rounded border px-2.5 py-1.5 text-left"
        style={style}
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenIssue(issue)}
      data-testid="builder-setup-needed-issue"
      {...marks}
      {...(issue.fieldPath ? { "data-field-path": issue.fieldPath } : {})}
      data-blocking={issue.blocking ? "true" : "false"}
      {...(selected ? { "aria-current": "true" as const } : {})}
      className="w-full rounded border px-2.5 py-1.5 text-left transition hover:brightness-95 dark:hover:brightness-110"
      style={style}
    >
      {body}
    </button>
  );
}

function SetupIssueBody({
  issue,
  resolved,
}: {
  readonly issue: AgentSetupIssue;
  readonly resolved: boolean;
}) {
  if (resolved) {
    // Resolved rows stay in place (stable list + stable scroll) but drop the
    // explanation / next step — there is nothing left to do on them.
    return (
      <span className="flex items-center gap-1.5">
        <span aria-hidden style={{ color: "var(--builder-success, #15803d)" }}>
          ✓
        </span>
        <span
          data-testid="builder-setup-needed-resolved"
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--builder-success, #15803d)" }}
        >
          Resolved
        </span>
        <span className="text-[11.5px]" style={{ color: "var(--builder-muted)" }}>
          {issue.message}
        </span>
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-[11.5px] font-medium" style={{ color: "var(--builder-text)" }}>
        {issue.message}
      </span>
      <span className="text-[11px]" style={{ color: "var(--builder-muted)" }}>
        {issue.explanation}
      </span>
      <span className="text-[11px] font-medium" style={{ color: "var(--builder-accent)" }}>
        {issue.nextStep}
      </span>
    </span>
  );
}
