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
 * Presentational ONLY: no store access, no fetch, no model/gateway call, no
 * persistence. It never fills, saves, runs, or activates — clicking a row only
 * NAVIGATES to the field. All copy is labels-only (the read-model already excludes
 * values / secrets / credential ids).
 */

export interface BuilderSetupNeededCardProps {
  readonly issues: readonly AgentSetupIssue[];
  /** Open the node's config panel and highlight the field (navigation only). */
  readonly onOpenIssue: (issue: AgentSetupIssue) => void;
}

export function BuilderSetupNeededCard({
  issues,
  onOpenIssue,
}: BuilderSetupNeededCardProps) {
  if (issues.length === 0) return null;
  const blockingCount = issues.filter((i) => i.blocking).length;

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
            <SetupIssueRow issue={issue} onOpenIssue={onOpenIssue} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SetupIssueRow({
  issue,
  onOpenIssue,
}: {
  readonly issue: AgentSetupIssue;
  readonly onOpenIssue: (issue: AgentSetupIssue) => void;
}) {
  const body = <SetupIssueBody issue={issue} />;

  // Only render a button when there's somewhere to focus. A focus-less issue
  // (none in v1, but kept honest) renders as plain text rather than a dead click.
  if (!issue.focusTarget) {
    return (
      <div
        data-testid="builder-setup-needed-issue"
        data-kind={issue.kind}
        data-node-id={issue.nodeId}
        className="w-full rounded border px-2.5 py-1.5 text-left"
        style={{ borderColor: "var(--builder-border)", background: "var(--builder-panel-2)" }}
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
      data-kind={issue.kind}
      data-node-id={issue.nodeId}
      {...(issue.fieldPath ? { "data-field-path": issue.fieldPath } : {})}
      data-blocking={issue.blocking ? "true" : "false"}
      className="w-full rounded border px-2.5 py-1.5 text-left transition hover:brightness-95 dark:hover:brightness-110"
      style={{ borderColor: "var(--builder-border)", background: "var(--builder-panel-2)" }}
    >
      {body}
    </button>
  );
}

function SetupIssueBody({ issue }: { readonly issue: AgentSetupIssue }) {
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
