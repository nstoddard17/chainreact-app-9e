"use client";

import type { AgentSetupIssue } from "@/core/workflows/agentSetupIssues";
import type { AgentReadinessVerdict } from "@/core/workflows/agentReadiness";
import { BuilderSetupNeededCard } from "../panels/BuilderSetupNeededCard";
import { AgentReadinessSummary } from "../panels/AgentReadinessSummary";

/**
 * Transient post-apply confirmation + "Setup needed" panel
 * (HERMES-AGENT-APPLY-PREVIEW-PATCH / CHECKLIST-ITEM-10).
 *
 * Renders after an explicit "Apply preview". Two parts:
 *   1. The placement-derived headline (`notice`) telling the user the preview was
 *      applied to the LOCAL draft and they still review + save normally.
 *   2. A "Setup needed" list of the required fields each newly-added node still
 *      needs (the `AgentSetupIssue` read-model). Each row names the node + field,
 *      explains it safely, gives the next step, and — when it carries a focus
 *      target — is clickable to open the config panel and highlight the field via
 *      `onOpenIssue` (the parent wires `configSlice.revealNode`).
 *
 * The issue rows are field NAMES / LABELS only — sourced from action/trigger
 * metadata (the same readiness rule as the canvas "Needs setup" chip). No values,
 * secrets, tokens, or credential ids ever appear here.
 *
 * Presentational only: no store reads, no side effects beyond `onOpenIssue` /
 * `onDismiss`. The parent owns the lifetime (clears on dismiss / workflow switch /
 * a new preview) and owns the open-and-highlight navigation.
 */
export function BuilderApplyNotice({
  notice,
  setupIssues,
  readiness,
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
  readonly onOpenIssue: (issue: AgentSetupIssue) => void;
  readonly onDismiss: () => void;
}) {
  return (
    <div
      data-testid="builder-apply-notice"
      role="status"
      className="pointer-events-auto absolute left-1/2 top-3 z-30 flex max-w-[420px] -translate-x-1/2 flex-col gap-1.5 rounded-md px-3 py-2 text-[12px] shadow-md"
      style={{
        background: "var(--builder-panel)",
        border: "1px solid var(--builder-border)",
        color: "var(--builder-text)",
      }}
    >
      <div className="flex items-center gap-3">
        <span>{notice}</span>
        <button
          type="button"
          onClick={onDismiss}
          data-testid="builder-apply-notice-dismiss"
          aria-label="Dismiss"
          className="ml-auto rounded px-1 text-[12px]"
          style={{ color: "var(--builder-muted)" }}
        >
          ✕
        </button>
      </div>

      {readiness ? <AgentReadinessSummary verdict={readiness} compact /> : null}

      <BuilderSetupNeededCard issues={setupIssues} onOpenIssue={onOpenIssue} />
    </div>
  );
}
