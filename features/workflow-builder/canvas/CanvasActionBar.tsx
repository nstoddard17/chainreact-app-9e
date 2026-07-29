"use client";

/**
 * Above-canvas action bar for the workflow builder (extracted from
 * `WorkflowCanvas` in Slice 4.BUILDER-SHELL-TABS-1 to keep that file under the
 * line cap). Owns the "+ Add action" CTA. Pure presentational — all behavior
 * comes in via props.
 *
 * BUILDER-TABS-HEADER-1: the top tab segment (Builder | Runs | Data Map |
 * History | Settings) moved OUT of this bar into the header-level
 * `layout/BuilderTabStrip.tsx`. BUILDER-CANVAS-CHROME-TRIM-1: the left
 * env/trigger/node-count tag cluster was removed too — it restated what the
 * canvas already shows (the state chip lives in the header, the node cards ARE
 * the counts), so the bar is now just the right-aligned Add action CTA.
 */
export function CanvasActionBar({
  onAddAction,
  canAddAction,
  addActionBlockedReason,
}: {
  onAddAction?: () => void;
  canAddAction?: boolean;
  addActionBlockedReason?: "no-trigger" | "multiple-tails";
}) {
  return (
    <div
      data-testid="canvas-action-bar"
      className="flex h-9 shrink-0 items-center justify-end gap-2 px-2.5"
      style={{
        background: "var(--builder-panel)",
        borderBottom: "1px solid var(--builder-border)",
      }}
    >
      <div className="flex items-center gap-1.5">
        {onAddAction ? (
          <button
            type="button"
            onClick={onAddAction}
            disabled={canAddAction === false}
            data-testid="canvas-add-action-button"
            title={
              addActionBlockedReason === "no-trigger"
                ? "Add a trigger before adding actions."
                : addActionBlockedReason === "multiple-tails"
                  ? "This workflow has multiple branch ends. Use the + on the step you want to extend."
                  : "Add an action to the end of the workflow"
            }
            className="inline-flex h-6 items-center gap-1.5 rounded-[4px] px-2 text-[11.5px] font-medium disabled:opacity-50"
            style={{
              background: "var(--builder-accent)",
              border: "1px solid var(--builder-accent)",
              color: "white",
            }}
          >
            + Add action
          </button>
        ) : null}
      </div>
    </div>
  );
}
