"use client";

import { useState } from "react";
import type { AgentChangeHistoryItem } from "@/contracts/agentChangeHistory";
import { statusDisplay, countsLine, relativeTime } from "./historyDisplay";
import { RestoreConfirmPopover } from "./RestoreConfirmPopover";

/**
 * AGENT-CHANGE-HISTORY-1 — the "History" top tab body.
 *
 * The full Agent Change History / checkpoint timeline: what React did to this
 * workflow (previews shown / applied / discarded / undone / restored / test-fix),
 * newest first. Replaces the old left-rail "Agent changes" + "Recent checkpoints"
 * footers — restore now lives here (and inline on items) via a popover.
 *
 * Presentational only: data + the View diff / Restore handlers come from props
 * (the builder owns the data hooks + graph re-hydration on restore). No fetch, no
 * slice access. Items are value-free (prompt is the member's own text; title /
 * summary are the secret-scrubbed descriptions; the stored diff redacts secrets).
 */

export interface HistoryPanelProps {
  readonly items: readonly AgentChangeHistoryItem[];
  readonly loading: boolean;
  readonly error: string | null;
  /** Drives the restore popover's "unsaved changes will be discarded" warning. */
  readonly isDirty: boolean;
  readonly restoringCheckpointId: string | null;
  readonly restoreError: string | null;
  /** Restore the checkpoint linked to an item (reuses the builder's checkpoint restore path). */
  readonly onRestore: (checkpointId: string) => void;
  /** Open the read-only View-diff drawer for an item that captured a diff. */
  readonly onViewDiff: (item: AgentChangeHistoryItem) => void;
}

export function HistoryPanel({
  items,
  loading,
  error,
  isDirty,
  restoringCheckpointId,
  restoreError,
  onRestore,
  onViewDiff,
}: HistoryPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const now = Date.now();

  return (
    <div
      data-testid="builder-history-panel"
      className="absolute inset-0 flex flex-col"
      style={{ background: "var(--builder-bg)", color: "var(--builder-text)" }}
    >
      <div
        className="flex shrink-0 items-baseline justify-between border-b px-4 py-2.5"
        style={{ borderColor: "var(--builder-border)" }}
      >
        <h2 className="text-[13px] font-semibold">Agent change history</h2>
        <span className="text-[11px]" style={{ color: "var(--builder-muted)" }}>
          What React did to this workflow
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error ? (
          <p data-testid="builder-history-error" style={{ color: "var(--builder-muted)" }}>
            {error}
          </p>
        ) : loading && items.length === 0 ? (
          <p style={{ color: "var(--builder-muted)" }}>Loading history…</p>
        ) : items.length === 0 ? (
          <p data-testid="builder-history-empty" style={{ color: "var(--builder-muted)" }}>
            No agent changes yet.
          </p>
        ) : (
          <ul className="mx-auto flex max-w-[680px] flex-col gap-2">
            {items.map((item) => {
              const display = statusDisplay(item.status);
              const counts = countsLine(item);
              const expanded = expandedId === item.id;
              const canViewDiff = item.diff !== null;
              const canRestore = item.checkpointId !== null;
              const restoring =
                item.checkpointId !== null && restoringCheckpointId === item.checkpointId;
              return (
                <li
                  key={item.id}
                  data-testid="builder-history-item"
                  data-status={item.status}
                  className="rounded-md p-3"
                  style={{
                    background: "var(--builder-panel)",
                    border: "1px solid var(--builder-border)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      data-testid="builder-history-item-status"
                      className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium"
                      style={{ color: display.color, border: `1px solid ${display.color}` }}
                    >
                      {display.label}
                    </span>
                    <span className="shrink-0 text-[11px]" style={{ color: "var(--builder-muted)" }}>
                      {relativeTime(item.createdAt, now)}
                    </span>
                  </div>

                  {item.title ? <p className="mt-1.5 font-medium">{item.title}</p> : null}
                  {item.prompt ? (
                    <p className="mt-0.5 text-[12px]" style={{ color: "var(--builder-muted)" }} title={item.prompt}>
                      “{item.prompt}”
                    </p>
                  ) : null}
                  {counts ? (
                    <p
                      data-testid="builder-history-item-counts"
                      className="mt-0.5 text-[12px]"
                      style={{ color: "var(--builder-muted)" }}
                    >
                      {counts}
                    </p>
                  ) : null}

                  {expanded ? (
                    <div className="mt-2 text-[12px]">
                      {item.summary ? (
                        <p style={{ color: "var(--builder-muted)" }}>{item.summary}</p>
                      ) : null}
                      {item.failureReason ? (
                        <p
                          data-testid="builder-history-item-failure"
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

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-testid="builder-history-item-details"
                      onClick={() => setExpandedId(expanded ? null : item.id)}
                      className="rounded px-2 py-1 text-[12px]"
                      style={{ border: "1px solid var(--builder-border)" }}
                    >
                      {expanded ? "Hide details" : "View details"}
                    </button>
                    {canViewDiff ? (
                      <button
                        type="button"
                        data-testid="builder-history-item-view-diff"
                        onClick={() => onViewDiff(item)}
                        className="rounded px-2 py-1 text-[12px]"
                        style={{ border: "1px solid var(--builder-border)" }}
                      >
                        View diff
                      </button>
                    ) : null}
                    {canRestore ? (
                      <RestoreConfirmPopover
                        isDirty={isDirty}
                        restoring={restoring}
                        restoreError={restoreError}
                        onConfirm={() => onRestore(item.checkpointId!)}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
