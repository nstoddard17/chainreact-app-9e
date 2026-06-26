"use client";

/**
 * Per-diff-status visual treatment + pill for a preview node card (HERMES-AGENT-PREVIEW-DIFF-GRAPH).
 * `added` (green/solid), `changed` (amber/solid), `removed` (red/dashed). `unchanged` renders normally
 * (no entry here). Extracted from {@link WorkflowNodeCard} to keep that file focused.
 */
export interface DiffVisual {
  readonly rail: string;
  readonly border: string;
  readonly borderStyle: "solid" | "dashed";
  readonly shadow: string;
  readonly pillText: string;
  readonly pillBg: string;
  readonly pillFg: string;
  readonly pillBorder: string;
}

export const DIFF_VISUAL: Record<"added" | "removed" | "changed", DiffVisual> = {
  added: {
    rail: "var(--builder-success)",
    border: "var(--builder-success)",
    borderStyle: "solid",
    shadow: "0 0 0 2px var(--builder-success-soft), var(--builder-shadow-sm)",
    pillText: "Added",
    pillBg: "var(--builder-success-soft)",
    pillFg: "var(--builder-success)",
    pillBorder: "var(--builder-success)",
  },
  changed: {
    rail: "var(--builder-warn)",
    border: "var(--builder-warn)",
    borderStyle: "solid",
    shadow: "0 0 0 2px var(--builder-warn-soft), var(--builder-shadow-sm)",
    pillText: "Changed",
    pillBg: "var(--builder-warn-soft)",
    pillFg: "var(--builder-warn)",
    pillBorder: "var(--builder-warn)",
  },
  removed: {
    rail: "var(--builder-danger)",
    border: "var(--builder-danger)",
    borderStyle: "dashed",
    shadow: "none",
    pillText: "Removing",
    pillBg: "var(--builder-danger-soft)",
    pillFg: "var(--builder-danger)",
    pillBorder: "var(--builder-danger)",
  },
};

export function DiffPill({ diff }: { diff: DiffVisual }) {
  return (
    <span
      data-testid="node-diff-pill"
      className="builder-mono inline-flex items-center rounded-[3px] px-1.5 text-[9px] font-semibold uppercase tracking-[0.05em]"
      style={{ background: diff.pillBg, color: diff.pillFg, border: `1px solid ${diff.pillBorder}`, lineHeight: 1.5 }}
    >
      {diff.pillText}
    </span>
  );
}
