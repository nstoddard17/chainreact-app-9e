"use client";

import type { ReactNode } from "react";
import type { DocumentBlock, DocumentForkBlock as ForkModel } from "./projection";

/**
 * Read-only fork rendering (5.DUAL-BUILDER-1 / CS-1): condition header +
 * vertically stacked labeled lanes (design direction: "linear steps stay as
 * calm words; a branch becomes a compact visual — never a wide node canvas").
 * Nested forks render inside their lane via `renderBlocks` (injected by
 * DocumentView so this file stays cycle-free).
 */
export function DocumentForkBlock({
  block,
  renderBlocks,
}: {
  block: ForkModel;
  renderBlocks: (blocks: readonly DocumentBlock[]) => ReactNode;
}) {
  return (
    <div
      data-testid={`document-fork-${block.nodeId}`}
      data-node-id={block.nodeId}
      className="my-2 overflow-hidden rounded-xl"
      style={{ border: "1px solid var(--builder-border)", background: "var(--builder-panel)" }}
    >
      <div
        className="flex flex-wrap items-center gap-2 px-4 py-2.5"
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
          <span
            key={chip.name}
            data-testid={`document-blank-chip-${block.nodeId}-${chip.name}`}
            className="inline-flex items-center rounded-md px-2 py-0.5 text-[11.5px] font-medium"
            style={{
              background: "var(--builder-accent-soft)",
              color: "var(--builder-accent)",
              border: "1.5px dashed var(--builder-accent)",
            }}
          >
            {chip.label}?
          </span>
        ))}
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
          {lane.blocks.length > 0 ? (
            <div className="pl-1">{renderBlocks(lane.blocks)}</div>
          ) : (
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
