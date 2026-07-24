"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { DocumentAgentWorkspace } from "./DocumentAgentWorkspace";
import {
  describeProposalChanges,
  resolveDocumentAgentContext,
  type DocumentAgentContext,
} from "./documentAgentContext";
import { DocumentPreview } from "./DocumentPreview";
import { DocumentInsertMenu } from "./DocumentInsertMenu";
import type { DocumentStepMenuItem } from "./DocumentStepMenu";
import { DocumentSelectionToolbar } from "./DocumentSelectionToolbar";
import { useDocumentGuidedStop } from "./useDocumentGuidedStop";
import { useDocumentSetup, navRefusalCopy } from "./useDocumentSetup";
import type { WholeWorkflowMapRow } from "./wholeWorkflowMapModel";
import { resolveMapRowNavigation } from "./documentNavigation";
import { buildLaneContext } from "./documentBranchContext";
import { buildDocumentPreview } from "./documentPreviewProjection";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { WorkflowDefinition } from "@/contracts/workflow";
import type { ComposerSeed } from "@/features/workflows/composerSeed";
import type { DestructivePreviewClassification } from "@/core/workflows/destructivePreview";
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
import { TIER_C_REASONS } from "./projectionTiers";
import { emitDocumentBuilderEvent } from "./documentTelemetry";
import { GROUP_ORGANIZATIONAL_NOTE } from "./DocumentSectionHeader";

/**
 * DOC-STEP-CONTROLS-1 — the default name of a freshly created GROUP. The stored
 * contract is still `presentation.sections` (unchanged on disk, so existing
 * workflows keep their data); only the USER-FACING concept is "group", because
 * that metadata never did anything but organize the document visually.
 */
export const NEW_GROUP_TITLE = "New group";

/** Per-render context threaded through `renderBlocks` (never persisted). */
interface DocumentRenderOptions {
  readonly dimUnrelated?: boolean;
  readonly markerMap?: ReadonlyMap<string, string>;
  /** True for TOP-LEVEL rows: selection + grouping entries are offered. */
  readonly selectable?: boolean;
  /** Set when these blocks are rendered INSIDE a group (offers "move out"). */
  readonly groupId?: string;
  /** A group immediately adjacent to a loose row (offers "Add to <group>"). */
  readonly addToGroup?: { readonly id: string; readonly title: string };
}

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
  workflowTitle,
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
  previewDestructive,
  onApplyPreview,
  onDiscardPreview,
  notice,
  onNotice,
  agentTranscript,
  agentBusy,
  agentHasConversation,
  agentExpanded,
  onAgentExpandedChange,
  onAgentSubmit,
  onAgentCheckWorkflow,
  agentSeed,
}: {
  requiredFieldsByType?: RequiredFieldsByType | undefined;
  summaryFieldsByType?: NodeSummaryFieldsByType | undefined;
  /** CS-7B — the workflow name, shown as the serif document title. */
  workflowTitle?: string | undefined;
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
  /**
   * CS-6/CS-7 — seed + expand the ONE existing React Agent conversation. The
   * `source` tags which Document control fired it so the keyed/versioned composer
   * seed can mint a fresh version (see features/workflows/composerSeed.ts).
   */
  onAskReact?:
    | ((prompt: string, source: "document-empty" | "document-bar" | "document-insert") => void)
    | undefined;
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
  /**
   * DOC-FINAL-ACCEPTANCE-1 — the shared destructive classification for the
   * active preview (owned by WorkflowBuilder via `classifyDestructivePreview`,
   * the SAME value the right-drawer apply flow reads). When destructive, the
   * center Apply routes through the shared confirmation before the governed
   * apply. Absent / non-destructive ⇒ the normal one-click Apply.
   */
  previewDestructive?: DestructivePreviewClassification | null | undefined;
  onApplyPreview?: (() => void) | undefined;
  onDiscardPreview?: (() => void) | undefined;
  /** CS-2 — transient notice owned by WorkflowBuilder (e.g. branch-pick refusal). */
  notice?: string | null | undefined;
  onNotice?: ((text: string | null) => void) | undefined;
  /**
   * DOC-REACT-AGENT-1 — the SHARED React Agent transcript (the very component the
   * Visual rail renders, driven by the one `useGuidanceConversation` instance
   * WorkflowBuilder owns). Rendered inside the bottom workspace; absent → the
   * workspace shows only its composer.
   */
  agentTranscript?: ReactNode | undefined;
  agentBusy?: boolean | undefined;
  agentHasConversation?: boolean | undefined;
  /** Expanded state lives in WorkflowBuilder so a Visual round-trip keeps it. */
  agentExpanded?: boolean | undefined;
  onAgentExpandedChange?: ((next: boolean) => void) | undefined;
  /** Send through the SHARED conversation, with the resolved document context. */
  onAgentSubmit?: ((prompt: string, context: DocumentAgentContext) => void) | undefined;
  /** The existing deterministic, local, no-credit "Check workflow" review. */
  onAgentCheckWorkflow?: (() => void) | undefined;
  /** The existing keyed/versioned composer seed (empty state / insertion menu). */
  agentSeed?: ComposerSeed | undefined;
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

  // CS-7 telemetry — Finish Setup start/complete transitions (categorical only).
  const finishActiveRef = useRef(false);
  const finishCompletedRef = useRef(false);
  useEffect(() => {
    if (finishSetup.active && !finishActiveRef.current) {
      emitDocumentBuilderEvent("document_finish_setup_started", {
        count: Math.min(queue.items.length, 10_000),
      });
    }
    finishActiveRef.current = finishSetup.active;
    if (finishSetup.completed && !finishCompletedRef.current) {
      emitDocumentBuilderEvent("document_finish_setup_completed");
    }
    finishCompletedRef.current = finishSetup.completed;
  }, [finishSetup.active, finishSetup.completed, queue.items.length]);

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

  // CS-7 telemetry — a centralized Visual-Builder handoff wrapper so every handoff
  // (complex region, wiring repair, map row) records ONE categorical event.
  const handoffToVisual = useCallback(
    (nodeId: string | null) => {
      emitDocumentBuilderEvent("document_visual_handoff");
      onOpenInVisual?.(nodeId);
    },
    [onOpenInVisual],
  );

  // CS-7 telemetry — record when a complex (Tier B/C) region is actually shown to
  // the user, bucketed by tier only. Keyed on the tier signature so an unrelated
  // re-render does not re-emit.
  const complexTierSignature = useMemo(() => {
    const tiers = new Set<string>();
    const scan = (blocks: readonly DocumentBlock[]): void => {
      for (const b of blocks) {
        if (b.kind === "complex") tiers.add(TIER_C_REASONS.has(b.reason) ? "c" : "b");
        else if (b.kind === "fork") b.lanes.forEach((l) => scan(l.blocks));
      }
    };
    scan(model.blocks);
    return [...tiers].sort().join(",");
  }, [model.blocks]);
  const lastComplexSigRef = useRef<string>("");
  useEffect(() => {
    if (complexTierSignature === lastComplexSigRef.current) return;
    lastComplexSigRef.current = complexTierSignature;
    if (complexTierSignature.length === 0) return;
    for (const tier of complexTierSignature.split(",")) {
      emitDocumentBuilderEvent("document_complex_region_seen", { tier });
    }
  }, [complexTierSignature]);

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

  // DOC-REACT-AGENT-1 — what the agent is working on, by the locked priority
  // (open field → focused sentence → group → whole workflow). Derived from state
  // the Document ALREADY owns; multi-select is never required.
  const agentContextInput = { model, stop, presentation: pendingPresentation };

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

  // DOC-REACT-AGENT-1 — the sentence the AGENT is currently pointing at. Session
  // -only, TEMPORARY (auto-clears), and deliberately separate from the user's own
  // multi-selection: an agent reference must never silently change what the user
  // has selected. It reuses the existing scroll/reveal navigation — no parallel
  // focus system.
  const [agentFocusNodeId, setAgentFocusNodeId] = useState<string | null>(null);
  const agentFocusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (agentFocusTimer.current) clearTimeout(agentFocusTimer.current);
    },
    [],
  );
  const focusAgentReference = useCallback(
    (nodeId: string) => {
      revealSectionForNode(nodeId); // a collapsed group must not hide the target
      scrollToNode(nodeId);
      setAgentFocusNodeId(nodeId);
      if (agentFocusTimer.current) clearTimeout(agentFocusTimer.current);
      agentFocusTimer.current = setTimeout(() => setAgentFocusNodeId(null), 2600);
    },
    [revealSectionForNode, scrollToNode],
  );

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
      emitDocumentBuilderEvent("document_insert_used", { kind: "branch" });
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
      onAskReact?.(`Add a step ${context}. `, "document-insert");
    },
    [onAskReact],
  );
  // CS-7 — source-tagged wrappers so the empty-state composer and the persistent
  // bar mint distinct seed versions for the ONE composer.
  const askReactFromEmpty = useCallback(
    (prompt: string) => onAskReact?.(prompt, "document-empty"),
    [onAskReact],
  );

  // DOC-STEP-CONTROLS-1 — the group a user JUST created opens straight into
  // naming (no unexplained default card). Session-only UI state.
  const [namingGroupId, setNamingGroupId] = useState<string | null>(null);
  const clearNamingGroup = useCallback(() => setNamingGroupId(null), []);

  // CS-6 — selection-toolbar command handlers (all typed, non-throwing).
  const handleWrapSelection = useCallback(() => {
    const resolved = resolveWrapSelection(topLevelBlocks, [...selectedIds]);
    if (!resolved.ok) {
      say(describeSectionRefusal(resolved.reason));
      return;
    }
    const result = useGraphSlice.getState().createSection({ nodeIds: resolved.nodeIds, title: NEW_GROUP_TITLE });
    if (!result.ok) {
      if (result.reason !== "no_change") say("These steps can't be grouped together.");
      return;
    }
    setNamingGroupId(result.sectionId);
    clearSelection();
  }, [topLevelBlocks, selectedIds, say, clearSelection]);

  const handleDuplicateSelection = useCallback(() => {
    if (selectedIds.size !== 1) return;
    const result = duplicateDocumentAction({ nodeId: [...selectedIds][0]! });
    if (!result.ok) say(describeSelectionRefusal(result.reason));
    else clearSelection();
  }, [selectedIds, say, clearSelection]);

  // DOC-STEP-CONTROLS-1 — the same typed commands, addressed at ONE step from
  // its overflow menu (no separate command path; selection is no longer a
  // prerequisite for managing a single step).
  const handleDuplicateStep = useCallback(
    (nodeId: string) => {
      const result = duplicateDocumentAction({ nodeId });
      if (!result.ok) say(describeSelectionRefusal(result.reason));
    },
    [say],
  );

  const handleMoveStep = useCallback(
    (nodeId: string, direction: "earlier" | "later") => {
      const result = moveDocumentAction({ nodeId, direction });
      if (!result.ok) say(describeSelectionRefusal(result.reason));
    },
    [say],
  );

  const handleDeleteStep = useCallback(
    (nodeId: string) => {
      const result = removeDocumentBlock({ nodeId });
      if (result.ok) {
        clearSelection();
        return;
      }
      if (result.reason !== "destructive_confirmation_required") {
        say(describeSelectionRefusal(result.reason));
        return;
      }
      // The Document's own confirm gesture — native confirm keeps the flow simple.
      if (typeof window === "undefined") return;
      if (!window.confirm("Delete this step? This changes your workflow.")) return;
      const retry = removeDocumentBlock({ nodeId, confirmed: true });
      if (!retry.ok) say(describeSelectionRefusal(retry.reason));
      else clearSelection();
    },
    [say, clearSelection],
  );

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
          handoffToVisual(outcome.nodeId);
          break;
        case "refuse":
          say(navRefusalCopy(outcome.reason));
          break;
      }
    },
    [scrollToNode, handleEditField, handleConfigureStep, handoffToVisual, say, revealSectionForNode],
  );

  // ---- CS-4 group ("section") commands (thin: resolve block → node ids,
  // delegate to the shared graphSlice section actions; never mutate
  // nodes/edges/topology). ----
  const handleWrapBlock = useCallback(
    (block: DocumentBlock) => {
      const resolved = resolveBlockNodeIds(block);
      if (!resolved.ok) {
        say(describeSectionRefusal(resolved.reason));
        return;
      }
      emitDocumentBuilderEvent("document_insert_used", { kind: "section" });
      const result = useGraphSlice.getState().createSection({
        nodeIds: resolved.nodeIds,
        title: NEW_GROUP_TITLE,
      });
      if (!result.ok) {
        if (result.reason !== "no_change") say("This step can't be grouped.");
        return;
      }
      setNamingGroupId(result.sectionId);
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
      emitDocumentBuilderEvent("document_insert_used", { kind: "step" });
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
      emitDocumentBuilderEvent("document_insert_used", { kind: "step" });
      onInsertAtEdge?.(block.insertAfter.edgeId);
    },
    [onInsertAtEdge, say],
  );

  const agentContext: DocumentAgentContext = useMemo(
    () =>
      resolveDocumentAgentContext({
        model: agentContextInput.model,
        stop: agentContextInput.stop
          ? { nodeId: agentContextInput.stop.nodeId, fieldName: agentContextInput.stop.fieldName }
          : null,
        selectedIds,
        presentation: agentContextInput.presentation,
      }),
    [agentContextInput.model, agentContextInput.stop, agentContextInput.presentation, selectedIds],
  );
  // Clearing the context releases whichever surface produced it — the open
  // Guided Stop or the multi-selection — using the existing controls.
  const clearAgentContext = useCallback(() => {
    releaseStop();
    clearSelection();
  }, [releaseStop, clearSelection]);

  // DOC-REACT-AGENT-1 — the sentences a PENDING proposal touches, read from the
  // existing preview projection (never from prose, never a second diff format).
  const proposalChanges = useMemo(
    // DOC-REACT-AGENT-2 — pass the document's own reading-order markers so two
    // steps of the same action type read as "Step 2 · …" / "Step 9 · …".
    () => describeProposalChanges(previewModel, model, 12, topLevelMarkers),
    [previewModel, model, topLevelMarkers],
  );
  const agentStatusMessage = useMemo(() => {
    if (agentBusy === true) return "React is working on your request.";
    if (proposalChanges.length > 0) {
      return `React proposed changes to ${proposalChanges.length} ${proposalChanges.length === 1 ? "step" : "steps"}. Review them in the document.`;
    }
    return null;
  }, [agentBusy, proposalChanges]);

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
          else emitDocumentBuilderEvent("document_guided_stop_completed");
        }}
        onCancel={() => cancelStop()}
        onOpenInspector={() => handleConfigureStep(stop.nodeId)}
      />
    ) : null;

  /**
   * DOC-STEP-CONTROLS-1 — the entries of ONE step's always-visible overflow
   * menu. Every entry delegates to an EXISTING typed command handler above
   * (selection commands / section commands / the inspector), so the menu adds
   * discoverability, not a second command path. Structure-only entries
   * (group / move out of group) appear only at top level, where grouping is
   * defined; nested lane steps get the safe subset.
   */
  const buildStepMenuItems = (
    block: DocumentSentenceBlock,
    opts?: DocumentRenderOptions,
  ): readonly DocumentStepMenuItem[] => {
    if (!interactive) return [];
    const id = block.nodeId;
    const items: DocumentStepMenuItem[] = [
      {
        key: "configure",
        testId: `document-step-configure-${id}`,
        label: "Configure step",
        onSelect: () => handleConfigureStep(id),
      },
    ];
    if (block.nodeKind !== "trigger") {
      items.push({
        key: "duplicate",
        testId: `document-step-duplicate-${id}`,
        label: "Duplicate step",
        onSelect: () => handleDuplicateStep(id),
      });
    }
    if (opts?.selectable === true) {
      if (block.nodeKind !== "trigger") {
        items.push(
          {
            key: "move-earlier",
            testId: `document-step-move-earlier-${id}`,
            label: "Move earlier",
            onSelect: () => handleMoveStep(id, "earlier"),
          },
          {
            key: "move-later",
            testId: `document-step-move-later-${id}`,
            label: "Move later",
            onSelect: () => handleMoveStep(id, "later"),
          },
        );
      }
      if (opts.groupId) {
        items.push({
          key: "ungroup-step",
          testId: `document-step-remove-from-group-${id}`,
          label: "Move out of group",
          title: GROUP_ORGANIZATIONAL_NOTE,
          onSelect: () => handleRemoveBlockFromSection(block),
        });
      } else {
        items.push({
          key: "group",
          // Testid kept from CS-4 — same command, now reached from the menu.
          testId: `document-wrap-section-${id}`,
          label: "Group steps",
          title: GROUP_ORGANIZATIONAL_NOTE,
          onSelect: () => handleWrapBlock(block),
        });
        if (opts.addToGroup) {
          items.push({
            key: "add-to-group",
            testId: `document-add-to-section-${id}`,
            label: `Add to “${opts.addToGroup.title}”`,
            title: GROUP_ORGANIZATIONAL_NOTE,
            onSelect: () => handleAddBlockToSection(block, opts.addToGroup!.id),
          });
        }
      }
      const selected = selectedIds.has(id);
      items.push({
        key: "select",
        // Testid kept from CS-6 — the selection model is unchanged; only its
        // entry point moved out of the marker rail.
        testId: `document-select-${id}`,
        label: selected ? "Deselect step" : "Select step",
        checked: selected,
        onSelect: () => toggleSelect(id),
      });
    }
    items.push({
      key: "delete",
      testId: `document-step-delete-${id}`,
      label: "Delete step",
      onSelect: () => handleDeleteStep(id),
    });
    return items;
  };

  const renderBlocks = (
    blocks: readonly DocumentBlock[],
    opts?: DocumentRenderOptions,
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
            menuItems={buildStepMenuItems(block, opts)}
          />,
        );
        if (stop?.nodeId === block.nodeId) out.push(renderStopEditor(block.nodeId));
        // CS-6 — the "+" opens the Step / Branch / Ask React menu (no Loop, and
        // no grouping — that lives in the per-step overflow menu). Router is
        // offered only where placement is valid (tail); between two nodes it is
        // refused (locked rule) → Router omitted there.
        // DOC-STEP-CONTROLS-1 — the affordance is always painted (quiet), so an
        // insertion point between the trigger and each action is discoverable
        // without hovering.
        if (interactive && block.insertAfter && onInsertAtEdge) {
          const loc: BranchInsertLocation = {
            kind: "between",
            edgeId: block.insertAfter.edgeId,
            expectedFrom: block.nodeId,
            expectedTo: block.insertAfter.toNodeId,
          };
          out.push(
            <div key={`ins-${block.nodeId}`} className="flex justify-start pl-14">
              <DocumentInsertMenu
                testId={`document-insert-after-${block.nodeId}`}
                label="Add a step here"
                branchLocked={canUseAdvancedBranching === false}
                onStep={() => handleInsertBetween(block)}
                onIfThen={() => handleCreateBranch(loc, "if_then")}
                onAskReact={() => handleAskReactAt("after this step")}
              />
            </div>,
          );
        }
        if (interactive && block.isLinearTail && onAppendAfter) {
          const loc: BranchInsertLocation = { kind: "tail", anchorNodeId: block.nodeId };
          out.push(
            <div key={`tail-${block.nodeId}`} className="mt-1 pl-14">
              <DocumentInsertMenu
                testId={`document-add-after-${block.nodeId}`}
                label="Add a step"
                branchLocked={canUseAdvancedBranching === false}
                onStep={() => handleTailAdd(block.nodeId)}
                onIfThen={() => handleCreateBranch(loc, "if_then")}
                onRouter={() => handleCreateBranch(loc, "router")}
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
            onOpenInVisual={onOpenInVisual ? handoffToVisual : undefined}
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
          onOpenInVisual={onOpenInVisual ? handoffToVisual : undefined}
        />,
      );
      flush(block);
    }
    const dimActive = opts?.dimUnrelated === true && stop !== null;
    return groups.map(({ block, nodes }, i) => {
      const dim = dimActive && !blockContainsNode(block, stop!.nodeId);
      // CS-6 — top-level selection (never nested lane steps). DOC-STEP-CONTROLS-1
      // removed the unlabeled checkbox that used to sit ON the marker rail: the
      // selection state is now shown as a left spine on the block, and it is
      // TOGGLED from the step's overflow menu.
      const primary =
        opts?.selectable && interactive && (block.kind === "sentence" || block.kind === "fork")
          ? block.nodeId
          : null;
      const selected = primary !== null && selectedIds.has(primary);
      // DOC-REACT-AGENT-1 — a TEMPORARY agent highlight, distinct from selection.
      const agentFocused =
        agentFocusNodeId !== null && blockContainsNode(block, agentFocusNodeId);
      return (
        <div
          key={`group-${i}`}
          {...(dim ? { "data-document-dimmed": "true" } : {})}
          {...(selected ? { "data-document-selected": "true" } : {})}
          {...(agentFocused ? { "data-agent-focus": "true" } : {})}
          className="relative transition-opacity motion-reduce:transition-none"
          style={dim ? { opacity: 0.45 } : undefined}
        >
          {nodes}
        </div>
      );
    });
  };

  const renderSectionBody = (section: DocumentSection): ReactNode => (
    <div className="px-3 pb-3 pt-1">
      {renderBlocks(section.blocks, {
        dimUnrelated: true,
        markerMap: topLevelMarkers,
        selectable: true,
        groupId: section.id,
      })}
    </div>
  );

  const sectionContainsActiveStop = (section: DocumentSection): boolean =>
    stop !== null && section.blocks.some((b) => blockContainsNode(b, stop.nodeId));

  const renderSectionedRows = (rows: readonly SectionedRow[]): ReactNode => {
    // Find, for each loose block, whether a group is immediately adjacent so the
    // step menu's "Add to <group>" entry can extend a contiguous group.
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
              autoEditName={namingGroupId === section.id}
              onAutoEditNameHandled={clearNamingGroup}
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
          {renderBlocks([row.block], {
            dimUnrelated: true,
            markerMap: topLevelMarkers,
            selectable: true,
            ...(adjacent ? { addToGroup: adjacent } : {}),
          })}
        </Fragment>
      );
    });
  };

  // DOC-REACT-AGENT-1 — ONE workspace element, rendered in both the empty and
  // the populated document so the agent is always reachable from the same place.
  const agentWorkspace = interactive && onAgentSubmit ? (
    <DocumentAgentWorkspace
      expanded={agentExpanded === true}
      onExpandedChange={(next) => onAgentExpandedChange?.(next)}
      busy={agentBusy === true}
      hasConversation={agentHasConversation === true}
      context={agentContext}
      onClearContext={clearAgentContext}
      onSubmit={(prompt) => onAgentSubmit(prompt, agentContext)}
      {...(onAgentCheckWorkflow ? { onCheckWorkflow: onAgentCheckWorkflow } : {})}
      changes={proposalChanges}
      onFocusChange={focusAgentReference}
      {...(proposalChanges.length > 0
        ? {
            proposalActions: (
              <button
                type="button"
                data-testid="document-agent-review-changes"
                onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
                className="crv2-agent-ref"
              >
                Review changes
              </button>
            ),
          }
        : {})}
      statusMessage={agentStatusMessage}
      {...(agentSeed ? { seed: agentSeed } : {})}
    >
      {agentTranscript}
    </DocumentAgentWorkspace>
  ) : null;

  return (
    <div
      // CS-7B — `data-document-surface` scopes the warm "paper" token remap
      // (app/globals.css). Everything inside becomes the calm editorial document
      // vocabulary; the app shell (header/rails/canvas) keeps neutral tokens.
      data-document-surface=""
      data-testid="document-view"
      data-projection-tier={model.tier}
      className="relative flex min-h-0 flex-1"
      style={{ background: "var(--builder-bg)" }}
      aria-label="Workflow document"
    >
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {/* DOC-RAIL-LAYOUT-1 — with the Agent rail collapsed by default the
            Document owns the whole workspace: the readable column is centered
            at a moderately wider prose width (860px, was 720px — never
            edge-to-edge), and the top padding is tightened so a small
            workflow sits high instead of stranded mid-canvas. */}
        <div className="mx-auto max-w-[860px] px-6 pb-16 pt-6 sm:px-10">
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
              {...(previewDestructive ? { destructive: previewDestructive } : {})}
              {...(onOpenInVisual ? { onOpenInVisual: () => handoffToVisual(null) } : {})}
            />
          ) : null}
          {interactive && !model.empty ? (
            <>
              <FinishSetupBanner
                state={bannerState}
                queueActive={finishSetup.active}
                onFinishSetup={finishSetup.start}
                onOpenMap={() => {
                  emitDocumentBuilderEvent("document_map_opened");
                  setMapOpen(true);
                }}
                {...(onOpenInVisual ? { onOpenInVisual: () => handoffToVisual(null) } : {})}
              />
              <FinishSetupControls queue={finishSetup} />
            </>
          ) : null}
          {model.empty ? (
            <>
            <DocumentEmptyState
              {...(onAskReact ? { onAskReact: askReactFromEmpty } : {})}
              {...(onStartWithTrigger ? { onStartWithTrigger } : {})}
            />
            {/* DOC-REACT-AGENT-1 — an EMPTY document still needs somewhere for
                React to answer: the workspace renders here too, so the hero
                composer's request has a visible reply and follow-ups stay in
                the same one conversation. */}
            {agentWorkspace}
            </>
          ) : (
            <>
              {/* CS-7B — editorial masthead: calm eyebrow + serif workflow title
                  (the approved Document mock), replacing the engineering-style
                  "document view" note. The setup banner above carries status. */}
              <div
                data-testid="document-masthead"
                className="mb-6"
              >
                <div
                  className="builder-mono m-0 text-[10.5px] uppercase tracking-[0.16em]"
                  style={{ color: "var(--builder-muted-2)" }}
                >
                  Workflow
                </div>
                <h1
                  data-testid="document-title"
                  className="crv2-doc-prose m-0 mt-1.5 text-[32px] font-medium leading-[1.1] tracking-[-0.02em]"
                  style={{ color: "var(--builder-text)" }}
                >
                  {(workflowTitle ?? "").trim() || "Untitled workflow"}
                </h1>
              </div>
              {renderSectionedRows(
                groupBlocksIntoSections(model.blocks, pendingPresentation).rows,
              )}
              {/* CS-6 — persistent, unobtrusive entry to the ONE agent. */}
              {agentWorkspace}
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
