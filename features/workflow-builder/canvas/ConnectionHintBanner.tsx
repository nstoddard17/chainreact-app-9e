"use client";

interface Props {
  /** The hint text to show, or null to render nothing. */
  message: string | null;
  /** Dismiss callback (the × button). */
  onDismiss?: () => void;
}

/**
 * Transient connection-feedback banner (BUILDER-CANVAS-CONNECTION-UX-AUDIT-1).
 *
 * Rendered by `WorkflowCanvas` when the user attempts an INVALID connection
 * (self-loop, or an edge that already exists). Before this, `connectNodes`
 * rejected the attempt silently — the canvas snapped back with no explanation.
 * Now the rejection reason (the `connectNodes` error message — the single
 * source of validation truth) surfaces as a small, auto-dismissing hint.
 *
 * Presentational only: it does NOT validate or mutate graph state and does not
 * decide WHEN to show — the canvas owns that. Mirrors `NoTriggerRecoveryBanner`'s
 * contract (safe to render with no `onDismiss`). Pinned bottom-center so it never
 * collides with the top-pinned no-trigger recovery banner. `role="status"` +
 * `aria-live="polite"` so the message is announced without stealing focus.
 */
export function ConnectionHintBanner({ message, onDismiss }: Props) {
  if (!message) return null;
  return (
    <div
      data-testid="connection-hint"
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3"
    >
      <div
        className="pointer-events-auto flex max-w-[460px] items-center gap-2.5 rounded-[8px] px-3.5 py-2"
        style={{
          background: "var(--builder-panel)",
          border: "1px solid var(--builder-warn)",
          boxShadow: "var(--builder-shadow-md)",
        }}
      >
        <WarnIcon />
        <p
          className="min-w-0 flex-1 text-[12px] leading-snug"
          style={{ color: "var(--builder-text)" }}
        >
          {message}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          data-testid="connection-hint-dismiss"
          className="shrink-0 rounded-[3px] px-1 text-[14px] leading-none"
          style={{ color: "var(--builder-muted)" }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

const WarnIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    className="shrink-0"
    style={{ color: "var(--builder-warn)" }}
  >
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
