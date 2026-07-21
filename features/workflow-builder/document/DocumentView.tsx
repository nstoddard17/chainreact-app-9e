"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";
import { useGraphSlice } from "../state/graphSlice";
import { DocumentComplexRegion } from "./DocumentComplexRegion";
import { DocumentForkBlock } from "./DocumentForkBlock";
import { DocumentSentence } from "./DocumentSentence";
import { GuidedStopEditor } from "./GuidedStopEditor";
import { FinishSetupBanner } from "./FinishSetupBanner";
import { FinishSetupControls } from "./FinishSetupControls";
import { WholeWorkflowMap } from "./WholeWorkflowMap";
import { useDocumentGuidedStop } from "./useDocumentGuidedStop";
import { useDocumentSetup, navRefusalCopy } from "./useDocumentSetup";
import type { WholeWorkflowMapRow } from "./wholeWorkflowMapModel";
import { resolveMapRowNavigation } from "./documentNavigation";
import {
  describeDocumentRefusal,
  openDocumentStepConfig,
  validateDocumentBranchLaneInsertion,
  validateDocumentEdgeInsertion,
  validateDocumentTailAdd,
} from "./documentCommands";
import {
  projectDefinitionToDocument,
  type DocumentBlock,
  type DocumentModel,
  type DocumentSentenceBlock,
} from "./projection";

/**
 * Document Builder surface (5.DUAL-BUILDER-1; editable in CS-2).
 *
 * TWO EDITORS, ONE WORKFLOW: this view subscribes DIRECTLY to
 * `graphSlice.pendingNodes` / `pendingEdges` — the same canonical draft the
 * Visual Builder renders — and derives the `DocumentModel` on every store
 * change via the pure projection. There is NO second state container and NO
 * prose persistence. CS-2 adds edits, all of which flow through the SHARED
 * stores: Guided Stops commit via the inspector's exact local-commit path,
 * add/insert delegate to the same picker + graphSlice actions the canvas
 * uses, and the workflow Save button remains the only persistence control.
 */
export function DocumentView({
  requiredFieldsByType,
  summaryFieldsByType,
  providerLabels,
  providerIcons,
  onOpenInVisual,
  onAppendAfter,
  onInsertAtEdge,
  onOpenStepInspector,
  onGuidedStopActive,
  notice,
  onNotice,
}: {
  requiredFieldsByType?: RequiredFieldsByType | undefined;
  summaryFieldsByType?: NodeSummaryFieldsByType | undefined;
  providerLabels?: Readonly<Record<string, string>> | undefined;
  providerIcons?: Readonly<Record<string, string>> | undefined;
  /** Visual-Builder handoff for complex regions / wiring repair. */
  onOpenInVisual?: ((nodeId: string | null) => void) | undefined;
  /** CS-2 — open the shared action picker appending after a linear tail. */
  onAppendAfter?: ((nodeId: string) => void) | undefined;
  /** CS-2 — open the shared action picker inserting at a linear edge. */
  onInsertAtEdge?: ((edgeId: string) => void) | undefined;
  /** CS-2 — open the existing full inspector (drawer) for a step. */
  onOpenStepInspector?: ((nodeId: string) => void) | undefined;
  /** CS-2 — which node's selection is Guided-Stop-driven (drawer suppression). */
  onGuidedStopActive?: ((nodeId: string | null) => void) | undefined;
  /** CS-2 — transient notice owned by WorkflowBuilder (e.g. branch-pick refusal). */
  notice?: string | null | undefined;
  onNotice?: ((text: string | null) => void) | undefined;
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

  const isDirty = useGraphSlice((s) => s.isDirty);

  const handleStopActive = useCallback(
    (nodeId: string | null) => onGuidedStopActive?.(nodeId),
    [onGuidedStopActive],
  );
  const { stop, openStop, commitStop, cancelStop, releaseStop } = useDocumentGuidedStop({
    onActiveChange: handleStopActive,
  });

  // 5.DUAL-BUILDER-1 CS-3 — Finish Setup queue + Whole Workflow map + banner are
  // derived from the SAME authoritative validation output that drives the header
  // issues pill, per-node "Needs setup", activation blocking, and the blank
  // chips. There is NO second readiness system (see useDocumentSetup).
  const { bannerState, wholeMap, finishSetup, scrollRef, scrollToNode } = useDocumentSetup({
    model,
    pendingNodes,
    pendingEdges,
    requiredFieldsByType,
    isDirty,
    stop,
    openStop: (nodeId, fieldKey) => openStop(nodeId, fieldKey),
    releaseStop,
  });
  const [mapOpen, setMapOpen] = useState(false);

  const say = useCallback(
    (text: string | null) => {
      onNotice?.(text);
    },
    [onNotice],
  );

  // Transient notices auto-dismiss; correctness never depends on them.
  useEffect(() => {
    if (!notice) return;
    const handle = setTimeout(() => onNotice?.(null), 6000);
    return () => clearTimeout(handle);
  }, [notice, onNotice]);

  const interactive = onGuidedStopActive !== undefined;

  const handleEditField = useCallback(
    (nodeId: string, fieldName: string) => {
      // While the queue is active, a chip click moves the queue cursor to that
      // field (reusing the same stop machinery) so map/controls stay in sync.
      if (finishSetup.active && finishSetup.goToNode(nodeId, fieldName)) return;
      const result = openStop(nodeId, fieldName);
      if (!result.ok) say(describeDocumentRefusal(result.reason));
    },
    [finishSetup, openStop, say],
  );

  const handleConfigureStep = useCallback(
    (nodeId: string) => {
      // Inspector/map conflict resolution: the map closes before the full
      // inspector opens (never overlapping drawers). Queue session is preserved.
      setMapOpen(false);
      releaseStop();
      if (onOpenStepInspector) {
        onOpenStepInspector(nodeId);
        return;
      }
      const result = openDocumentStepConfig({ nodeId });
      if (!result.ok) say(describeDocumentRefusal(result.reason));
    },
    [releaseStop, onOpenStepInspector, say],
  );

  // CS-3 — execute a typed, non-throwing navigation from a Whole Workflow map
  // row. Navigation NEVER saves or mutates: it scrolls, opens the existing
  // Guided Stop, opens the existing inspector, or hands off to the Visual
  // Builder. Stale ids and structural connectors refuse safely.
  const handleMapSelect = useCallback(
    (row: WholeWorkflowMapRow) => {
      const liveIds = new Set(useGraphSlice.getState().pendingNodes.map((n) => n.id));
      const outcome = resolveMapRowNavigation(row, liveIds);
      switch (outcome.kind) {
        case "scroll":
          scrollToNode(outcome.nodeId);
          break;
        case "scroll_and_edit":
          scrollToNode(outcome.nodeId);
          handleEditField(outcome.nodeId, outcome.fieldKey);
          break;
        case "open_inspector":
          handleConfigureStep(outcome.nodeId);
          break;
        case "open_in_visual":
          onOpenInVisual?.(outcome.nodeId);
          break;
        case "refuse":
          say(navRefusalCopy(outcome.reason));
          break;
      }
    },
    [scrollToNode, handleEditField, handleConfigureStep, onOpenInVisual, say],
  );

  const handleTailAdd = useCallback(
    (nodeId: string) => {
      const check = validateDocumentTailAdd({ anchorNodeId: nodeId });
      if (!check.ok) {
        say(describeDocumentRefusal(check.reason));
        return;
      }
      onAppendAfter?.(nodeId);
    },
    [onAppendAfter, say],
  );

  // CS-2B — insert an ordinary action at the start of a branch lane. Validates
  // against LIVE store state, then delegates to the SAME picker + shared
  // insertActionAtEdge path the canvas edge "+" uses (label preserved upstream,
  // continuation unlabeled).
  const handleInsertInLane = useCallback(
    (laneInsert: {
      edgeId: string;
      fromNodeId: string;
      toNodeId: string;
      label: string;
    }) => {
      const check = validateDocumentBranchLaneInsertion({
        edgeId: laneInsert.edgeId,
        expectedFrom: laneInsert.fromNodeId,
        expectedTo: laneInsert.toNodeId,
        expectedLabel: laneInsert.label,
      });
      if (!check.ok) {
        say(describeDocumentRefusal(check.reason));
        return;
      }
      onInsertAtEdge?.(laneInsert.edgeId);
    },
    [onInsertAtEdge, say],
  );

  const handleInsertBetween = useCallback(
    (block: DocumentSentenceBlock) => {
      if (!block.insertAfter) return;
      const check = validateDocumentEdgeInsertion({
        edgeId: block.insertAfter.edgeId,
        expectedFrom: block.nodeId,
        expectedTo: block.insertAfter.toNodeId,
      });
      if (!check.ok) {
        say(describeDocumentRefusal(check.reason));
        return;
      }
      onInsertAtEdge?.(block.insertAfter.edgeId);
    },
    [onInsertAtEdge, say],
  );

  // The active Guided Stop editor, anchored under the block that owns the
  // clicked chip (sentence OR fork). Reused for both so the render stays DRY.
  const renderStopEditor = (nodeId: string): ReactNode =>
    stop?.nodeId === nodeId ? (
      <GuidedStopEditor
        key={`stop-${nodeId}`}
        nodeId={stop.nodeId}
        fieldName={stop.fieldName}
        onCommit={() => {
          const result = commitStop();
          if (!result.ok) say(describeDocumentRefusal(result.reason));
        }}
        onCancel={() => cancelStop()}
        onOpenInspector={() => handleConfigureStep(stop.nodeId)}
      />
    ) : null;

  const renderBlocks = (
    blocks: readonly DocumentBlock[],
    opts?: { dimUnrelated?: boolean },
  ): ReactNode => {
    let actionOrdinal = 0;
    const groups: Array<{ block: DocumentBlock; nodes: ReactNode[] }> = [];
    let out: ReactNode[] = [];
    const flush = (block: DocumentBlock) => {
      groups.push({ block, nodes: out });
      out = [];
    };
    for (const block of blocks) {
      if (block.kind === "sentence") {
        const marker = block.nodeKind === "trigger" ? "When" : String(++actionOrdinal);
        out.push(
          <DocumentSentence
            key={block.nodeId}
            block={block}
            marker={marker}
            providerIcon={providerIcons?.[block.providerId]}
            onEditField={interactive ? handleEditField : undefined}
            onConfigureStep={interactive ? handleConfigureStep : undefined}
            editingFieldName={stop?.nodeId === block.nodeId ? stop.fieldName : null}
          />,
        );
        if (stop?.nodeId === block.nodeId) out.push(renderStopEditor(block.nodeId));
        if (interactive && block.insertAfter && onInsertAtEdge) {
          out.push(
            <div key={`ins-${block.nodeId}`} className="group/ins flex justify-start pl-14">
              <button
                type="button"
                data-testid={`document-insert-after-${block.nodeId}`}
                onClick={() => handleInsertBetween(block)}
                className="inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium opacity-0 transition-opacity focus:opacity-100 group-hover/ins:opacity-100 motion-reduce:transition-none"
                style={{
                  color: "var(--builder-muted)",
                  border: "1.5px dashed var(--builder-border)",
                }}
              >
                ＋ Add a step here
              </button>
            </div>,
          );
        }
        if (interactive && block.isLinearTail && onAppendAfter) {
          out.push(
            <div key={`tail-${block.nodeId}`} className="mt-1 pl-14">
              <button
                type="button"
                data-testid={`document-add-after-${block.nodeId}`}
                onClick={() => handleTailAdd(block.nodeId)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium"
                style={{
                  color: "var(--builder-text-2)",
                  border: "1.5px dashed var(--builder-border)",
                }}
              >
                ＋ Add a step
              </button>
            </div>,
          );
        }
        flush(block);
        continue;
      }
      if (block.kind === "fork") {
        out.push(
          <DocumentForkBlock
            key={block.nodeId}
            block={block}
            renderBlocks={renderBlocks}
            onEditField={interactive ? handleEditField : undefined}
            onConfigureStep={interactive ? handleConfigureStep : undefined}
            onOpenInVisual={onOpenInVisual}
            onInsertInLane={interactive && onInsertAtEdge ? handleInsertInLane : undefined}
          />,
        );
        if (stop?.nodeId === block.nodeId) out.push(renderStopEditor(block.nodeId));
        flush(block);
        continue;
      }
      out.push(
        <DocumentComplexRegion
          key={`complex-${block.reason}-${block.nodeIds[0] ?? "empty"}`}
          block={block}
          onOpenInVisual={onOpenInVisual}
        />,
      );
      flush(block);
    }
    const dimActive = opts?.dimUnrelated === true && stop !== null;
    return groups.map(({ block, nodes }, i) => {
      const dim = dimActive && !blockContainsNode(block, stop!.nodeId);
      return (
        <div
          key={`group-${i}`}
          {...(dim ? { "data-document-dimmed": "true" } : {})}
          className="transition-opacity motion-reduce:transition-none"
          style={dim ? { opacity: 0.45 } : undefined}
        >
          {nodes}
        </div>
      );
    });
  };

  return (
    <div
      data-testid="document-view"
      data-projection-tier={model.tier}
      className="relative flex min-h-0 flex-1"
      style={{ background: "var(--builder-panel)" }}
      aria-label="Workflow document"
    >
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-8 py-6">
          {interactive && !model.empty ? (
            <>
              <FinishSetupBanner
                state={bannerState}
                queueActive={finishSetup.active}
                onFinishSetup={finishSetup.start}
                onOpenMap={() => setMapOpen(true)}
                {...(onOpenInVisual ? { onOpenInVisual: () => onOpenInVisual(null) } : {})}
              />
              <FinishSetupControls queue={finishSetup} />
            </>
          ) : null}
          <p
            data-testid="document-readonly-note"
            className="builder-mono m-0 mb-4 text-[10.5px] uppercase tracking-[0.12em]"
            style={{ color: "var(--builder-muted-2)" }}
          >
            Document view · click any value to edit · Save when you&rsquo;re ready
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
                Switch to the Visual builder to add a trigger — the Document reads the same
                workflow.
              </p>
            </div>
          ) : (
            renderBlocks(model.blocks, { dimUnrelated: true })
          )}
        </div>
        {notice ? (
          <div
            data-testid="document-notice"
            role="status"
            className="pointer-events-none sticky bottom-4 mx-auto w-fit max-w-[85%] rounded-lg px-4 py-2 text-[12.5px] font-medium"
            style={{
              background: "var(--builder-text)",
              color: "var(--builder-panel)",
              boxShadow: "0 14px 30px -12px rgba(0,0,0,.4)",
            }}
          >
            {notice}
          </div>
        ) : null}
      </div>
      {interactive && mapOpen ? (
        <WholeWorkflowMap
          map={wholeMap}
          activeNodeId={stop?.nodeId ?? null}
          onClose={() => setMapOpen(false)}
          onSelectRow={handleMapSelect}
        />
      ) : null}
    </div>
  );
}

function blockContainsNode(block: DocumentBlock, nodeId: string): boolean {
  if (block.kind === "sentence") return block.nodeId === nodeId;
  if (block.kind === "fork") {
    if (block.nodeId === nodeId) return true;
    return block.lanes.some((l) => l.blocks.some((b) => blockContainsNode(b, nodeId)));
  }
  return block.nodeIds.includes(nodeId);
}
