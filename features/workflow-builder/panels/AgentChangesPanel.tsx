"use client";

import { useState } from "react";
import type {
  AgentChangeHistoryItem,
  AgentChangeStatus,
} from "@/contracts/agentChangeHistory";

/**
 * AGENT-CHANGE-HISTORY-1 — the "Agent changes" activity timeline in the React
 * Agent rail. It answers "what did the agent do?" (distinct from the adjacent
 * "Recent checkpoints" restore-point list).
 *
 * Presentational only: it renders the list + owns the local expand state, but all
 * data + the restore action come from props (the builder owns the
 * useAgentChangeHistory hook + the checkpoint restore re-hydration). No fetch, no
 * slice access. Items are value-free — prompt is the member's own text; title /
 * summary are the secret-scrubbed descriptions already shown in the live preview.
 */

export interface AgentChangesPanelProps {
  readonly items: readonly AgentChangeHistoryItem[];
  readonly loading: boolean;
  /** List-load failure — replaces the list with the message. */
  readonly error: string | null;
  /** The checkpointId currently being restored (drives the per-row "Restoring…" label). */
  readonly restoringCheckpointId: string | null;
  readonly restoreError: string | null;
  /** Restore the checkpoint linked to a history item (reuses the checkpoint restore path). */
  readonly onRestore: (checkpointId: string) => void;
}

interface StatusDisplay {
  readonly label: string;
  /** CSS var (theme-aware) for the badge accent; falls back to a literal color. */
  readonly color: string;
}

const STATUS_DISPLAY: Record<AgentChangeStatus, StatusDisplay> = {
  preview_created: { label: "Preview created", color: "var(--builder-muted)" },
  preview_applied: { label: "Applied", color: "var(--builder-accent, #0284c7)" },
  preview_discarded: { label: "Discarded", color: "var(--builder-muted)" },
  apply_failed: { label: "Failed", color: "var(--builder-danger, #dc2626)" },
  undone: { label: "Undone", color: "var(--builder-muted)" },
  tested: { label: "Tested", color: "var(--builder-success, #16a34a)" },
  test_failed: { label: "Test failed", color: "var(--builder-danger, #dc2626)" },
  restored_checkpoint: { label: "Restored checkpoint", color: "var(--builder-accent, #0284c7)" },
};

function relativeTime(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

/** Build a compact "1 added · 1 removed · 1 setup issue" line; empty when nothing notable. */
function countsLine(item: AgentChangeHistoryItem): string {
  const parts: string[] = [];
  if (item.addedNodeCount > 0) parts.push(`${item.addedNodeCount} added`);
  if (item.removedNodeCount > 0) parts.push(`${item.removedNodeCount} removed`);
  if (item.changedNodeCount > 0) parts.push(`${item.changedNodeCount} changed`);
  if (item.changedConfigCount > 0) {
    parts.push(`${item.changedConfigCount} field${item.changedConfigCount === 1 ? "" : "s"}`);
  }
  if (item.setupIssueCount > 0) {
    parts.push(`${item.setupIssueCount} setup issue${item.setupIssueCount === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

export function AgentChangesPanel({
  items,
  loading,
  error,
  restoringCheckpointId,
  restoreError,
  onRestore,
}: AgentChangesPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Stable per-render clock so every row formats against the same instant.
  const now = Date.now();

  return (
    <section
      data-testid="builder-agent-changes-panel"
      aria-label="Agent changes"
      className="border-t p-2 text-[12px]"
      style={{ borderColor: "var(--builder-border)", color: "var(--builder-text)" }}
    >
      <div className="flex items-baseline justify-between px-1 pb-1">
        <span className="font-medium">Agent changes</span>
        <span style={{ color: "var(--builder-muted)" }}>What React did</span>
      </div>

      {error ? (
        <p
          data-testid="builder-agent-changes-error"
          style={{ color: "var(--builder-muted)" }}
          className="px-1 py-1"
        >
          {error}
        </p>
      ) : loading && items.length === 0 ? (
        <p style={{ color: "var(--builder-muted)" }} className="px-1 py-1">
          Loading agent changes…
        </p>
      ) : items.length === 0 ? (
        <p
          data-testid="builder-agent-changes-empty"
          style={{ color: "var(--builder-muted)" }}
          className="px-1 py-1"
        >
          No agent changes yet.
        </p>
      ) : (
        <ul className="flex max-h-56 flex-col gap-1 overflow-auto">
          {items.map((item) => {
            const display = STATUS_DISPLAY[item.status];
            const counts = countsLine(item);
            const expanded = expandedId === item.id;
            const canRestore = item.checkpointId !== null;
            const restoring =
              item.checkpointId !== null && restoringCheckpointId === item.checkpointId;
            return (
              <li
                key={item.id}
                data-testid="builder-agent-change"
                data-status={item.status}
                className="rounded-md p-2"
                style={{
                  background: "var(--builder-panel-2)",
                  border: "1px solid var(--builder-border)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    data-testid="builder-agent-change-status"
                    className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium"
                    style={{ color: display.color, border: `1px solid ${display.color}` }}
                  >
                    {display.label}
                  </span>
                  <span className="shrink-0" style={{ color: "var(--builder-muted)" }}>
                    {relativeTime(item.createdAt, now)}
                  </span>
                </div>

                {item.title ? (
                  <p className="mt-1 truncate font-medium" title={item.title}>
                    {item.title}
                  </p>
                ) : null}
                {item.prompt ? (
                  <p
                    className="mt-0.5 truncate"
                    style={{ color: "var(--builder-muted)" }}
                    title={item.prompt}
                  >
                    “{item.prompt}”
                  </p>
                ) : null}
                {counts ? (
                  <p
                    data-testid="builder-agent-change-counts"
                    className="mt-0.5"
                    style={{ color: "var(--builder-muted)" }}
                  >
                    {counts}
                  </p>
                ) : null}

                {expanded ? (
                  <div className="mt-1.5">
                    {item.summary ? (
                      <p style={{ color: "var(--builder-muted)" }}>{item.summary}</p>
                    ) : null}
                    {item.failureReason ? (
                      <p
                        data-testid="builder-agent-change-failure"
                        className="mt-1"
                        style={{ color: "var(--builder-danger, #dc2626)" }}
                      >
                        {item.failureReason}
                      </p>
                    ) : null}
                    {!item.summary && !item.failureReason ? (
                      <p style={{ color: "var(--builder-muted)" }}>No further detail.</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-1.5 flex gap-2">
                  <button
                    type="button"
                    data-testid="builder-agent-change-details"
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                    className="rounded px-2 py-1 text-[12px]"
                    style={{ border: "1px solid var(--builder-border)" }}
                  >
                    {expanded ? "Hide details" : "View details"}
                  </button>
                  {canRestore ? (
                    <button
                      type="button"
                      data-testid="builder-agent-change-restore"
                      disabled={restoring}
                      onClick={() => onRestore(item.checkpointId!)}
                      className="rounded px-2 py-1 text-[12px] disabled:opacity-60"
                      style={{ border: "1px solid var(--builder-border)" }}
                    >
                      {restoring ? "Restoring…" : "Restore"}
                    </button>
                  ) : null}
                </div>

                {restoreError && restoring ? (
                  <p
                    data-testid="builder-agent-change-restore-error"
                    className="mt-1"
                    style={{ color: "var(--builder-danger, #dc2626)" }}
                  >
                    {restoreError}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
