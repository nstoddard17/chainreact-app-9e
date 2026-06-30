"use client";

import type { BuilderTab } from "./BuilderTabPlaceholder";

/**
 * Above-canvas action bar for the workflow builder (extracted from
 * `WorkflowCanvas` in Slice 4.BUILDER-SHELL-TABS-1 to keep that file under the
 * line cap). Owns the top tab segment (Builder | Runs | Data Map | Settings),
 * the env / trigger / node-count tags, and the "+ Add action" CTA. Pure
 * presentational — all behavior comes in via props.
 */

const BUILDER_TABS: readonly { readonly id: BuilderTab; readonly label: string }[] = [
  { id: "builder", label: "Builder" },
  { id: "runs", label: "Runs" },
  { id: "data-map", label: "Data Map" },
  { id: "history", label: "History" },
  { id: "settings", label: "Settings" },
];

export function CanvasActionBar({
  nodeCountText,
  triggerTagText,
  onAddAction,
  canAddAction,
  addActionBlockedReason,
  activeTab,
  onSelectTab,
}: {
  nodeCountText: string;
  triggerTagText?: string;
  onAddAction?: () => void;
  canAddAction?: boolean;
  addActionBlockedReason?: "no-trigger" | "multiple-tails";
  activeTab: BuilderTab;
  onSelectTab: (tab: BuilderTab) => void;
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
      <div
        className="flex items-center gap-0.5 rounded-md p-0.5"
        role="tablist"
        style={{
          background: "var(--builder-panel-2)",
          border: "1px solid var(--builder-border)",
        }}
      >
        {BUILDER_TABS.map((t) => (
          <CanvasTab
            key={t.id}
            label={t.label}
            active={activeTab === t.id}
            onSelect={() => onSelectTab(t.id)}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <div className="hidden items-center gap-1 md:flex">
          <Tag text="env: draft" />
          {triggerTagText ? <Tag text={triggerTagText} /> : null}
          <Tag text={nodeCountText} />
        </div>
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

function CanvasTab({
  label,
  active,
  onSelect,
}: {
  label: string;
  active?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active ? "true" : "false"}
      onClick={onSelect}
      className="builder-mono inline-flex h-[22px] items-center rounded-[3px] px-2 text-[11.5px] transition-colors"
      style={{
        background: active ? "var(--builder-panel)" : "transparent",
        boxShadow: active ? "var(--builder-shadow-sm)" : undefined,
        color: active ? "var(--builder-text)" : "var(--builder-muted)",
        border: "0",
      }}
    >
      {label}
    </button>
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
