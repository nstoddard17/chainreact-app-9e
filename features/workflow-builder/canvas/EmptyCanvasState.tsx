"use client";

interface Props {
  /**
   * Invoked when the user clicks the "Choose a trigger" CTA. The empty
   * state is purely presentational — it does NOT know how to add a
   * trigger itself. WorkflowBuilder owns the wiring: today the callback
   * focuses + clicks the "+ Add trigger" button in `AddNodeMenu`; once
   * BUILDER-ADD-FLOW-1 replaces that menu with `AddNodePanel`, the
   * callback will open the panel directly.
   *
   * Optional so the component is also testable in isolation without a
   * handler — the button stays clickable, the click just no-ops.
   */
  onAddTrigger?: () => void;
}

/**
 * Empty workflow canvas state (Slice 4.BUILDER-CANVAS-1).
 *
 * Rendered as an absolutely-positioned overlay inside the canvas
 * container when `pendingNodes.length === 0`. ReactFlow still mounts
 * underneath (so Background dots / Controls render normally); this
 * overlay just sits on top with a centered CTA.
 *
 * Notes:
 *   - `pointer-events-none` on the wrapper + `pointer-events-auto` on
 *     the inner card so the canvas itself stays interactive everywhere
 *     except the card region (drag-to-pan still works around the CTA).
 *   - No slice reads — this is a leaf presentational component.
 *   - Copy is intentionally workflow-product-generic; provider-specific
 *     wording is out of scope.
 */
export function EmptyCanvasState({ onAddTrigger }: Props) {
  return (
    <div
      data-testid="empty-canvas-state"
      aria-label="Empty workflow canvas"
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
    >
      <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-3 rounded-lg border border-dashed border-input bg-card/95 p-6 text-center shadow-sm">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M13 2L4.09 12.97a1 1 0 0 0 .76 1.65H11l-1 7.38L19.91 11.03a1 1 0 0 0-.76-1.65H13l1-7.38z" />
          </svg>
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold">Choose a trigger</h3>
          <p className="text-xs text-muted-foreground">
            Every workflow starts with a trigger. Pick the event that should
            kick this workflow off.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddTrigger}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          Choose a trigger
        </button>
      </div>
    </div>
  );
}
