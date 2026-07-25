"use client";

/**
 * Above-canvas action bar for the workflow builder (extracted from
 * `WorkflowCanvas` in Slice 4.BUILDER-SHELL-TABS-1 to keep that file under the
 * line cap). Owns the env / trigger / node-count tags and the "+ Add action"
 * CTA. Pure presentational — all behavior comes in via props.
 *
 * BUILDER-TABS-HEADER-1: the top tab segment (Builder | Runs | Data Map |
 * History | Settings) moved OUT of this bar into the header-level
 * `layout/BuilderTabStrip.tsx` so the Document view has the same tabs. This
 * bar is now canvas-only chrome (tags + Add action).
 */
export function CanvasActionBar({
  nodeCountText,
  triggerTagText,
  onAddAction,
  canAddAction,
  addActionBlockedReason,
}: {
  nodeCountText: string;
  triggerTagText?: string;
  onAddAction?: () => void;
  canAddAction?: boolean;
  addActionBlockedReason?: "no-trigger" | "multiple-tails";
}) {
  return (
    <div
      data-testid="canvas-action-bar"
      className="flex h-9 shrink-0 items-center justify-between gap-2 px-2.5"
      style={{
        background: "var(--builder-panel)",
        borderBottom: "1px solid var(--builder-border)",
      }}
    >
      <div className="hidden items-center gap-1 md:flex">
        <Tag text="env: draft" />
        {triggerTagText ? <Tag text={triggerTagText} /> : null}
        <Tag text={nodeCountText} />
      </div>
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

function Tag({ text }: { text: string }) {
  return (
    <span
      className="builder-mono rounded-[3px] px-1.5 py-0.5 text-[10.5px]"
      style={{
        background: "var(--builder-bg)",
        border: "1px solid var(--builder-border)",
        color: "var(--builder-muted)",
      }}
    >
      {text}
    </span>
  );
}
