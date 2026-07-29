"use client";

interface Props {
  /**
   * Invoked when the user clicks the "Choose a trigger" CTA.
   * WorkflowBuilder owns the wiring — the callback opens AddNodePanel
   * in trigger mode.
   */
  onAddTrigger?: () => void;
  /**
   * BUILDER-EMPTY-STATE-TEMPLATES-1 — opens the in-builder templates modal
   * (the same create-new / replace-current flow as the header's Templates
   * button). Absent (logged-out local-only builder) → the button renders
   * disabled with an honest note, never a dead click.
   */
  onImportTemplate?: () => void;
}

/**
 * Empty workflow canvas state (Slice 4.BUILDER-CANVAS-1, restyled in
 * 4.BUILDER-DESIGN-PARITY-1).
 *
 * Adopts the Anthropic ChainV2 empty card aesthetic — diagonal-rule
 * frame strip across the top, mono uppercase tag ("EMPTY · NO TRIGGER
 * · NO ACTIONS"), large title, subtitle with the ⌘K hint, and an
 * action row with the primary "Choose a trigger" CTA plus "Import from
 * template", which opens the in-builder templates modal when the builder
 * provides the callback (disabled with an honest note on the logged-out
 * local-only builder). The old "Describe to AI" placeholder was removed —
 * the React Agent rail IS that entry point.
 *
 * "Recent triggers" list is deferred — V2 doesn't surface per-workspace
 * recency yet (see slice doc §Deferred).
 */
export function EmptyCanvasState({ onAddTrigger, onImportTemplate }: Props) {
  return (
    <div
      data-testid="empty-canvas-state"
      aria-label="Empty workflow canvas"
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6"
    >
      <div
        className="pointer-events-auto w-full max-w-[560px] overflow-hidden rounded-[8px]"
        style={{
          background: "var(--builder-panel)",
          border: "1px solid var(--builder-border)",
          boxShadow: "var(--builder-shadow-md)",
        }}
      >
        <div
          aria-hidden
          className="h-[22px]"
          style={{
            background:
              "repeating-linear-gradient(-45deg, var(--builder-panel-2) 0 6px, transparent 6px 12px)",
            borderBottom: "1px solid var(--builder-border)",
          }}
        />
        <div className="px-5 pb-4 pt-5">
          <div
            className="builder-mono mb-2 text-[10px] tracking-[0.12em]"
            style={{ color: "var(--builder-muted)" }}
          >
            EMPTY · NO TRIGGER · NO ACTIONS
          </div>
          <h3
            className="mb-1 text-[18px] font-semibold"
            style={{ color: "var(--builder-text)" }}
          >
            Choose a trigger to start.
          </h3>
          <p
            className="mb-4 max-w-[460px] text-[12.5px] leading-relaxed"
            style={{ color: "var(--builder-muted)" }}
          >
            Every workflow begins with a trigger — an event that wakes it up.
            Pick one from the picker, or describe what you want in the React
            Agent rail.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onAddTrigger}
              data-testid="empty-canvas-choose-trigger"
              className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] font-medium"
              style={{
                background: "var(--builder-accent)",
                color: "white",
                border: "1px solid var(--builder-accent)",
              }}
            >
              <BoltIcon />
              Choose a trigger
            </button>
            <button
              type="button"
              data-testid="empty-canvas-import-template"
              disabled={!onImportTemplate}
              {...(onImportTemplate ? { onClick: onImportTemplate } : {})}
              title={
                onImportTemplate
                  ? "Browse templates and start from one"
                  : "Sign in to browse templates"
              }
              className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: "var(--builder-panel)",
                color: "var(--builder-text-2)",
                border: "1px solid var(--builder-border)",
              }}
            >
              <CodeIcon />
              Import from template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
const CodeIcon = () => (
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
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);
