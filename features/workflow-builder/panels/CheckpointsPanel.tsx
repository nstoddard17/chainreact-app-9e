"use client";

import { useState } from "react";
import type { WorkflowCheckpoint } from "@/contracts/workflowCheckpoint";

/**
 * CHECKPOINTS-1 — the recent-checkpoints surface in the React Agent rail.
 *
 * Wording note (product): this is deliberately NOT called "history" — it lists
 * restore points captured "before agent changes", distinct from full workflow
 * version history / published revisions. Copy uses "Recent checkpoints".
 *
 * Presentational only: it renders the list and owns the local inline-confirm UI
 * state, but all data + the restore action come from props (the builder owns the
 * useWorkflowCheckpoints hook + graph re-hydration). No fetch, no slice access.
 */

export interface CheckpointsPanelProps {
  readonly checkpoints: readonly WorkflowCheckpoint[];
  readonly loading: boolean;
  /** List-load failure — replaces the list with the message. */
  readonly error: string | null;
  /** Non-blocking notice (e.g. a failed restore-point save on apply) — shown ABOVE the list. */
  readonly warning?: string | null;
  /** Unsaved-edit state — drives the "this will discard unsaved changes" warning. */
  readonly isDirty: boolean;
  readonly restoringId: string | null;
  readonly restoreError: string | null;
  readonly onRestore: (checkpointId: string) => void;
}

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

export function CheckpointsPanel({
  checkpoints,
  loading,
  error,
  warning,
  isDirty,
  restoringId,
  restoreError,
  onRestore,
}: CheckpointsPanelProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Stable per-render clock so every row formats against the same instant.
  const now = Date.now();

  return (
    <section
      data-testid="builder-checkpoints-panel"
      aria-label="Recent checkpoints"
      className="border-t p-2 text-[12px]"
      style={{ borderColor: "var(--builder-border)", color: "var(--builder-text)" }}
    >
      <div className="flex items-baseline justify-between px-1 pb-1">
        <span className="font-medium">Recent checkpoints</span>
        <span style={{ color: "var(--builder-muted)" }}>Before agent changes</span>
      </div>

      {warning ? (
        <p
          data-testid="builder-checkpoints-warning"
          className="px-1 pb-1"
          style={{ color: "var(--builder-muted)" }}
        >
          {warning}
        </p>
      ) : null}

      {error ? (
        <p data-testid="builder-checkpoints-error" style={{ color: "var(--builder-muted)" }} className="px-1 py-1">
          {error}
        </p>
      ) : loading && checkpoints.length === 0 ? (
        <p style={{ color: "var(--builder-muted)" }} className="px-1 py-1">
          Loading checkpoints…
        </p>
      ) : checkpoints.length === 0 ? (
        <p
          data-testid="builder-checkpoints-empty"
          style={{ color: "var(--builder-muted)" }}
          className="px-1 py-1"
        >
          No checkpoints yet. ChainReact saves one before each React Agent change so you can go back.
        </p>
      ) : (
        <ul className="flex max-h-48 flex-col gap-1 overflow-auto">
          {checkpoints.map((cp) => {
            const confirming = confirmingId === cp.id;
            const restoring = restoringId === cp.id;
            return (
              <li
                key={cp.id}
                data-testid="builder-checkpoint"
                className="rounded-md p-2"
                style={{ background: "var(--builder-panel-2)", border: "1px solid var(--builder-border)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{cp.name}</span>
                  <span className="shrink-0" style={{ color: "var(--builder-muted)" }}>
                    {relativeTime(cp.createdAt, now)}
                  </span>
                </div>
                {cp.prompt ? (
                  <p className="mt-0.5 truncate" style={{ color: "var(--builder-muted)" }} title={cp.prompt}>
                    “{cp.prompt}”
                  </p>
                ) : null}
                {cp.summary ? (
                  <p className="mt-0.5 line-clamp-2" style={{ color: "var(--builder-muted)" }}>
                    {cp.summary}
                  </p>
                ) : null}

                {confirming ? (
                  <div className="mt-1.5">
                    <p style={{ color: "var(--builder-muted)" }}>
                      Restore this checkpoint? It replaces your current draft.
                      {isDirty ? " Your unsaved changes will be discarded." : ""}
                    </p>
                    <div className="mt-1 flex gap-2">
                      <button
                        type="button"
                        data-testid="builder-checkpoint-restore-confirm"
                        disabled={restoring}
                        onClick={() => onRestore(cp.id)}
                        className="rounded px-2 py-1 text-[12px] font-medium disabled:opacity-60"
                        style={{ background: "var(--builder-accent, #0284c7)", color: "#fff" }}
                      >
                        {restoring ? "Restoring…" : "Restore"}
                      </button>
                      <button
                        type="button"
                        data-testid="builder-checkpoint-restore-cancel"
                        disabled={restoring}
                        onClick={() => setConfirmingId(null)}
                        className="rounded px-2 py-1 text-[12px] disabled:opacity-60"
                        style={{ border: "1px solid var(--builder-border)" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1.5">
                    <button
                      type="button"
                      data-testid="builder-checkpoint-restore"
                      onClick={() => setConfirmingId(cp.id)}
                      className="rounded px-2 py-1 text-[12px]"
                      style={{ border: "1px solid var(--builder-border)" }}
                    >
                      Restore
                    </button>
                  </div>
                )}

                {restoreError && confirming ? (
                  <p
                    data-testid="builder-checkpoint-restore-error"
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
