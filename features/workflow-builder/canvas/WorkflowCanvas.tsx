"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useStore,
  type Connection,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeMouseHandler,
  type OnEdgesChange,
  type OnNodeDrag,
  type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  computeBranchHandleLabels,
  labelFromBranchHandle,
} from "../utils/branchHandles";
import { resolveNonOverlappingDrop } from "../utils/workflowLayout";

import { useGraphSlice } from "../state/graphSlice";
import { useConfigSlice } from "../state/configSlice";
import { useCanvasNodeDeletion } from "../hooks/useCanvasNodeDeletion";
import { useCanvasNodeFocus } from "../hooks/useCanvasNodeFocus";
import { useFitViewOnPreview } from "../hooks/useFitViewOnPreview";
import { DeleteNodeConfirmDialog } from "../panels/DeleteNodeConfirmDialog";
import {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_NODE_TYPE,
  flowNodePositionPatch,
  previewDiffToFlowEdges,
  previewDiffToFlowNodes,
  workflowEdgesToFlowEdges,
  workflowNodesToFlowNodes,
  type WorkflowNodeData,
} from "./adapters";
import type { PreviewDiffGraph } from "../utils/buildPreviewDiffGraph";
import type { BuilderLayoutMode } from "../layout/builderLayoutPolicy";
import { EmptyCanvasState } from "./EmptyCanvasState";
import { NoTriggerRecoveryBanner } from "./NoTriggerRecoveryBanner";
import { ConnectionHintBanner } from "./ConnectionHintBanner";
import { BuilderNodeActionsProvider } from "./nodeActionsContext";
import { CanvasActionBar } from "./CanvasActionBar";
import { WorkflowEdge } from "./WorkflowEdge";
import { WorkflowNodeCard } from "./WorkflowNodeCard";

/**
 * ReactFlow canvas surface for the workflow builder.
 *
 * Slice 3.5 — first canvas surface for V2.
 * Slice 4.BUILDER-DESIGN-PARITY-1 — wraps the canvas in the dense
 * Anthropic ChainV2 chrome: an above-canvas action bar (Builder /
 * Run history / Schema / Settings tab segment + env tag chips + the
 * "Add action" CTA), the design's dotted grid background (two layered
 * dot grids via `.builder-dot-grid`), and the built-in ReactFlow
 * MiniMap restyled to read against the Anthropic palette.
 *
 * Behavior is unchanged: graphSlice is still the single source of
 * truth for nodes/edges; drag-stop commits position via the slice;
 * connect / delete / select all flow through the existing actions.
 *
 * Boundary rules:
 *   - The new action bar's secondary tabs (Run history / Schema /
 *     Settings) render as disabled placeholders — V2 doesn't have
 *     those routed inside the builder yet. They exist so the layout
 *     reads correctly without faking interactions.
 *   - The "Add action" button is exposed via the `onAddAction`
 *     callback so the parent (`WorkflowBuilder`) wires it to its
 *     `AddNodePanel` state machine. Disabled until a trigger exists.
 */

interface Props {
  providerLabels?: Readonly<Record<string, string>>;
  /**
   * Optional map of provider id → public SVG icon URL.
   */
  providerIcons?: Readonly<Record<string, string>>;
  /**
   * Invoked by the "add a trigger" CTA. Wired by WorkflowBuilder to
   * `openTriggerPicker`. Serves BOTH surfaces that need to add a trigger:
   * the empty-state card (truly-empty canvas) and the no-trigger recovery
   * banner (Slice 4.BUILDER-TRIGGER-RECOVERY-1 — nodes exist but the
   * trigger was deleted).
   */
  onAddTrigger?: () => void;
  /**
   * Slice 4.BUILDER-ADD-FLOW-1 — fires when the user clicks the
   * insert-plus button on an edge.
   */
  onEdgePlusClick?: (edgeId: string) => void;
  /**
   * Slice 4.BUILDER-DESIGN-PARITY-1 — fires when the user clicks the
   * "Add action" CTA in the canvas action bar. WorkflowBuilder wires
   * this to its `openActionPicker` callback. When undefined, the
   * button is hidden (preserves test-isolation rendering).
   */
  onAddAction?: () => void;
  /**
   * Slice 4.BUILDER-DESIGN-PARITY-1 — when false, the Add action CTA
   * is rendered disabled with a "needs a trigger first" tooltip,
   * matching the WorkflowBuilder's existing pre-trigger gating.
   */
  canAddAction?: boolean;
  /**
   * Slice 4.BUILDER-CANVAS-LAYOUT-1 — re-lays the whole graph into a clean,
   * non-overlapping layout. Wired to `graphSlice.autoLayout`. Slice 4.BUILDER-
   * CANVAS-ERGONOMICS-FIX-1 moved this control into the bottom-left zoom/fit
   * cluster (a ReactFlow `ControlButton`); when undefined it's hidden.
   */
  onArrange?: () => void;
  /**
   * Slice 4.BUILDER-CANVAS-ERGONOMICS-FIX-1 — append a new action AFTER a
   * specific node (the per-node tail "+"). Branch-specific: the node id names the
   * exact branch end to extend, so an append never guesses.
   */
  onAppendAfterNode?: (nodeId: string) => void;
  /**
   * Slice 4.BUILDER-CANVAS-ERGONOMICS-FIX-1 — why the top-right "Add action" CTA
   * is disabled, so the tooltip can redirect the user. `"multiple-tails"` means
   * the workflow has split branches and the user must use a branch's own "+".
   */
  addActionBlockedReason?: "no-trigger" | "multiple-tails";
  /**
   * BUILDER-EMPTY-STATE-TEMPLATES-1 — opens the in-builder templates modal
   * from the empty-state card. Absent (local-only) -> the card's button
   * renders disabled.
   */
  onImportTemplate?: () => void;
  /**
   * BUILDER-READINESS — required-field metadata per `provider:type`. Threaded
   * into the node adapter so a node missing a required field renders the
   * "Needs setup" chip instead of "Ready". Optional (no map → prior behavior).
   */
  requiredFieldsByType?: import("../validation/collectBuilderValidationIssues").RequiredFieldsByType;
  /**
   * CONFIG-UX-NODE-SUMMARY-1 — display-safe field metadata per `provider:type`. Threaded into the
   * node adapter so a configured node's card can show its at-a-glance summary line. Optional (no
   * map → prior behavior, no summary line).
   */
  summaryFieldsByType?: import("@/core/workflows/nodeSummaryFields").NodeSummaryFieldsByType;
  /**
   * CONFIG-UX-NODE-SUMMARY-1 — resource label cache snapshot, subscribed by `WorkflowBuilder` and
   * threaded down so the adapter stays pure. Absent ⇒ no resource names resolved ⇒ no summary line.
   */
  resourceLabels?: Readonly<Record<string, string>>;
  /**
   * HERMES-AGENT-PREVIEW-CANVAS-STATE-AND-FIT — a per-show token from `WorkflowBuilder`: `null` when no
   * AI preview overlay is active, and a NEW number each time a preview is shown. When non-null the
   * canvas (a) hides the empty-state "Choose a trigger" card so the holographic preview reads clearly,
   * and (b) fits the viewport once around the current graph. Visual only — no draft mutation.
   */
  previewToken?: number | null;
  /**
   * HERMES-AGENT-PREVIEW-DIFF-GRAPH — when set, the canvas renders this SINGLE composed diff graph
   * (current draft + candidate, tagged added/removed/changed/unchanged) READ-ONLY, INSTEAD of the live
   * editable graph — never a translucent overlay stacked on top. Cleared on Discard. Apply/Discard live
   * in the preview control bar (`WorkflowBuilder`). Visual only; no draft mutation while it's shown.
   */
  previewDiff?: PreviewDiffGraph | null;
  /**
   * BUILDER-RESPONSIVE-LAYOUT-1 — the resolved layout tier, passed down rather than measured here
   * so the canvas stays presentational and the builder keeps ONE viewport subscription. Only the
   * minimap's footprint depends on it today. Defaults to `wide`, i.e. the pre-slice behaviour.
   */
  layoutMode?: BuilderLayoutMode;
}

const NODE_TYPES = {
  [WORKFLOW_NODE_TYPE]: WorkflowNodeCard,
};

const EDGE_TYPES = {
  [WORKFLOW_EDGE_TYPE]: WorkflowEdge,
};

export function WorkflowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function WorkflowCanvasInner({
  providerLabels,
  providerIcons,
  onAddTrigger,
  onEdgePlusClick,
  onAddAction,
  canAddAction,
  onArrange,
  onAppendAfterNode,
  addActionBlockedReason,
  onImportTemplate,
  requiredFieldsByType,
  summaryFieldsByType,
  resourceLabels,
  previewToken,
  previewDiff,
  layoutMode = "wide",
}: Props) {
  const previewDiffActive = previewDiff != null;
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  const updateNodePosition = useGraphSlice((s) => s.updateNodePosition);
  const connectNodes = useGraphSlice((s) => s.connectNodes);
  const removeEdge = useGraphSlice((s) => s.removeEdge);
  const renameNode = useGraphSlice((s) => s.renameNode);

  const openNode = useConfigSlice((s) => s.openNode);
  const activeNodeId = useConfigSlice((s) => s.activeNodeId);

  // Slice 4.AI-REPAIR-2F — pan/zoom the viewport to a node when a "Go to field"
  // reveal is requested (configSlice canvas-focus signal). Navigation only.
  useCanvasNodeFocus();

  // HERMES-AGENT-PREVIEW-CANVAS-STATE-AND-FIT — fit the viewport once each time a preview is shown.
  // Navigation only; no draft mutation. `null` when no preview is active.
  useFitViewOnPreview(previewToken ?? null);
  const previewActive = previewToken !== null && previewToken !== undefined;

  // Slice 4.BUILDER-NODE-DELETE-2 — keyboard-delete state machine. Owns
  // the dialog state + the onBeforeDelete handler that gates ReactFlow's
  // auto-delete. Replaces the previous handleNodesDelete which dispatched
  // graphSlice.removeNode directly (no rewire, no confirmation, no
  // multi-edge guard).
  const {
    pendingDelete,
    handleBeforeDelete,
    handleConfirm: handleConfirmDelete,
    handleCancel: handleCancelDelete,
    requestDelete,
  } = useCanvasNodeDeletion();

  // Slice 4.BUILDER-NODE-QUICK-ACTIONS-1 / ERGONOMICS-FIX-1 — ambient rename /
  // delete / append-after handlers for the node cards. `renameNode` is a stable
  // slice action; `requestDelete` opens the existing confirmation dialog;
  // `onAppendAfterNode` opens the action picker targeted at a branch end.
  // Memoized so node `data` identity stays stable.
  const nodeActions = useMemo(
    () => ({
      onRenameNode: renameNode,
      onRequestDeleteNode: requestDelete,
      ...(onAppendAfterNode ? { onAppendAfter: onAppendAfterNode } : {}),
    }),
    [renameNode, requestDelete, onAppendAfterNode],
  );

  // Slice 4.BUILDER-CANVAS-ERGONOMICS-FIX-1 — tail nodes (no outgoing edge) get an
  // "add next step" `+`. Derived once from the edge list and threaded to the node
  // adapter so the card knows it's a chain/branch end.
  const tailNodeIds = useMemo(() => {
    const withOutgoing = new Set(pendingEdges.map((e) => e.from));
    return new Set(pendingNodes.filter((n) => !withOutgoing.has(n.id)).map((n) => n.id));
  }, [pendingNodes, pendingEdges]);

  // BRANCH-ENT-1 C4 — per-node branch route handles (If/Then true/false,
  // Router route labels). Computed once from nodes+edges and threaded to
  // BOTH adapters so node handles and edge sourceHandle ids always agree.
  const branchHandleLabels = useMemo(
    () => computeBranchHandleLabels(pendingNodes, pendingEdges),
    [pendingNodes, pendingEdges],
  );

  const pendingDeleteNode =
    pendingDelete?.kind === "single"
      ? pendingNodes.find((n) => n.id === pendingDelete.nodeId)
      : undefined;

  const flowNodes = useMemo<FlowNode<WorkflowNodeData>[]>(() => {
    // HERMES-AGENT-PREVIEW-DIFF-GRAPH — in preview mode the canvas shows ONE composed diff graph
    // (read-only) instead of the live editable graph; no overlay, no selection highlight.
    if (previewDiff) {
      return previewDiffToFlowNodes(previewDiff, {
        providerLabels,
        providerIcons,
        requiredFieldsByType,
        summaryFieldsByType,
        resourceLabels,
      });
    }
    const base = workflowNodesToFlowNodes(pendingNodes, {
      providerLabels,
      providerIcons,
      requiredFieldsByType,
      summaryFieldsByType,
      resourceLabels,
      tailNodeIds,
      branchHandleLabels,
    });
    if (!activeNodeId) return base;
    // BUILDER-CANVAS-ZOOM-FOCUS-1 — `configOpen` marks the node whose config panel is open so the
    // card can pulse. Kept separate from `selected`, which React Flow also sets for a plain canvas
    // click; the pulse should follow what you are EDITING, not what you last clicked.
    return base.map((n) =>
      n.id === activeNodeId
        ? { ...n, selected: true, data: { ...n.data, configOpen: true } }
        : n,
    );
  }, [previewDiff, pendingNodes, providerLabels, providerIcons, requiredFieldsByType, summaryFieldsByType, resourceLabels, tailNodeIds, branchHandleLabels, activeNodeId]);

  const flowEdges = useMemo<FlowEdge[]>(
    () =>
      previewDiff
        ? previewDiffToFlowEdges(previewDiff)
        : workflowEdgesToFlowEdges(pendingEdges, {
            onEdgePlusClick,
            branchHandleLabels,
          }),
    [previewDiff, pendingEdges, onEdgePlusClick, branchHandleLabels],
  );

  // BUILDER-CANVAS-NODE-DRAG-UX-AUDIT-1 — React Flow must be a CONTROLLED flow with an
  // `onNodesChange` handler for drag/measurement changes to apply live. Previously
  // `nodes` was bound straight to the slice-derived `flowNodes` with no `onNodesChange`,
  // so RF could not move a node during a drag — the node only jumped to its final spot
  // when `onNodeDragStop` wrote `pendingNodes`. We now hold RF's working node array in
  // local state, apply RF's own changes to it on every pointer move (live movement), and
  // re-sync from `flowNodes` whenever the slice changes (add / remove / rename / config /
  // selection / the resolved drag-stop position). The graph slice stays the source of
  // truth and is written ONLY at `onNodeDragStop` — so a drag never triggers slice
  // subscribers (readiness, AI, autosave) per mousemove; it just re-renders the canvas.
  const [rfNodes, setRfNodes] = useState<FlowNode<WorkflowNodeData>[]>(flowNodes);
  useEffect(() => {
    setRfNodes(flowNodes);
  }, [flowNodes]);
  const onNodesChange = useCallback<OnNodesChange<FlowNode<WorkflowNodeData>>>(
    (changes) => setRfNodes((current) => applyNodeChanges(changes, current)),
    [],
  );

  // RECONV-1 S4 — same controlled-flow rule for EDGES. `edges` was bound
  // straight to the slice-derived `flowEdges` with no `onEdgesChange`, so React
  // Flow's edge SELECTION changes were silently dropped — an edge could never
  // become selected, which made the documented edges-only keyboard-delete
  // contract (useCanvasNodeDeletion: "edges-only → proceed → onEdgesDelete →
  // removeEdge") unreachable and left authors with no way to disconnect a
  // mis-drawn edge (required for any diverge/reconverge rewiring). RF's working
  // edge array now lives in local state (selection applies live); the graph
  // slice stays the source of truth — structural changes still flow through
  // onConnect / onEdgesDelete, and `flowEdges` re-syncs this state on change.
  const [rfEdges, setRfEdges] = useState<FlowEdge[]>(flowEdges);
  useEffect(() => {
    setRfEdges(flowEdges);
  }, [flowEdges]);
  const onEdgesChange = useCallback<OnEdgesChange<FlowEdge>>(
    (changes) => setRfEdges((current) => applyEdgeChanges(changes, current)),
    [],
  );

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      const wfNode = pendingNodes.find((n) => n.id === node.id);
      if (!wfNode) return;
      openNode({ nodeId: wfNode.id, initialValues: wfNode.config });
    },
    [pendingNodes, openNode],
  );

  const handleNodeDragStop = useCallback<OnNodeDrag>(
    (_event, node) => {
      const { nodeId, position } = flowNodePositionPatch(node);
      // Slice 4.BUILDER-CANVAS-ERGONOMICS-FIX-1 — nodes must never overlap, including
      // after a manual drag. Resolve the drop against every OTHER node before
      // persisting: a clear drop is kept as-is; a drop on top of a node steps down
      // to the nearest clear slot. Read the live nodes (not a stale closure) so a
      // multi-drag session resolves against the latest positions.
      const others = useGraphSlice
        .getState()
        .pendingNodes.filter((n) => n.id !== nodeId);
      const resolved = resolveNonOverlappingDrop(position, others);
      updateNodePosition(nodeId, resolved);
    },
    [updateNodePosition],
  );

  // BUILDER-CANVAS-CONNECTION-UX-AUDIT-1 — surface WHY an invalid connection was
  // refused. `connectNodes` stays the single source of validation truth (self-loop /
  // duplicate / unknown node); a rejected attempt used to snap back silently. We now
  // catch its error and show its message as a transient hint. (Trigger nodes have no
  // target handle, so action→trigger / trigger→trigger can't even be dragged.)
  const [connectionHint, setConnectionHint] = useState<string | null>(null);
  const handleConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      try {
        // BRANCH-ENT-1 C4 — the handle the user dragged from IS the route:
        // `branch:<label>` handles persist edge.label; the Always/default
        // handle creates an unlabeled cleanup edge.
        const label = labelFromBranchHandle(conn.sourceHandle);
        connectNodes({
          from: conn.source,
          to: conn.target,
          ...(label !== undefined ? { label } : {}),
        });
        setConnectionHint(null); // valid connect clears any stale hint
      } catch (err) {
        setConnectionHint(
          err instanceof Error
            ? err.message
            : "That connection isn't allowed.",
        );
      }
    },
    [connectNodes],
  );

  // Auto-dismiss the connection hint a few seconds after it appears (single concern:
  // the hint's own lifetime). Re-arms on each new/distinct message via the dep.
  useEffect(() => {
    if (!connectionHint) return;
    const timer = setTimeout(() => setConnectionHint(null), 4000);
    return () => clearTimeout(timer);
  }, [connectionHint]);

  const handleEdgesDelete = useCallback(
    (deleted: FlowEdge[]) => {
      for (const edge of deleted) {
        removeEdge(edge.id);
      }
    },
    [removeEdge],
  );

  const isEmpty = pendingNodes.length === 0;
  // Slice 4.BUILDER-TRIGGER-RECOVERY-1 — a workflow needs a trigger to run.
  // When the canvas has nodes but none is a trigger (e.g. the user deleted
  // the trigger while actions remain) we surface a compact recovery banner
  // instead of leaving the user stranded with no "add trigger" affordance.
  const hasTrigger = pendingNodes.some((n) => n.kind === "trigger");
  const showRecoveryBanner = !isEmpty && !hasTrigger;

  return (
    <BuilderNodeActionsProvider value={nodeActions}>
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CanvasActionBar
        onAddAction={onAddAction}
        canAddAction={canAddAction}
        addActionBlockedReason={addActionBlockedReason}
      />
      <div
        aria-label="Workflow canvas"
        data-testid="workflow-canvas"
        data-preview-diff={previewDiffActive ? "true" : undefined}
        /*
          BUILDER-RESPONSIVE-LAYOUT-1 — the `min-h-[560px]` floor is gone.
          It was a hard MINIMUM inside a parent that clips (`overflow-hidden`),
          so on any viewport with less than ~560px of workspace left — a 900×700
          window once the header, tab row and a banner are accounted for, or a
          phone in landscape — the canvas grew past its parent and React Flow's
          bottom-left zoom/fit/Arrange cluster was clipped clean off the screen
          with no way to scroll to it. `min-h-0 flex-1` lets the canvas be
          exactly as tall as the workspace actually is; React Flow's own
          ResizeObserver picks up the new height and keeps the controls in view.
        */
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ width: "100%", background: "var(--builder-bg)" }}
      >
        <div
          aria-hidden
          className="builder-dot-grid pointer-events-none absolute inset-0"
        />
        {/* BUILDER-TABS-HEADER-1 — the canvas is now builder-content only; the
            Runs / Data Map / History / Settings panels render at the
            WorkflowBuilder level (header tab strip), in BOTH view modes. */}
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          // HERMES-AGENT-PREVIEW-DIFF-GRAPH — the diff preview is a READ-ONLY visualization: no select /
          // drag / connect / delete / node-open while it's shown (Apply/Discard live in the control bar).
          nodesDraggable={!previewDiffActive}
          nodesConnectable={!previewDiffActive}
          elementsSelectable={!previewDiffActive}
          onNodeClick={previewDiffActive ? undefined : handleNodeClick}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={previewDiffActive ? undefined : handleNodeDragStop}
          onConnect={previewDiffActive ? undefined : handleConnect}
          onBeforeDelete={previewDiffActive ? undefined : handleBeforeDelete}
          onEdgesDelete={previewDiffActive ? undefined : handleEdgesDelete}
          fitView
          proOptions={{ hideAttribution: true }}
          style={{ background: "transparent" }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            // Transparent — the .builder-dot-grid behind handles the dots.
            color="transparent"
          />
          <Controls
            showInteractive={false}
            style={{
              background: "var(--builder-panel)",
              border: "1px solid var(--builder-border)",
              borderRadius: 6,
              boxShadow: "var(--builder-shadow-sm)",
            }}
          >
            {/* BUILDER-CANVAS-ERGONOMICS-FIX-1 — Arrange lives beside zoom/fit in the
                bottom-left control cluster (moved out of the top action bar). */}
            {onArrange ? (
              <ControlButton
                onClick={onArrange}
                disabled={isEmpty}
                data-testid="canvas-arrange-button"
                aria-label="Arrange"
                title="Arrange the workflow into a clean, non-overlapping layout"
              >
                <ArrangeIcon />
              </ControlButton>
            ) : null}
          </Controls>
          <ZoomAwareMiniMap mode={layoutMode} />
        </ReactFlow>
        {/* HERMES-AGENT-PREVIEW-CANVAS-STATE-AND-FIT — while an AI preview overlay is active, hide the
            empty-state card so the holographic proposed nodes read clearly (the card returns on
            Discard if the graph is still empty). Normal empty draft mode is unaffected. */}
        {isEmpty && !previewActive && !previewDiffActive ? <EmptyCanvasState onAddTrigger={onAddTrigger} {...(onImportTemplate ? { onImportTemplate } : {})} /> : null}
        {showRecoveryBanner ? (
          <NoTriggerRecoveryBanner onChooseTrigger={onAddTrigger} />
        ) : null}
        <ConnectionHintBanner
          message={connectionHint}
          onDismiss={() => setConnectionHint(null)}
        />
      </div>
      {pendingDelete !== null ? (
        <DeleteNodeConfirmDialog
          {...(pendingDelete.kind === "single"
            ? {
                node: pendingDeleteNode,
                preview: pendingDelete.preview,
              }
            : { multiSelectCount: pendingDelete.count })}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      ) : null}
    </div>
    </BuilderNodeActionsProvider>
  );
}

/**
 * BUILDER-CANVAS-ZOOM-FOCUS-1 — the minimap, hidden while the canvas is zoomed in.
 *
 * The minimap earns its space when you are zoomed OUT and need to know where you are in a large
 * workflow. Zoomed IN — which is exactly what opening a node's config does — you are working on one
 * node, and the minimap becomes a bright rectangle sitting over the corner of the canvas you are
 * trying to look at. It hides above the threshold and comes straight back when you zoom out.
 *
 * The threshold sits above any zoom `fitView` can produce (React Flow caps fitView at 1.0) and
 * below the config-open floor of 1.4, so a normal fitted canvas always shows it and a
 * config-open / reveal zoom always hides it.
 */
export const MINIMAP_HIDE_ZOOM = 1.2;

/**
 * Whether the minimap shows, given the current zoom and the current layout tier. A pure predicate
 * of CURRENT state with no memory, which is what makes the minimap reappear the moment the user
 * zooms back out — a latched "hidden once we zoomed in" flag would be a worse bug than the overlap
 * it fixed.
 *
 * BUILDER-RESPONSIVE-LAYOUT-1 — the minimap is also hidden outright at the narrow tier. It is a
 * fixed-size overlay in the canvas's bottom-right corner, so on a 390px-wide canvas it covered a
 * large share of the very surface it is supposed to help you navigate, while telling you almost
 * nothing at that scale. Pan and pinch-zoom remain the navigation on a phone; the minimap returns
 * as soon as there is a canvas big enough for it to be worth its footprint.
 */
export function shouldShowMiniMap(
  zoom: number,
  mode: BuilderLayoutMode = "wide",
): boolean {
  if (mode === "narrow") return false;
  return zoom < MINIMAP_HIDE_ZOOM;
}

function ZoomAwareMiniMap({ mode }: { mode: BuilderLayoutMode }) {
  // Subscribe to the live viewport scale rather than reading it once — this must react to wheel
  // zoom and the zoom buttons, not only to a programmatic setCenter.
  const zoom = useStore((s) => s.transform[2]);
  if (!shouldShowMiniMap(zoom, mode)) return null;
  return (
    <MiniMap
      data-testid="workflow-canvas-minimap"
      pannable
      zoomable
      style={{
        background: "var(--builder-panel)",
        border: "1px solid var(--builder-border)",
        borderRadius: 6,
      }}
      maskColor="rgba(0,0,0,0.06)"
      nodeColor={() => "var(--builder-muted-2)"}
    />
  );
}

/**
 * BUILDER-CANVAS-ERGONOMICS-FIX-1 — the Arrange glyph for the bottom-left control
 * button (tidy rows). Inherits `currentColor` so it matches ReactFlow's control
 * icon styling.
 */
function ArrangeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="5" rx="1" />
      <rect x="9" y="16" width="6" height="5" rx="1" />
      <path d="M12 8v8" />
    </svg>
  );
}
