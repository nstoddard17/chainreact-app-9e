"use client";

import type { ReactNode } from "react";
import type { DocumentBlock, DocumentForkBlock as ForkModel } from "./projection";

/**
 * Fork rendering (5.DUAL-BUILDER-1 CS-1; CS-2 adds interactivity + wiring
 * warnings): condition header + vertically stacked labeled lanes (design
 * direction: "linear steps stay as calm words; a branch becomes a compact
 * visual — never a wide node canvas"). Nested forks render inside their lane
 * via `renderBlocks` (injected by DocumentView so this file stays cycle-free).
 *
 * CS-2 — a lane whose wiring is broken renders a plain-language WARNING ROW
 * (shared `missing_branch_edge`/`stale_branch_edge` findings) instead of the
 * whole fork collapsing to a complex region. Structural repair stays a
 * Visual-Builder job (`onOpenInVisual`).
 */
export function DocumentForkBlock({
  block,
  renderBlocks,
  onEditField,
  onConfigureStep,
  onOpenInVisual,
  onInsertInLane,
  onAddToEmptyLane,
}: {
  block: ForkModel;
  renderBlocks: (blocks: readonly DocumentBlock[]) => ReactNode;
  onEditField?: ((nodeId: string, fieldName: string) => void) | undefined;
  onConfigureStep?: ((nodeId: string) => void) | undefined;
  onOpenInVisual?: ((nodeId: string | null) => void) | undefined;
  /** CS-2B — add an ordinary action at the START of a healthy labeled lane. */
  onInsertInLane?:
    | ((laneInsert: NonNullable<ForkModel["lanes"][number]["laneInsert"]>) => void)
    | undefined;
  /** CS-5 — add the first step of an EMPTY (missing_branch_edge) labeled lane. */
  onAddToEmptyLane?: ((forkNodeId: string, label: string) => void) | undefined;
}) {
  return (
    <div
      data-testid={`document-fork-${block.nodeId}`}
      data-node-id={block.nodeId}
      className="my-2 overflow-hidden rounded-xl"
      style={{ border: "1px solid var(--builder-border)", background: "var(--builder-panel)" }}
    >
      <div
        className="group flex flex-wrap items-center gap-2 px-4 py-2.5"
        style={{
          background: "var(--builder-panel-2)",
          borderBottom: "1px solid var(--builder-border)",
        }}
      >
        <span
          className="builder-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: "var(--builder-muted)" }}
        >
          It splits
        </span>
        <span className="text-[13.5px] font-semibold" style={{ color: "var(--builder-text)" }}>
          {block.conditionSummary}
        </span>
        {block.blankChips.map((chip) => (
          <button
            key={chip.name}
            type="button"
            disabled={onEditField === undefined}
            data-testid={`document-blank-chip-${block.nodeId}-${chip.name}`}
            data-field-name={chip.name}
            onClick={() => onEditField?.(block.nodeId, chip.name)}
            className="inline-flex items-center rounded-md px-2 py-0.5 text-[11.5px] font-medium disabled:cursor-default"
            style={{
              background: "var(--builder-accent-soft)",
              color: "var(--builder-accent)",
              border: "1.5px dashed var(--builder-accent)",
            }}
          >
            {chip.label}?
          </button>
        ))}
        {onConfigureStep ? (
          <button
            type="button"
            data-testid={`document-configure-step-${block.nodeId}`}
            onClick={() => onConfigureStep(block.nodeId)}
            className="ml-auto inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
            style={{ color: "var(--builder-muted)", border: "1px solid var(--builder-border)" }}
            title="Everything this split does, in one place"
          >
            ⚙ Configure step
          </button>
        ) : null}
      </div>
      {block.lanes.map((lane, i) => (
        <div
          key={`${lane.kindHint}-${lane.label}-${i}`}
          data-testid={`document-fork-lane-${block.nodeId}-${lane.kindHint === "always" ? "always" : lane.label}`}
          className="px-4 py-3"
          style={i > 0 ? { borderTop: "1px solid var(--builder-border)" } : undefined}
        >
          <div className="mb-1 flex items-center gap-2">
            <span
              className="builder-mono inline-flex items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]"
              style={{
                background:
                  lane.kindHint === "always"
                    ? "var(--builder-panel-2)"
                    : "var(--builder-accent-soft)",
                color:
                  lane.kindHint === "always" ? "var(--builder-muted)" : "var(--builder-accent)",
                border: "1px solid var(--builder-border)",
              }}
            >
              ● {lane.title}
            </span>
            {lane.subtitle ? (
              <span className="text-[12px]" style={{ color: "var(--builder-muted)" }}>
                {lane.subtitle}
              </span>
            ) : null}
          </div>
          {lane.warning ? (
            <div
              data-testid={`document-lane-warning-${block.nodeId}-${lane.label || "always"}`}
              data-warning-code={lane.warning.code}
              className="mb-1.5 flex flex-wrap items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-medium"
              style={{
                background: "var(--builder-accent-soft)",
                color: "var(--builder-accent)",
                border: "1.5px dashed var(--builder-accent)",
              }}
            >
              <span className="min-w-0 flex-1">
                {lane.warning.code === "missing_branch_edge"
                  ? "This path needs a next step. "
                  : "This path no longer matches the current routes. "}
                <span className="font-normal">{lane.warning.message}</span>
              </span>
              {/* CS-5 — a MISSING lane (returnable route, no destination) can get
                  its first step in-place; a STALE lane (dead route) is a
                  Visual-Builder repair job only. */}
              {onAddToEmptyLane && lane.warning.code === "missing_branch_edge" && lane.kindHint === "labeled" ? (
                <button
                  type="button"
                  data-testid={`document-lane-add-step-${block.nodeId}-${lane.label}`}
                  data-route-label={lane.label}
                  onClick={() => onAddToEmptyLane(block.nodeId, lane.label)}
                  className="inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[11.5px] font-medium"
                  style={{
                    background: "var(--builder-panel)",
                    color: "var(--builder-text)",
                    border: "1px solid var(--builder-border)",
                  }}
                >
                  ＋ Add a step
                </button>
              ) : null}
              {onOpenInVisual ? (
                <button
                  type="button"
                  data-testid={`document-lane-warning-fix-${block.nodeId}-${lane.label || "always"}`}
                  onClick={() => onOpenInVisual(block.nodeId)}
                  className="inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[11.5px] font-medium"
                  style={{
                    background: "var(--builder-panel)",
                    color: "var(--builder-text)",
                    border: "1px solid var(--builder-border)",
                  }}
                >
                  Open in Visual Builder
                </button>
              ) : null}
            </div>
          ) : null}
          {/* CS-2B — insertion affordance at the START of an editable lane,
              between the lane label and its first action. Rendered only when
              the projection proved the lane's entry edge unambiguous. */}
          {onInsertInLane && lane.laneInsert ? (
            <div className="group/lane-ins mb-1 pl-1">
              <button
                type="button"
                data-testid={`document-lane-insert-${block.nodeId}-${lane.label}`}
                data-edge-id={lane.laneInsert.edgeId}
                onClick={() => onInsertInLane(lane.laneInsert!)}
                className="inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium opacity-0 transition-opacity focus:opacity-100 group-hover/lane-ins:opacity-100 motion-reduce:transition-none"
                style={{
                  color: "var(--builder-muted)",
                  border: "1.5px dashed var(--builder-border)",
                }}
                title={`Add a step at the start of the "${lane.title}" path`}
              >
                ＋ Add a step here
              </button>
            </div>
          ) : null}
          {lane.blocks.length > 0 ? (
            <div className="pl-1">{renderBlocks(lane.blocks)}</div>
          ) : lane.warning ? null : (
            <p className="m-0 pl-1 text-[12.5px]" style={{ color: "var(--builder-muted)" }}>
              Continues below.
            </p>
          )}
          {lane.terminal ? (
            <p
              data-testid={`document-lane-terminal-${block.nodeId}-${lane.kindHint === "always" ? "always" : lane.label}`}
              className="m-0 mt-1.5 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium"
              style={{
                background: "var(--builder-panel-2)",
                color: "var(--builder-muted)",
                border: "1px solid var(--builder-border)",
              }}
            >
              ⏹ Ends here — nothing else runs on this path.
            </p>
          ) : null}
        </div>
      ))}
      {block.rejoinNodeId ? (
        <div
          className="builder-mono px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
          style={{
            background: "var(--builder-panel-2)",
            borderTop: "1px dashed var(--builder-border)",
            color: "var(--builder-muted)",
          }}
        >
          Then the paths come back together ↓
        </div>
      ) : null}
    </div>
  );
}
