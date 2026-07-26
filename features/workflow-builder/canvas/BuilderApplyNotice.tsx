"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, UIEvent as ReactUIEvent } from "react";
import type { AgentSetupIssue } from "@/core/workflows/agentSetupIssues";
import type { AgentReadinessVerdict } from "@/core/workflows/agentReadiness";
import {
  REVIEW_TRAY_STATUS_LABEL,
  describeReviewTrayRemaining,
  describeReviewTrayStatusLine,
  type AgentReviewTrayStatus,
  type AgentReviewTraySummary,
} from "@/core/workflows/agentReviewTray";
import { BuilderSetupNeededCard } from "../panels/BuilderSetupNeededCard";
import { AgentReadinessSummary } from "../panels/AgentReadinessSummary";
import { useAgentReviewTray } from "../hooks/useAgentReviewTray";

/**
 * Post-apply review tray (HERMES-AGENT-APPLY-PREVIEW-PATCH / CHECKLIST-ITEM-10,
 * reshaped by REACT-AGENT-REVIEW-TRAY-UX-1).
 *
 * Renders after an explicit "Apply preview". It used to be a fixed, always-open
 * centre-canvas panel that covered the workflow while the user tried to fill in the
 * very field it was pointing at. It is now a COLLAPSIBLE, canvas-anchored tray:
 *
 *   - expanded: the placement-derived headline, the readiness verdict, and the
 *     "Setup needed" issue list (one row per node + field that still needs a value),
 *   - clicking an issue: opens the node + highlights the field through the EXISTING
 *     `onOpenIssue` path (`configSlice.revealNode`) AND collapses the tray so the
 *     config panel and canvas are immediately usable,
 *   - collapsed: a compact bar — status pill, remaining count, the issue currently
 *     being edited, and an "Expand" control. Never an invisible icon: unresolved
 *     setup always stays visible.
 *
 * Collapsing is PRESENTATION ONLY. It does not dismiss the review, clear the issue
 * list, reset the agent draft, close the config panel, change the selected node, or
 * discard unsaved config values — `useAgentReviewTray` holds the item list, the
 * selected issue, and the scroll offset across the round-trip; the graph/config
 * stores are never touched from here.
 *
 * The issue rows are field NAMES / LABELS only — sourced from action/trigger
 * metadata (the same readiness rule as the canvas "Needs setup" chip). No values,
 * secrets, tokens, or credential ids ever appear here.
 *
 * Presentational only: no store reads, no side effects beyond `onOpenIssue` /
 * `onDismiss`. The parent owns the lifetime (clears on dismiss / workflow switch /
 * a new preview) and owns the open-and-highlight navigation.
 */

const LIST_ID = "builder-review-tray-list";

const STATUS_TONE: Record<AgentReviewTrayStatus, { bg: string; fg: string }> = {
  blocked: { bg: "var(--builder-danger-bg, rgba(185,28,28,0.12))", fg: "var(--builder-danger, #b91c1c)" },
  review: { bg: "var(--builder-warning-bg, rgba(180,83,9,0.12))", fg: "var(--builder-warning, #b45309)" },
  ready: { bg: "var(--builder-success-bg, rgba(21,128,61,0.12))", fg: "var(--builder-success, #15803d)" },
};

/**
 * Left-anchored so the right-hand configuration panel and the canvas centre stay
 * clear, width-capped for narrow builder widths, and never taller than ~45vh (the
 * list scrolls inside itself rather than growing the page).
 */
const TRAY_ANCHOR =
  "pointer-events-auto absolute left-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] flex-col";

export function BuilderApplyNotice({
  notice,
  setupIssues,
  readiness,
  sessionToken,
  sessionFocus,
  onOpenIssue,
  onDismiss,
}: {
  readonly notice: string;
  readonly setupIssues: readonly AgentSetupIssue[];
  /**
   * REACT-AGENT-READINESS-1 — the post-apply readiness verdict (compact). Shows the
   * status pill + one-line summary so "what is left before this can run?" stays
   * answered after the preview rail closes. Omit → no readiness line.
   */
  readonly readiness?: AgentReadinessVerdict | null;
  /**
   * REACT-AGENT-REVIEW-TRAY-UX-1 — bumped by the parent when a NEW review session
   * starts (a new apply / restore / template notice). Only this resets the tray's
   * expanded / selected / scroll state; ordinary issue-list churn never does.
   */
  readonly sessionToken?: number;
  /**
   * REACT-AGENT-REVIEW-RECOVERY-MERGE-1 — set when the apply that STARTED this session was itself a
   * "take me to this field" action (the rail's `Add to draft & open step`). The tray then opens
   * collapsed on that issue instead of expanding over the field the user was just sent to.
   */
  readonly sessionFocus?: { readonly nodeId: string; readonly fieldKey?: string } | null;
  readonly onOpenIssue: (issue: AgentSetupIssue) => void;
  readonly onDismiss: () => void;
}) {
  const tray = useAgentReviewTray({ issues: setupIssues, sessionToken: sessionToken ?? 0, sessionFocus });
  const { expanded, summary, getScrollTop, rememberScrollTop } = tray;

  const listRef = useRef<HTMLDivElement | null>(null);
  const collapseRef = useRef<HTMLButtonElement | null>(null);
  const expandRef = useRef<HTMLButtonElement | null>(null);
  // "expand" → focus the compact bar's expand button after a manual collapse;
  // "collapse" → focus the collapse button after a manual expand. Left null when the
  // collapse came from selecting an issue: focus belongs to the config field then.
  const focusAfterToggleRef = useRef<"expand" | "collapse" | null>(null);

  // Restore the remembered scroll offset whenever the list is shown again. The
  // attribute mirrors the applied value so the behavior is observable in tests
  // (jsdom has no layout, so `scrollTop` itself always reads back as 0).
  useLayoutEffect(() => {
    if (!expanded) return;
    const el = listRef.current;
    if (!el) return;
    const top = getScrollTop();
    el.scrollTop = top;
    el.setAttribute("data-scroll-top", String(top));
  }, [expanded, getScrollTop]);

  useEffect(() => {
    const want = focusAfterToggleRef.current;
    if (!want) return;
    focusAfterToggleRef.current = null;
    (want === "expand" ? expandRef : collapseRef).current?.focus();
  }, [expanded]);

  const handleCollapse = useCallback(() => {
    focusAfterToggleRef.current = "expand";
    tray.collapse();
  }, [tray]);

  const handleExpand = useCallback(() => {
    focusAfterToggleRef.current = "collapse";
    tray.expand();
  }, [tray]);

  const handleOpenIssue = useCallback(
    (issue: AgentSetupIssue) => {
      // Reuse the EXISTING node-selection + config-panel + field-highlight path
      // first, then collapse so the highlighted field is immediately reachable.
      onOpenIssue(issue);
      tray.selectIssue(issue.id);
    },
    [onOpenIssue, tray],
  );

  // Escape collapses an expanded tray. It never discards the review, and it is
  // stopped here so it can't also cancel something else on the canvas.
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Escape" || !expanded) return;
      event.preventDefault();
      event.stopPropagation();
      handleCollapse();
    },
    [expanded, handleCollapse],
  );

  const handleScroll = useCallback(
    (event: ReactUIEvent<HTMLDivElement>) => rememberScrollTop(event.currentTarget.scrollTop),
    [rememberScrollTop],
  );

  const issues = useMemo(() => tray.items.map((item) => item.issue), [tray.items]);
  const resolvedIssueIds = useMemo(
    () => new Set(tray.items.filter((item) => item.resolved).map((item) => item.issue.id)),
    [tray.items],
  );

  // A notice with no setup issues at all (e.g. a template apply, a restored
  // checkpoint, or a fully-configured change) has nothing to review — it stays the
  // plain transient confirmation it has always been.
  if (summary.total === 0) {
    return (
      <div
        data-testid="builder-apply-notice"
        data-tray="none"
        role="status"
        className={`${TRAY_ANCHOR} w-[360px] gap-1.5 rounded-md px-3 py-2 text-[12px] shadow-md`}
        style={{
          background: "var(--builder-panel)",
          border: "1px solid var(--builder-border)",
          color: "var(--builder-text)",
        }}
      >
        <div className="flex items-center gap-3">
          <span>{notice}</span>
          <DismissButton onDismiss={onDismiss} />
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="builder-apply-notice"
      data-tray={expanded ? "expanded" : "collapsed"}
      role="region"
      aria-label="React Agent review"
      onKeyDown={handleKeyDown}
      className={`${TRAY_ANCHOR} ${expanded ? "w-[360px]" : ""}`}
    >
      {/*
        One persistent polite live region for the whole tray. It survives
        expand/collapse (so toggling never re-announces) and its text only changes
        when the status or the remaining count actually changes.
      */}
      <span
        data-testid="builder-review-tray-live"
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {describeReviewTrayStatusLine(summary)}
      </span>

      {expanded ? (
        <section
          data-testid="builder-review-tray-expanded"
          className="flex max-h-[62vh] flex-col gap-1.5 rounded-md px-3 py-2 text-[12px] shadow-md"
          style={{
            background: "var(--builder-panel)",
            border: "1px solid var(--builder-border)",
            color: "var(--builder-text)",
          }}
        >
          <div className="flex items-center gap-2">
            <StatusPill summary={summary} />
            <RemainingText summary={summary} />
            <button
              type="button"
              ref={collapseRef}
              onClick={handleCollapse}
              data-testid="builder-review-tray-collapse"
              aria-label="Collapse review"
              aria-expanded
              aria-controls={LIST_ID}
              className="ml-auto rounded px-1.5 py-0.5 text-[11px] font-medium"
              style={{ color: "var(--builder-text-2)", border: "1px solid var(--builder-border)" }}
            >
              Collapse
            </button>
            <DismissButton onDismiss={onDismiss} />
          </div>

          <p style={{ color: "var(--builder-text)" }}>{notice}</p>

          <div
            id={LIST_ID}
            ref={listRef}
            onScroll={handleScroll}
            data-testid="builder-review-tray-list"
            className="flex min-h-0 flex-col gap-1.5 overflow-y-auto overscroll-contain pr-0.5"
          >
            {readiness ? <AgentReadinessSummary verdict={readiness} compact /> : null}
            <BuilderSetupNeededCard
              issues={issues}
              resolvedIssueIds={resolvedIssueIds}
              selectedIssueId={tray.selectedIssueId}
              onOpenIssue={handleOpenIssue}
            />
          </div>
        </section>
      ) : (
        <div
          data-testid="builder-review-tray-collapsed"
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] shadow-md"
          style={{
            background: "var(--builder-panel)",
            border: "1px solid var(--builder-border)",
            color: "var(--builder-text)",
          }}
        >
          <StatusPill summary={summary} />
          <RemainingText summary={summary} />
          {tray.selectedIssue ? (
            <span
              data-testid="builder-review-tray-current"
              className="max-w-[160px] truncate"
              style={{ color: "var(--builder-muted)" }}
              title={tray.selectedIssue.message}
            >
              · Editing {tray.selectedIssue.fieldLabel ?? tray.selectedIssue.nodeLabel}
            </span>
          ) : null}
          <button
            type="button"
            ref={expandRef}
            onClick={handleExpand}
            data-testid="builder-review-tray-expand"
            aria-label="Expand review"
            aria-expanded={false}
            className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
            style={{ color: "var(--builder-accent)", border: "1px solid var(--builder-border)" }}
          >
            Review
          </button>
          <DismissButton onDismiss={onDismiss} />
        </div>
      )}
    </div>
  );
}

function StatusPill({ summary }: { readonly summary: AgentReviewTraySummary }) {
  const tone = STATUS_TONE[summary.status];
  return (
    <span
      data-testid="builder-review-tray-status"
      data-status={summary.status}
      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {REVIEW_TRAY_STATUS_LABEL[summary.status]}
    </span>
  );
}

function RemainingText({ summary }: { readonly summary: AgentReviewTraySummary }) {
  return (
    <span data-testid="builder-review-tray-remaining" style={{ color: "var(--builder-text-2)" }}>
      {describeReviewTrayRemaining(summary)}
    </span>
  );
}

function DismissButton({ onDismiss }: { readonly onDismiss: () => void }) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      data-testid="builder-apply-notice-dismiss"
      aria-label="Dismiss"
      className="rounded px-1 text-[12px]"
      style={{ color: "var(--builder-muted)" }}
    >
      ✕
    </button>
  );
}
