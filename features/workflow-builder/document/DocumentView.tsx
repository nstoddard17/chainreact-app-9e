"use client";

import { useMemo, type ReactNode } from "react";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";
import { useGraphSlice } from "../state/graphSlice";
import { DocumentComplexRegion } from "./DocumentComplexRegion";
import { DocumentForkBlock } from "./DocumentForkBlock";
import { DocumentSentence } from "./DocumentSentence";
import {
  projectDefinitionToDocument,
  type DocumentBlock,
  type DocumentModel,
} from "./projection";

/**
 * Read-only Document Builder surface (5.DUAL-BUILDER-1 / CS-1).
 *
 * TWO EDITORS, ONE WORKFLOW: this view subscribes DIRECTLY to
 * `graphSlice.pendingNodes` / `pendingEdges` — the same canonical draft the
 * Visual Builder renders — and derives the `DocumentModel` on every store
 * change via the pure projection. There is NO second state container, NO
 * persistence of prose, and NO mutation of any kind in this slice (rendering
 * never touches dirty state, undo history, or config drafts).
 */
export function DocumentView({
  requiredFieldsByType,
  summaryFieldsByType,
  providerLabels,
  providerIcons,
  onOpenInVisual,
}: {
  requiredFieldsByType?: RequiredFieldsByType | undefined;
  summaryFieldsByType?: NodeSummaryFieldsByType | undefined;
  providerLabels?: Readonly<Record<string, string>> | undefined;
  providerIcons?: Readonly<Record<string, string>> | undefined;
  /** Visual-Builder handoff for complex regions (switch view + reveal node). */
  onOpenInVisual?: ((nodeId: string | null) => void) | undefined;
}) {
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);

  const model: DocumentModel = useMemo(
    () =>
      projectDefinitionToDocument({
        nodes: pendingNodes,
        edges: pendingEdges,
        requiredFieldsByType,
        summaryFieldsByType,
        providerLabels,
      }),
    [pendingNodes, pendingEdges, requiredFieldsByType, summaryFieldsByType, providerLabels],
  );

  const renderBlocks = (blocks: readonly DocumentBlock[]): ReactNode => {
    let actionOrdinal = 0;
    return blocks.map((block) => {
      if (block.kind === "sentence") {
        const marker = block.nodeKind === "trigger" ? "When" : String(++actionOrdinal);
        return (
          <DocumentSentence
            key={block.nodeId}
            block={block}
            marker={marker}
            providerIcon={providerIcons?.[block.providerId]}
          />
        );
      }
      if (block.kind === "fork") {
        return <DocumentForkBlock key={block.nodeId} block={block} renderBlocks={renderBlocks} />;
      }
      return (
        <DocumentComplexRegion
          key={`complex-${block.reason}-${block.nodeIds[0] ?? "empty"}`}
          block={block}
          onOpenInVisual={onOpenInVisual}
        />
      );
    });
  };

  return (
    <div
      data-testid="document-view"
      data-projection-tier={model.tier}
      className="min-h-0 flex-1 overflow-y-auto"
      style={{ background: "var(--builder-panel)" }}
      aria-label="Workflow document"
    >
      <div className="mx-auto max-w-[760px] px-8 py-6">
        <p
          data-testid="document-readonly-note"
          className="builder-mono m-0 mb-4 text-[10.5px] uppercase tracking-[0.12em]"
          style={{ color: "var(--builder-muted-2)" }}
        >
          Document view · read-only preview — switch to Visual to edit
        </p>
        {model.empty ? (
          <div
            data-testid="document-empty-state"
            className="rounded-xl px-5 py-8 text-center"
            style={{
              border: "1.5px dashed var(--builder-border)",
              color: "var(--builder-muted)",
            }}
          >
            <p className="m-0 text-[14px] font-medium" style={{ color: "var(--builder-text-2)" }}>
              Nothing here yet.
            </p>
            <p className="m-0 mt-1 text-[12.5px]">
              Switch to the Visual builder to add a trigger and steps — the Document reads the
              same workflow.
            </p>
          </div>
        ) : (
          renderBlocks(model.blocks)
        )}
      </div>
    </div>
  );
}
