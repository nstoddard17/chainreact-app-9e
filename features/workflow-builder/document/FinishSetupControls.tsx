"use client";

import type { FinishSetupQueueApi } from "./useFinishSetupQueue";

/**
 * 5.DUAL-BUILDER-1 CS-3 — the Finish Setup queue control bar.
 *
 * A compact, non-modal toolbar shown while the opt-in queue is active: it
 * orients the user (progress "N of M" + branch/lane breadcrumb of the active
 * item) and offers Previous / Skip / Next / Exit. The item's actual editing
 * happens in the REAL CS-2 Guided Stop (rendered inline under its sentence) —
 * this bar never edits a field itself. "Done" lives on the Guided Stop; a
 * committed field advances the queue automatically.
 *
 * It is deliberately NOT a forced wizard: Exit returns to normal Document
 * editing at any time, Skip is session-only, and the Document stays fully
 * usable underneath.
 */
export function FinishSetupControls({ queue }: { queue: FinishSetupQueueApi }) {
  if (!queue.active) return null;

  const { activeItem, activeIndex, total, completed } = queue;

  return (
    <div
      data-testid="document-setup-controls"
      role="region"
      aria-label="Finish setup"
      className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-2.5"
      style={{
        background: "var(--builder-panel)",
        border: "1.5px solid var(--builder-accent)",
        boxShadow: "0 10px 26px -16px rgba(0,0,0,.35)",
      }}
    >
      <span
        className="builder-mono text-[10.5px] font-semibold uppercase tracking-[0.1em]"
        style={{ color: "var(--builder-accent)" }}
        data-testid="document-setup-progress"
      >
        {completed || !activeItem
          ? `${total} of ${total} · done`
          : `Step ${activeIndex} of ${total}`}
      </span>

      {activeItem && activeItem.crumbs.length > 0 ? (
        <span
          data-testid="document-setup-breadcrumb"
          className="min-w-0 truncate text-[12px]"
          style={{ color: "var(--builder-muted)" }}
          title={activeItem.crumbs.join(" › ")}
        >
          {activeItem.crumbs.join(" › ")}
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-1.5">
        {activeItem && !queue.editing ? (
          <button
            type="button"
            data-testid="document-setup-resume"
            onClick={queue.resume}
            className="inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium"
            style={{
              background: "var(--builder-panel-2)",
              color: "var(--builder-text)",
              border: "1px solid var(--builder-border)",
            }}
          >
            Continue editing
          </button>
        ) : null}
        <button
          type="button"
          data-testid="document-setup-prev"
          onClick={queue.prev}
          disabled={activeIndex <= 1}
          className="inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium disabled:opacity-40"
          style={{ color: "var(--builder-muted)" }}
        >
          Previous
        </button>
        <button
          type="button"
          data-testid="document-setup-skip"
          onClick={queue.skip}
          disabled={!activeItem}
          className="inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium disabled:opacity-40"
          style={{ color: "var(--builder-muted)" }}
        >
          Skip for now
        </button>
        <button
          type="button"
          data-testid="document-setup-next"
          onClick={queue.next}
          disabled={!activeItem || activeIndex >= total}
          className="inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium disabled:opacity-40"
          style={{ color: "var(--builder-muted)" }}
        >
          Next
        </button>
        <button
          type="button"
          data-testid="document-setup-exit"
          onClick={queue.exit}
          className="inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-semibold"
          style={{
            background: "var(--builder-panel-2)",
            color: "var(--builder-text)",
            border: "1px solid var(--builder-border)",
          }}
        >
          Exit setup
        </button>
      </div>
    </div>
  );
}
