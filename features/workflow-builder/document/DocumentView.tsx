"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";
import { useGraphSlice } from "../state/graphSlice";
import { DocumentComplexRegion } from "./DocumentComplexRegion";
import { DocumentForkBlock } from "./DocumentForkBlock";
import { DocumentSentence } from "./DocumentSentence";
import { DocumentSectionHeader } from "./DocumentSectionHeader";
import { GuidedStopEditor } from "./GuidedStopEditor";
import { FinishSetupBanner } from "./FinishSetupBanner";
import { FinishSetupControls } from "./FinishSetupControls";
import { WholeWorkflowMap } from "./WholeWorkflowMap";
import { DocumentEmptyState } from "./DocumentEmptyState";
import { DocumentAskReactBar } from "./DocumentAskReactBar";
import { DocumentPreview } from "./DocumentPreview";
import { DocumentInsertMenu } from "./DocumentInsertMenu";
import { DocumentSelectionToolbar } from "./DocumentSelectionToolbar";
import { useDocumentGuidedStop } from "./useDocumentGuidedStop";
import { useDocumentSetup, navRefusalCopy } from "./useDocumentSetup";
import type { WholeWorkflowMapRow } from "./wholeWorkflowMapModel";
import { resolveMapRowNavigation } from "./documentNavigation";
import { buildLaneContext } from "./documentBranchContext";
import { buildDocumentPreview } from "./documentPreviewProjection";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { WorkflowDefinition } from "@/contracts/workflow";
import {
  createDocumentIfThenBranch,
  createDocumentRouterBranch,
  describeBranchRefusal,
  type BranchInsertLocation,
} from "./documentBranchCommands";
import {
  describeSelectionRefusal,
  duplicateDocumentAction,
  moveDocumentAction,
  removeDocumentBlock,
} from "./documentSelectionCommands";
import {
  blockPrimaryNodeId,
  groupBlocksIntoSections,
  summarizeDocumentSection,
  type DocumentSection,
  type SectionedRow,
} from "./documentSections";
import {
  describeSectionRefusal,
  resolveBlockNodeIds,
  resolveWrapSelection,
} from "./documentSectionCommands";
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
  onAddToEmptyLane,
  onStartWithTrigger,
  onAskReact,
  canUseAdvancedBranching,
  previewOverlay,
  onApplyPreview,
  onDiscardPreview,
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
  /** CS-5 — open the shared picker to wire the first step of an empty lane. */
  onAddToEmptyLane?: ((forkNodeId: string, label: string) => void) | undefined;
  /** CS-6 — empty-state "Start with a trigger" → the existing TriggerPicker. */
  onStartWithTrigger?: (() => void) | undefined;
  /** CS-6 — seed + expand the ONE existing React Agent conversation. */
  onAskReact?: ((prompt: string) => void) | undefined;
  /** CS-6 — advanced-branching entitlement (Pro lock for branch menu entries). */
  canUseAdvancedBranching?: boolean | undefined;
  /**
   * CS-6 — the ephemeral React-Agent preview (owned by `useBuilderPreview`).
   * Rendering it never mutates the graph; only `onApplyPreview` does (canonical).
   */
  previewOverlay?:
    | { readonly preview: DraftPreview; readonly proposedDefinition?: WorkflowDefinition | undefined }
    | null
    | undefined;
  onApplyPreview?: (() => void) | undefined;
  onDiscardPreview?: (() => void) | undefined;
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
  // CS-4 — presentation sections live in the SAME canonical draft (graphSlice).
  const pendingPresentation = useGraphSlice((s) => s.pendingPresentation);
  const { bannerState, wholeMap, finishSetup, queue, scrollRef, scrollToNode } = useDocumentSetup({
    model,
    pendingNodes,
    pendingEdges,
    requiredFieldsByType,
    isDirty,
    stop,
    presentation: pendingPresentation,
    openStop: (nodeId, fieldKey) => openStop(nodeId, fieldKey),
    releaseStop,
  });
  const [mapOpen, setMapOpen] = useState(false);

  // CS-4 — sections that a Guided Stop / map navigation has TEMPORARILY revealed
  // even though they are stored collapsed (so a queued/map-target field inside a
  // collapsed section is never hidden behind the collapse). Session-only.
  const [revealedSectionIds, setRevealedSectionIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const nodeToSectionId = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of pendingPresentation?.sections ?? []) {
      for (const id of s.nodeIds) m.set(id, s.id);
    }
    return m;
  }, [pendingPresentation]);
  const revealSectionForNode = useCallback(
    (nodeId: string) => {
      const sectionId = nodeToSectionId.get(nodeId);
      if (!sectionId) return;
      setRevealedSectionIds((prev) => {
        if (prev.has(sectionId)) return prev;
        const next = new Set(prev);
        next.add(sectionId);
        return next;
      });
    },
    [nodeToSectionId],
  );

  // Continuous top-level step numbering ("When", 1, 2, …). Precomputed so a
  // section boundary never restarts the count (lane numbering stays per-lane).
  const topLevelMarkers = useMemo(() => {
    const m = new Map<string, string>();
    let n = 0;
    for (const b of model.blocks) {
      if (b.kind === "sentence") {
        m.set(b.nodeId, b.nodeKind === "trigger" ? "When" : String(++n));
      }
    }
    return m;
  }, [model.blocks]);

  // Unresolved supported-setup count per node (for collapsed section summaries).
  const unresolvedByNode = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of queue.items) m.set(item.nodeId, (m.get(item.nodeId) ?? 0) + 1);
    return m;
  }, [queue.items]);

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

  // CS-6 — the ephemeral agent proposal as a read-only ghost Document. Computed
  // from the SAME live graph + the overlay owned by useBuilderPreview; building
  // it mutates nothing. Null when no preview is active.
  const previewModel = useMemo(
    () =>
      previewOverlay
        ? buildDocumentPreview({
            liveNodes: pendingNodes,
            liveEdges: pendingEdges,
            preview: previewOverlay.preview,
            proposedDefinition: previewOverlay.proposedDefinition,
            meta: { requiredFieldsByType, summaryFieldsByType, providerLabels },
          })
        : null,
    [previewOverlay, pendingNodes, pendingEdges, requiredFieldsByType, summaryFieldsByType, providerLabels],
  );

  // CS-6 — safe top-level multi-selection (ids of the primary node of each
  // selected top-level block). Session-only UI state; never persisted.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const toggleSelect = useCallback((primaryId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(primaryId)) next.delete(primaryId);
      else next.add(primaryId);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  // Selection references live node ids; prune ids that disappeared (undo/delete).
  useEffect(() => {
    const live = new Set(pendingNodes.map((n) => n.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [pendingNodes]);

  // CS-6 — the top-level blocks (document order) for selection + insertion menus.
  const topLevelBlocks = model.blocks;
  // A single selected ORDINARY action is duplicate/move eligible.
  const singleSelectedActionable = useMemo(() => {
    if (selectedIds.size !== 1) return false;
    const id = [...selectedIds][0]!;
    const node = pendingNodes.find((n) => n.id === id);
    return node?.kind === "action";
  }, [selectedIds, pendingNodes]);

  // CS-6 — insertion-menu handlers. A branch pick routes through the CS-5 create
  // commands (Router-between is refused there); Step reuses the existing picker;
  // Ask React seeds the ONE agent with a plain-language, id-safe location.
  const handleCreateBranch = useCallback(
    (location: BranchInsertLocation, kind: "if_then" | "router") => {
      const result =
        kind === "router"
          ? createDocumentRouterBranch({ location, canUseAdvancedBranching })
          : createDocumentIfThenBranch({ location, canUseAdvancedBranching });
      if (!result.ok) say(describeBranchRefusal(result.reason));
      else if (kind === "router" && result.nodeId) onOpenStepInspector?.(result.nodeId);
    },
    [canUseAdvancedBranching, say, onOpenStepInspector],
  );

  // CS-6 — Ask React with an insertion CONTEXT (plain-language + safe ids only).
  const handleAskReactAt = useCallback(
    (context: string) => {
      onAskReact?.(`Add a step ${context}. `);
    },
    [onAskReact],
  );

  // CS-6 — selection-toolbar command handlers (all typed, non-throwing).
  const handleWrapSelection = useCallback(() => {
    const resolved = resolveWrapSelection(topLevelBlocks, [...selectedIds]);
    if (!resolved.ok) {
      say(describeSectionRefusal(resolved.reason));
      return;
    }
    const result = useGraphSlice.getState().createSection({ nodeIds: resolved.nodeIds, title: "New section" });
    if (!result.ok && result.reason !== "no_change") say("This part can't be grouped into a section.");
    else clearSelection();
  }, [topLevelBlocks, selectedIds, say, clearSelection]);

  const handleDuplicateSelection = useCallback(() => {
    if (selectedIds.size !== 1) return;
    const result = duplicateDocumentAction({ nodeId: [...selectedIds][0]! });
    if (!result.ok) say(describeSelectionRefusal(result.reason));
    else clearSelection();
  }, [selectedIds, say, clearSelection]);

  const handleDeleteSelection = useCallback(() => {
    let confirmed = false;
    for (const id of selectedIds) {
      const result = removeDocumentBlock({ nodeId: id, confirmed });
      if (!result.ok) {
        if (result.reason === "destructive_confirmation_required") {
          // The Document's own confirm gesture — native confirm keeps the flow simple.
          if (typeof window !== "undefined" && window.confirm("Delete the selected step(s)? This changes your workflow.")) {
            confirmed = true;
            const retry = removeDocumentBlock({ nodeId: id, confirmed: true });
            if (!retry.ok) { say(describeSelectionRefusal(retry.reason)); return; }
          } else {
            return;
          }
        } else {
          say(describeSelectionRefusal(result.reason));
          return;
        }
      }
    }
    clearSelection();
  }, [selectedIds, say, clearSelection]);

  const handleMoveSelection = useCallback(
    (direction: "earlier" | "later") => {
      if (selectedIds.size !== 1) return;
      const result = moveDocumentAction({ nodeId: [...selectedIds][0]!, direction });
      if (!result.ok) say(describeSelectionRefusal(result.reason));
    },
    [selectedIds, say],
  );

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
      // CS-4 — clicking a section parent row REVEALS it (transient, no store
      // mutation / no save), so its children become navigable.
      if (row.kind === "section") {
        if (row.sectionId) {
          setRevealedSectionIds((prev) => {
            if (prev.has(row.sectionId!)) return prev;
            const next = new Set(prev);
            next.add(row.sectionId!);
            return next;
          });
        }
        return;
      }
      const liveIds = new Set(useGraphSlice.getState().pendingNodes.map((n) => n.id));
      const outcome = resolveMapRowNavigation(row, liveIds);
      switch (outcome.kind) {
        case "scroll":
          revealSectionForNode(outcome.nodeId); // reveal a collapsed section first
          scrollToNode(outcome.nodeId);
          break;
        case "scroll_and_edit":
          revealSectionForNode(outcome.nodeId);
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
    [scrollToNode, handleEditField, handleConfigureStep, onOpenInVisual, say, revealSectionForNode],
  );

  // ---- CS-4 section commands (thin: resolve block → node ids, delegate to the
  // shared graphSlice section actions; never mutate nodes/edges/topology). ----
  const handleWrapBlock = useCallback(
    (block: DocumentBlock) => {
      const resolved = resolveBlockNodeIds(block);
      if (!resolved.ok) {
        say(describeSectionRefusal(resolved.reason));
        return;
      }
      const result = useGraphSlice.getState().createSection({
        nodeIds: resolved.nodeIds,
        title: "New section",
      });
      if (!result.ok && result.reason !== "no_change") {
        say("This part can't be grouped into a section.");
      }
    },
    [say],
  );
  const handleAddBlockToSection = useCallback(
    (block: DocumentBlock, sectionId: string) => {
      const resolved = resolveBlockNodeIds(block);
      if (!resolved.ok) {
        say(describeSectionRefusal(resolved.reason));
        return;
      }
      useGraphSlice.getState().addNodesToSection(sectionId, resolved.nodeIds);
    },
    [say],
  );
  const handleRemoveBlockFromSection = useCallback((block: DocumentBlock) => {
    const resolved = resolveBlockNodeIds(block);
    if (!resolved.ok) return;
    useGraphSlice.getState().removeNodesFromSection(resolved.nodeIds);
  }, []);
  const handleRenameSection = useCallback((sectionId: string, title: string) => {
    useGraphSlice.getState().renameSection(sectionId, title);
  }, []);
  const handleUngroupSection = useCallback((sectionId: string) => {
    useGraphSlice.getState().ungroupSection(sectionId);
  }, []);
  const handleToggleCollapse = useCallback((section: DocumentSection) => {
    // A manual toggle clears any transient reveal override for this section.
    setRevealedSectionIds((prev) => {
      if (!prev.has(section.id)) return prev;
      const next = new Set(prev);
      next.delete(section.id);
      return next;
    });
    useGraphSlice.getState().setSectionCollapsed(section.id, !section.collapsed);
  }, []);

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
        // CS-5 — lane-aware context: breadcrumb ancestry + sibling-lane chips
        // for a stop inside a branch lane. Switching a lane is FOCUS ONLY.
        laneContext={buildLaneContext(model, stop.nodeId)}
        onSwitchLane={(targetNodeId) => scrollToNode(targetNodeId)}
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
    opts?: { dimUnrelated?: boolean; markerMap?: ReadonlyMap<string, string>; selectable?: boolean },
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
        // CS-4 — top-level markers are precomputed (continuous across section
        // boundaries); lane blocks fall back to the local per-lane counter.
        const marker =
          opts?.markerMap?.get(block.nodeId) ??
          (block.nodeKind === "trigger" ? "When" : String(++actionOrdinal));
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
        // CS-6 — the "+" now opens the Step / Branch / Section / Ask React menu
        // (no Loop). Router is offered only where placement is valid (tail);
        // between two nodes it is refused (locked rule) → Router omitted there.
        if (interactive && block.insertAfter && onInsertAtEdge) {
          const loc: BranchInsertLocation = {
            kind: "between",
            edgeId: block.insertAfter.edgeId,
            expectedFrom: block.nodeId,
            expectedTo: block.insertAfter.toNodeId,
          };
          out.push(
            <div key={`ins-${block.nodeId}`} className="group flex justify-start pl-14">
              <DocumentInsertMenu
                testId={`document-insert-after-${block.nodeId}`}
                label="＋ Add a step here"
                branchLocked={canUseAdvancedBranching === false}
                onStep={() => handleInsertBetween(block)}
                onIfThen={() => handleCreateBranch(loc, "if_then")}
                onSection={() => handleWrapBlock(block)}
                onAskReact={() => handleAskReactAt("after this step")}
              />
            </div>,
          );
        }
        if (interactive && block.isLinearTail && onAppendAfter) {
          const loc: BranchInsertLocation = { kind: "tail", anchorNodeId: block.nodeId };
          out.push(
            <div key={`tail-${block.nodeId}`} className="group mt-1 pl-14">
              <DocumentInsertMenu
                testId={`document-add-after-${block.nodeId}`}
                label="＋ Add a step"
                branchLocked={canUseAdvancedBranching === false}
                onStep={() => handleTailAdd(block.nodeId)}
                onIfThen={() => handleCreateBranch(loc, "if_then")}
                onRouter={() => handleCreateBranch(loc, "router")}
                onSection={() => handleWrapBlock(block)}
                onAskReact={() => handleAskReactAt("at the end of the workflow")}
              />
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
            onAddToEmptyLane={interactive ? onAddToEmptyLane : undefined}
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
      // CS-6 — a top-level sentence/fork block gets a select control (top-level
      // selection only — never nested lane steps).
      const primary =
        opts?.selectable && interactive && (block.kind === "sentence" || block.kind === "fork")
          ? block.nodeId
          : null;
      const selected = primary !== null && selectedIds.has(primary);
      return (
        <div
          key={`group-${i}`}
          {...(dim ? { "data-document-dimmed": "true" } : {})}
          {...(selected ? { "data-document-selected": "true" } : {})}
          className="group/sel relative transition-opacity motion-reduce:transition-none"
          style={dim ? { opacity: 0.45 } : undefined}
        >
          {primary !== null ? (
            <button
              type="button"
              role="checkbox"
              aria-checked={selected}
              aria-label={selected ? "Deselect step" : "Select step"}
              data-testid={`document-select-${primary}`}
              onClick={() => toggleSelect(primary)}
              className={`absolute left-0 top-2 z-[1] inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] transition-opacity motion-reduce:transition-none ${selected ? "opacity-100" : "opacity-0 focus:opacity-100 group-hover/sel:opacity-100"}`}
              style={{
                border: "1.5px solid var(--builder-border)",
                background: selected ? "var(--builder-accent)" : "var(--builder-panel)",
                color: selected ? "var(--builder-panel)" : "transparent",
              }}
            >
              ✓
            </button>
          ) : null}
          {nodes}
        </div>
      );
    });
  };

  // CS-4 — a loose top-level block's "group into section" / "add to adjacent
  // section" affordances. Section grouping only; never changes graph order.
  const looseSectionAffordance = (
    block: DocumentBlock,
    adjacentSection: { id: string; title: string } | null,
  ): ReactNode => {
    if (!interactive) return null;
    const primary = blockPrimaryNodeId(block);
    if (primary === null) return null;
    return (
      <div key={`sec-aff-${primary}`} className="group/sec flex items-center gap-2 pl-14">
        <button
          type="button"
          data-testid={`document-wrap-section-${primary}`}
          onClick={() => handleWrapBlock(block)}
          className="inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium opacity-0 transition-opacity focus:opacity-100 group-hover/sec:opacity-100 motion-reduce:transition-none"
          style={{ color: "var(--builder-muted)", border: "1.5px dashed var(--builder-border)" }}
        >
          ＋ Section
        </button>
        {adjacentSection ? (
          <button
            type="button"
            data-testid={`document-add-to-section-${primary}`}
            onClick={() => handleAddBlockToSection(block, adjacentSection.id)}
            className="inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium opacity-0 transition-opacity focus:opacity-100 group-hover/sec:opacity-100 motion-reduce:transition-none"
            style={{ color: "var(--builder-muted)", border: "1px solid var(--builder-border)" }}
          >
            Add to “{adjacentSection.title}”
          </button>
        ) : null}
      </div>
    );
  };

  const renderSectionBody = (section: DocumentSection): ReactNode => (
    <div className="px-3 pb-3 pt-1">
      {renderBlocks(section.blocks, { dimUnrelated: true, markerMap: topLevelMarkers, selectable: true })}
      {interactive ? (
        <div className="pl-11">
          <button
            type="button"
            data-testid={`document-section-remove-last-${section.id}`}
            onClick={() => {
              const last = section.blocks[section.blocks.length - 1];
              if (last) handleRemoveBlockFromSection(last);
            }}
            className="mt-1 inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium"
            style={{ color: "var(--builder-muted)", border: "1px solid var(--builder-border)" }}
            title="Move the last step out of this section"
          >
            Move step out
          </button>
        </div>
      ) : null}
    </div>
  );

  const sectionContainsActiveStop = (section: DocumentSection): boolean =>
    stop !== null && section.blocks.some((b) => blockContainsNode(b, stop.nodeId));

  const renderSectionedRows = (rows: readonly SectionedRow[]): ReactNode => {
    // Find, for each loose block, whether a section is immediately adjacent so
    // the "add to section" affordance can extend a contiguous section.
    return rows.map((row, i) => {
      if (row.kind === "section") {
        const { section } = row;
        const collapsed =
          section.collapsed &&
          !revealedSectionIds.has(section.id) &&
          !sectionContainsActiveStop(section);
        const summary = summarizeDocumentSection(section, { providerLabels, unresolvedByNode });
        return (
          <div key={`section-${section.id}-${section.runIndex}`} className="my-2">
            <DocumentSectionHeader
              section={section}
              collapsed={collapsed}
              summaryText={summary.text}
              onRename={(title) => handleRenameSection(section.id, title)}
              onToggleCollapse={() => handleToggleCollapse(section)}
              onUngroup={() => handleUngroupSection(section.id)}
            >
              {collapsed ? null : renderSectionBody(section)}
            </DocumentSectionHeader>
          </div>
        );
      }
      const prev = rows[i - 1];
      const next = rows[i + 1];
      const adjacent =
        prev?.kind === "section"
          ? { id: prev.section.id, title: prev.section.title }
          : next?.kind === "section"
            ? { id: next.section.id, title: next.section.title }
            : null;
      return (
        <Fragment key={`loose-${blockPrimaryNodeId(row.block) ?? i}`}>
          {renderBlocks([row.block], { dimUnrelated: true, markerMap: topLevelMarkers, selectable: true })}
          {looseSectionAffordance(row.block, adjacent)}
        </Fragment>
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
          {/* CS-6 — a top-level selection surfaces the safe-actions toolbar. */}
          {interactive && selectedIds.size > 0 ? (
            <DocumentSelectionToolbar
              count={selectedIds.size}
              singleActionable={singleSelectedActionable}
              onWrap={handleWrapSelection}
              onDuplicate={handleDuplicateSelection}
              onDelete={handleDeleteSelection}
              onMoveEarlier={() => handleMoveSelection("earlier")}
              onMoveLater={() => handleMoveSelection("later")}
              onClear={clearSelection}
            />
          ) : null}
          {/* CS-6 — the React-Agent proposal as a non-mutating ghost Document. */}
          {interactive && previewModel && onApplyPreview && onDiscardPreview ? (
            <DocumentPreview
              model={previewModel}
              onApply={onApplyPreview}
              onDiscard={onDiscardPreview}
              {...(onOpenInVisual ? { onOpenInVisual: () => onOpenInVisual(null) } : {})}
            />
          ) : null}
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
          {model.empty ? (
            <DocumentEmptyState
              {...(onAskReact ? { onAskReact } : {})}
              {...(onStartWithTrigger ? { onStartWithTrigger } : {})}
            />
          ) : (
            <>
              <p
                data-testid="document-readonly-note"
                className="builder-mono m-0 mb-4 text-[10.5px] uppercase tracking-[0.12em]"
                style={{ color: "var(--builder-muted-2)" }}
              >
                Document view · click any value to edit · Save when you&rsquo;re ready
              </p>
              {renderSectionedRows(
                groupBlocksIntoSections(model.blocks, pendingPresentation).rows,
              )}
              {/* CS-6 — persistent, unobtrusive entry to the ONE agent. */}
              {interactive && onAskReact ? <DocumentAskReactBar onAskReact={onAskReact} /> : null}
            </>
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
