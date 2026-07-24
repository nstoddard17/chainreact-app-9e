"use client";

import { useRef, useState } from "react";
import type { DocumentBlock } from "./documentModel";
import type { DocumentPreviewModel, PreviewNodeStatus } from "./documentPreviewProjection";
import { DestructiveApplyConfirm } from "../panels/DestructiveApplyConfirm";
import {
  describeDestructiveRemoval,
  type DestructivePreviewClassification,
} from "@/core/workflows/destructivePreview";

/**
 * Document Builder — React-Agent ghost PREVIEW (5.DUAL-BUILDER-1 / CS-6).
 *
 * Read-only render of a proposal as ghost Document content. Rendering this
 * NEVER mutates graphSlice, never marks dirty, never saves — the proposal is
 * carried by `useBuilderPreview`'s overlay state; only the explicit Apply
 * (`onApply` → canonical `applyAdditivePatch` / `replaceGraphLocal`) makes it
 * real. Additions show as ghost steps; a full edit proposal shows added /
 * changed / removed tracked-change treatment; a graph the projection can't read
 * as prose hands off to the Visual Builder. Presentational only.
 */
const STATUS_LABEL: Record<PreviewNodeStatus, string> = {
  added: "New",
  modified: "Changed",
  unchanged: "",
};
const STATUS_COLOR: Record<PreviewNodeStatus, string> = {
  added: "var(--builder-accent)",
  modified: "#b8860b",
  unchanged: "var(--builder-muted)",
};

export function DocumentPreview({
  model,
  onApply,
  onDiscard,
  onOpenInVisual,
  destructive,
}: {
  model: DocumentPreviewModel;
  onApply: () => void;
  onDiscard: () => void;
  onOpenInVisual?: (() => void) | undefined;
  /**
   * DOC-FINAL-ACCEPTANCE-1 — the shared destructive classification for this
   * proposal (from `classifyDestructivePreview`, owned by WorkflowBuilder). When
   * `isDestructive`, the primary Apply names the consequence and routes through
   * the shared confirmation before the governed apply. Absent / non-destructive
   * ⇒ the normal one-click Apply, unchanged.
   */
  destructive?: DestructivePreviewClassification | null | undefined;
}) {
  const isDestructive = destructive?.isDestructive === true;
  // Inline confirmation gate for a destructive apply. Session-only UI state;
  // never a store, never mutates. Cancel returns focus to the Apply control.
  const [confirming, setConfirming] = useState(false);
  const applyRef = useRef<HTMLButtonElement | null>(null);
  const removalLine = isDestructive && destructive ? describeDestructiveRemoval(destructive) : null;

  const handleApplyClick = () => {
    if (isDestructive) {
      setConfirming(true);
      return;
    }
    onApply();
  };

  return (
    <section
      data-testid="document-preview"
      data-preview-kind={model.kind}
      data-destructive={isDestructive ? "true" : "false"}
      aria-label="React proposal preview"
      className="my-3 overflow-hidden rounded-xl"
      style={
        isDestructive
          ? { border: "1.5px solid var(--builder-danger, #b91c1c)", background: "var(--builder-panel)" }
          : { border: "1.5px dashed var(--builder-accent)", background: "var(--builder-accent-soft)" }
      }
    >
      <div
        className="flex flex-wrap items-center gap-2 px-4 py-2.5"
        style={{
          borderBottom: isDestructive
            ? "1px solid var(--builder-danger, #b91c1c)"
            : "1px dashed var(--builder-accent)",
        }}
      >
        <span
          className="builder-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: isDestructive ? "var(--builder-danger, #b91c1c)" : "var(--builder-accent)" }}
        >
          {isDestructive ? "React proposes a removal" : "React proposes"}
        </span>
        <span className="text-[13px] font-semibold" style={{ color: "var(--builder-text)" }}>
          {model.title}
        </span>
        <span
          data-testid="document-preview-notice"
          className="ml-auto text-[11px]"
          style={{ color: "var(--builder-muted)" }}
        >
          Preview only — your workflow has not changed.
        </span>
      </div>

      <div className="px-4 py-3">
        {model.summary ? (
          <p className="m-0 mb-2 text-[12.5px]" style={{ color: "var(--builder-text-2)" }}>
            {model.summary}
          </p>
        ) : null}

        {model.needsVisualReview ? (
          <div data-testid="document-preview-visual-handoff" className="text-[12.5px]" style={{ color: "var(--builder-muted)" }}>
            This change is easier to review on the canvas.{" "}
            {onOpenInVisual ? (
              <button type="button" data-testid="document-preview-open-visual" onClick={onOpenInVisual} className="underline">
                Review on the Visual Builder
              </button>
            ) : null}
          </div>
        ) : model.kind === "additive" ? (
          <ol className="m-0 list-none space-y-1.5 p-0">
            {model.ghosts.map((g) => (
              <li
                key={g.previewId}
                data-testid={`document-preview-ghost-${g.previewId}`}
                data-preview-id={g.previewId}
                className="rounded-lg px-3 py-1.5 text-[13px]"
                style={{ background: "var(--builder-panel)", border: "1px solid var(--builder-border)", color: "var(--builder-text)" }}
              >
                <span className="font-medium">{g.purpose || g.title}</span>
                {g.missingInputs.length > 0 ? (
                  <span className="ml-2 text-[11px]" style={{ color: "var(--builder-muted)" }}>
                    · needs {g.missingInputs.join(", ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <EditProposal model={model} />
        )}

        {isDestructive && removalLine ? (
          <p
            data-testid="document-preview-destructive-note"
            className="mt-2 mb-0 text-[12px] font-medium"
            style={{ color: "var(--builder-danger, #b91c1c)" }}
          >
            {removalLine} Review before applying.
          </p>
        ) : null}

        {confirming && destructive ? (
          <div className="mt-3">
            <DestructiveApplyConfirm
              testIdPrefix="document-preview-destructive"
              classification={destructive}
              onCancel={() => {
                setConfirming(false);
                // Return focus to the Apply control (the opener) after Cancel.
                applyRef.current?.focus();
              }}
              onConfirm={() => {
                setConfirming(false);
                onApply();
              }}
            />
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <button
              ref={applyRef}
              type="button"
              data-testid="document-preview-apply"
              data-destructive={isDestructive ? "true" : "false"}
              onClick={handleApplyClick}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-3.5 text-[12.5px] font-semibold"
              style={
                isDestructive
                  ? { background: "var(--builder-danger, #b91c1c)", color: "#fff" }
                  : { background: "var(--builder-text)", color: "var(--builder-panel)" }
              }
            >
              {isDestructive ? (
                <>
                  <span aria-hidden>⚠</span>
                  Apply removal
                </>
              ) : (
                "Apply to draft"
              )}
            </button>
            <button
              type="button"
              data-testid="document-preview-reject"
              onClick={onDiscard}
              className="inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-medium"
              style={{ color: "var(--builder-muted)", border: "1px solid var(--builder-border)" }}
            >
              Reject
            </button>
            {onOpenInVisual ? (
              <button
                type="button"
                data-testid="document-preview-review-visual"
                onClick={onOpenInVisual}
                className="ml-auto text-[11.5px] underline"
                style={{ color: "var(--builder-muted)" }}
              >
                Open in Visual Builder
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

/** Compact tracked-change list for a full edit proposal. */
function EditProposal({ model }: { model: DocumentPreviewModel }) {
  const rows: Array<{ key: string; text: string; status: PreviewNodeStatus | "removed" }> = [];
  const label = (b: DocumentBlock): string => {
    if (b.kind === "sentence") return b.title;
    if (b.kind === "fork") return `Split — ${b.conditionSummary}`;
    return "A part best reviewed on the canvas";
  };
  const idOf = (b: DocumentBlock): string | null =>
    b.kind === "sentence" || b.kind === "fork" ? b.nodeId : (b.nodeIds[0] ?? null);
  for (const b of model.proposedModel?.blocks ?? []) {
    const id = idOf(b);
    const status = (id ? model.statusByNodeId.get(id) : undefined) ?? "unchanged";
    rows.push({ key: id ?? label(b), text: label(b), status });
  }
  for (const r of model.removed) rows.push({ key: `rm-${r.nodeId}`, text: r.title, status: "removed" });

  return (
    <ul className="m-0 list-none space-y-1.5 p-0" data-testid="document-preview-edit">
      {rows.map((row) => (
        <li
          key={row.key}
          data-testid={`document-preview-row-${row.key}`}
          data-status={row.status}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px]"
          style={{ background: "var(--builder-panel)", border: "1px solid var(--builder-border)" }}
        >
          <span
            className={row.status === "removed" ? "line-through" : ""}
            style={{ color: row.status === "removed" ? "var(--builder-muted)" : "var(--builder-text)" }}
          >
            {row.text}
          </span>
          {row.status === "removed" ? (
            <span className="ml-auto text-[10.5px] font-semibold uppercase" style={{ color: "#b4342e" }}>
              Removed
            </span>
          ) : STATUS_LABEL[row.status] ? (
            <span
              className="ml-auto text-[10.5px] font-semibold uppercase"
              style={{ color: STATUS_COLOR[row.status] }}
            >
              {STATUS_LABEL[row.status]}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
