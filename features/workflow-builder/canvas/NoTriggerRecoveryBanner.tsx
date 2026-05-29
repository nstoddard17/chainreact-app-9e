"use client";

interface Props {
  /**
   * Invoked when the user clicks the "Choose trigger" CTA.
   * WorkflowBuilder owns the wiring — the callback opens AddNodePanel
   * in trigger mode (the same callback the empty-state CTA uses).
   */
  onChooseTrigger?: () => void;
}

/**
 * Compact no-trigger recovery banner (Slice 4.BUILDER-TRIGGER-RECOVERY-1).
 *
 * Rendered by `WorkflowCanvas` when the workflow has one or more nodes
 * but NO trigger — the state a user lands in after deleting the trigger
 * while actions remain on the canvas. The full `EmptyCanvasState` card
 * is the wrong surface here (it reads "EMPTY · NO TRIGGER · NO ACTIONS"
 * and would imply the user lost their actions). This banner is a small
 * recovery prompt pinned near the top/start of the graph that does NOT
 * cover the existing action nodes.
 *
 * Behavior: presentational only. It does not read or mutate graph state
 * and does not decide WHEN to render — the canvas owns that (it shows
 * this only when `pendingNodes.length > 0 && !hasTrigger`). The CTA just
 * fires the supplied callback, mirroring `EmptyCanvasState`'s contract
 * (safe to click with no handler).
 */
export function NoTriggerRecoveryBanner({ onChooseTrigger }: Props) {
  return (
    <div
      data-testid="no-trigger-recovery-banner"
      aria-label="Workflow is missing a trigger"
      role="status"
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-3"
    >
      <div
        className="pointer-events-auto flex w-full max-w-[520px] items-center gap-3 rounded-[8px] px-3.5 py-2.5"
        style={{
          background: "var(--builder-panel)",
          border: "1px solid var(--builder-warning, var(--builder-border))",
          boxShadow: "var(--builder-shadow-md)",
        }}
      >
        <WarnIcon />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p
            className="text-[13px] font-semibold"
            style={{ color: "var(--builder-text)" }}
          >
            Add a trigger
          </p>
          <p
            className="text-[11.5px] leading-snug"
            style={{ color: "var(--builder-muted)" }}
          >
            This workflow needs a trigger before it can run. Your actions are
            still here — just pick the event that should start them.
          </p>
        </div>
        <button
          type="button"
          onClick={onChooseTrigger}
          data-testid="recovery-choose-trigger"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] font-medium"
          style={{
            background: "var(--builder-accent)",
            color: "white",
            border: "1px solid var(--builder-accent)",
          }}
        >
          <BoltIcon />
          Choose trigger
        </button>
      </div>
    </div>
  );
}

const WarnIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    className="shrink-0"
    style={{ color: "var(--builder-warning, var(--builder-muted))" }}
  >
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const BoltIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
  </svg>
);
