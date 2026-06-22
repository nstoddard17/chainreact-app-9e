"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeMouseHandler,
  type OnNodeDrag,
  type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

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
  workflowEdgesToFlowEdges,
  workflowNodesToFlowNodes,
  type WorkflowNodeData,
} from "./adapters";
import { EmptyCanvasState } from "./EmptyCanvasState";
import { NoTriggerRecoveryBanner } from "./NoTriggerRecoveryBanner";
import { ConnectionHintBanner } from "./ConnectionHintBanner";
import { BuilderNodeActionsProvider } from "./nodeActionsContext";
import { BuilderTabPlaceholder, type BuilderTab } from "./BuilderTabPlaceholder";
import { DataMapPanel } from "./DataMapPanel";
import { RunsPanel } from "./RunsPanel";
import { SettingsPanel, type WorkflowSettingsMeta } from "./SettingsPanel";
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
   * Optional trigger-tag chip text (e.g. "trigger: slack.message"). The
   * canvas action bar renders it next to the env tag. Omitted when no
   * trigger is configured.
   */
  triggerTagText?: string;
  /**
   * BUILDER-READINESS — required-field metadata per `provider:type`. Threaded
   * into the node adapter so a node missing a required field renders the
   * "Needs setup" chip instead of "Ready". Optional (no map → prior behavior).
   */
  requiredFieldsByType?: import("../validation/collectBuilderValidationIssues").RequiredFieldsByType;
  /**
   * Slice 4.BUILDER-SETTINGS-MVP-1 — workflow-level metadata for the top-level
   * Settings tab (the `WorkflowDetail` subset threaded from `WorkflowBuilder`).
   * Optional so isolated canvas tests keep passing; the Settings tab still
   * renders graph-derived rows (counts / trigger / save status) without it.
   */
  workflowSettings?: WorkflowSettingsMeta;
  /**
   * HERMES-AGENT-PREVIEW-CANVAS-STATE-AND-FIT — a per-show token from `WorkflowBuilder`: `null` when no
   * AI preview overlay is active, and a NEW number each time a preview is shown. When non-null the
   * canvas (a) hides the empty-state "Choose a trigger" card so the holographic preview reads clearly,
   * and (b) fits the viewport once around the current graph. Visual only — no draft mutation.
   */
  previewToken?: number | null;
  /**
   * WF-RUNPERM — true when the viewer may NOT run/edit this workflow (private
   * credential). Threaded into the Runs tab so its "Run again" affordance hides,
   * matching the header's run controls. The run-now route enforces the same
   * policy server-side regardless.
   */
  runEditBlocked?: boolean;
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
  triggerTagText,
  requiredFieldsByType,
  workflowSettings,
  previewToken,
  runEditBlocked,
}: Props) {
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  const updateNodePosition = useGraphSlice((s) => s.updateNodePosition);
  const connectNodes = useGraphSlice((s) => s.connectNodes);
  const removeEdge = useGraphSlice((s) => s.removeEdge);
  const renameNode = useGraphSlice((s) => s.renameNode);

  const openNode = useConfigSlice((s) => s.openNode);
  const activeNodeId = useConfigSlice((s) => s.activeNodeId);

  // Slice 4.BUILDER-SHELL-TABS-1 — top tabs: Builder | Runs | Data Map | Settings.
  // "builder" shows the canvas; the others show a polished empty-state panel until
  // their real systems land (no dead tabs). Local to the center workspace — the
  // left rail / right drawer are unaffected by this first slice.
  const [activeTab, setActiveTab] = useState<BuilderTab>("builder");

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

  const pendingDeleteNode =
    pendingDelete?.kind === "single"
      ? pendingNodes.find((n) => n.id === pendingDelete.nodeId)
      : undefined;

  const flowNodes = useMemo<FlowNode<WorkflowNodeData>[]>(() => {
    const base = workflowNodesToFlowNodes(pendingNodes, {
      providerLabels,
      providerIcons,
      requiredFieldsByType,
      tailNodeIds,
    });
    if (!activeNodeId) return base;
    return base.map((n) =>
      n.id === activeNodeId ? { ...n, selected: true } : n,
    );
  }, [pendingNodes, providerLabels, providerIcons, requiredFieldsByType, tailNodeIds, activeNodeId]);

  const flowEdges = useMemo<FlowEdge[]>(
    () => workflowEdgesToFlowEdges(pendingEdges, { onEdgePlusClick }),
    [pendingEdges, onEdgePlusClick],
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
        connectNodes({ from: conn.source, to: conn.target });
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
  const nodeCountText = `${pendingNodes.length} node${pendingNodes.length === 1 ? "" : "s"} · ${pendingEdges.length} edge${pendingEdges.length === 1 ? "" : "s"}`;

  return (
    <BuilderNodeActionsProvider value={nodeActions}>
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CanvasActionBar
        nodeCountText={nodeCountText}
        triggerTagText={triggerTagText}
        onAddAction={onAddAction}
        canAddAction={canAddAction}
        addActionBlockedReason={addActionBlockedReason}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />
      <div
        aria-label="Workflow canvas"
        data-testid="workflow-canvas"
        className="relative min-h-[560px] flex-1 overflow-hidden"
        style={{ width: "100%", background: "var(--builder-bg)" }}
      >
        <div
          aria-hidden
          className="builder-dot-grid pointer-events-none absolute inset-0"
        />
        {activeTab === "builder" ? (
          <>
        <ReactFlow
          nodes={rfNodes}
          edges={flowEdges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodeClick={handleNodeClick}
          onNodesChange={onNodesChange}
          onNodeDragStop={handleNodeDragStop}
          onConnect={handleConnect}
          onBeforeDelete={handleBeforeDelete}
          onEdgesDelete={handleEdgesDelete}
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
        </ReactFlow>
        {/* HERMES-AGENT-PREVIEW-CANVAS-STATE-AND-FIT — while an AI preview overlay is active, hide the
            empty-state card so the holographic proposed nodes read clearly (the card returns on
            Discard if the graph is still empty). Normal empty draft mode is unaffected. */}
        {isEmpty && !previewActive ? <EmptyCanvasState onAddTrigger={onAddTrigger} /> : null}
        {showRecoveryBanner ? (
          <NoTriggerRecoveryBanner onChooseTrigger={onAddTrigger} />
        ) : null}
        <ConnectionHintBanner
          message={connectionHint}
          onDismiss={() => setConnectionHint(null)}
        />
          </>
        ) : activeTab === "runs" ? (
          // Slice 4.BUILDER-RUNS-TAB-1 — the Runs tab is this workflow's
          // execution history + run-detail/debugging surface. Reuses the
          // existing workflow-scoped run list/detail endpoints + the latest-run
          // poller; "Open failed step" switches back to the Builder tab so the
          // canvas reveal lands.
          <RunsPanel
            onOpenFailedStep={() => setActiveTab("builder")}
            {...(runEditBlocked !== undefined ? { runEditBlocked } : {})}
          />
        ) : activeTab === "data-map" ? (
          // Slice 4.BUILDER-DATA-MAP-MVP-1 — the Data Map tab shows a real
          // workflow data outline once actions exist; it falls back to the
          // shared empty-state panel (via BuilderTabPlaceholder) otherwise.
          <DataMapPanel providerLabels={providerLabels} />
        ) : activeTab === "settings" ? (
          // Slice 4.BUILDER-SETTINGS-MVP-1 — the Settings tab shows real
          // workflow-level metadata + behavior (read-only this slice).
          <SettingsPanel settings={workflowSettings} providerLabels={providerLabels} />
        ) : (
          <BuilderTabPlaceholder tab={activeTab} />
        )}
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
