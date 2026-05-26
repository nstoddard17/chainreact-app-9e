"use client";

import { useCallback, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useGraphSlice } from "../state/graphSlice";
import { useConfigSlice } from "../state/configSlice";
import {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_NODE_TYPE,
  flowNodePositionPatch,
  workflowEdgesToFlowEdges,
  workflowNodesToFlowNodes,
  type WorkflowNodeData,
} from "./adapters";
import { EmptyCanvasState } from "./EmptyCanvasState";
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
   * Invoked by the empty-state CTA.
   */
  onEmptyAddTrigger?: () => void;
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
   * Optional trigger-tag chip text (e.g. "trigger: slack.message"). The
   * canvas action bar renders it next to the env tag. Omitted when no
   * trigger is configured.
   */
  triggerTagText?: string;
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
  onEmptyAddTrigger,
  onEdgePlusClick,
  onAddAction,
  canAddAction,
  triggerTagText,
}: Props) {
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  const updateNodePosition = useGraphSlice((s) => s.updateNodePosition);
  const connectNodes = useGraphSlice((s) => s.connectNodes);
  const removeNode = useGraphSlice((s) => s.removeNode);
  const removeEdge = useGraphSlice((s) => s.removeEdge);

  const openNode = useConfigSlice((s) => s.openNode);
  const closeNode = useConfigSlice((s) => s.closeNode);
  const dropNodeConfigDraft = useConfigSlice((s) => s.dropNode);
  const activeNodeId = useConfigSlice((s) => s.activeNodeId);

  const flowNodes = useMemo<FlowNode<WorkflowNodeData>[]>(() => {
    const base = workflowNodesToFlowNodes(pendingNodes, {
      providerLabels,
      providerIcons,
    });
    if (!activeNodeId) return base;
    return base.map((n) =>
      n.id === activeNodeId ? { ...n, selected: true } : n,
    );
  }, [pendingNodes, providerLabels, providerIcons, activeNodeId]);

  const flowEdges = useMemo<FlowEdge[]>(
    () => workflowEdgesToFlowEdges(pendingEdges, { onEdgePlusClick }),
    [pendingEdges, onEdgePlusClick],
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
      updateNodePosition(nodeId, position);
    },
    [updateNodePosition],
  );

  const handleConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      try {
        connectNodes({ from: conn.source, to: conn.target });
      } catch {
        // Slice rejects self-loops / duplicates silently — canvas snaps back.
      }
    },
    [connectNodes],
  );

  const handleNodesDelete = useCallback(
    (deleted: FlowNode[]) => {
      for (const node of deleted) {
        dropNodeConfigDraft(node.id);
        removeNode(node.id);
      }
      if (
        activeNodeId &&
        deleted.some((n) => n.id === activeNodeId)
      ) {
        closeNode();
      }
    },
    [removeNode, dropNodeConfigDraft, activeNodeId, closeNode],
  );

  const handleEdgesDelete = useCallback(
    (deleted: FlowEdge[]) => {
      for (const edge of deleted) {
        removeEdge(edge.id);
      }
    },
    [removeEdge],
  );

  const isEmpty = pendingNodes.length === 0;
  const nodeCountText = `${pendingNodes.length} node${pendingNodes.length === 1 ? "" : "s"} · ${pendingEdges.length} edge${pendingEdges.length === 1 ? "" : "s"}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CanvasActionBar
        nodeCountText={nodeCountText}
        triggerTagText={triggerTagText}
        onAddAction={onAddAction}
        canAddAction={canAddAction}
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
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodeClick={handleNodeClick}
          onNodeDragStop={handleNodeDragStop}
          onConnect={handleConnect}
          onNodesDelete={handleNodesDelete}
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
          />
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
        {isEmpty ? <EmptyCanvasState onAddTrigger={onEmptyAddTrigger} /> : null}
      </div>
    </div>
  );
}

function CanvasActionBar({
  nodeCountText,
  triggerTagText,
  onAddAction,
  canAddAction,
}: {
  nodeCountText: string;
  triggerTagText?: string;
  onAddAction?: () => void;
  canAddAction?: boolean;
}) {
  return (
    <div
      data-testid="canvas-action-bar"
      className="flex h-9 shrink-0 items-center justify-between gap-2 px-2.5"
      style={{
        background: "var(--builder-panel)",
        borderBottom: "1px solid var(--builder-border)",
      }}
    >
      <div
        className="flex items-center gap-0.5 rounded-md p-0.5"
        role="tablist"
        style={{
          background: "var(--builder-panel-2)",
          border: "1px solid var(--builder-border)",
        }}
      >
        <CanvasTab label="Builder" active />
        <CanvasTab label="Run history" disabled />
        <CanvasTab label="Schema" disabled />
        <CanvasTab label="Settings" disabled />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="hidden items-center gap-1 md:flex">
          <Tag text="env: draft" />
          {triggerTagText ? <Tag text={triggerTagText} /> : null}
          <Tag text={nodeCountText} />
        </div>
        {onAddAction ? (
          <button
            type="button"
            onClick={onAddAction}
            disabled={canAddAction === false}
            data-testid="canvas-add-action-button"
            title={
              canAddAction === false
                ? "Add a trigger before adding actions."
                : "Add an action to the workflow"
            }
            className="inline-flex h-6 items-center gap-1.5 rounded-[4px] px-2 text-[11.5px] font-medium disabled:opacity-50"
            style={{
              background: "var(--builder-accent)",
              border: "1px solid var(--builder-accent)",
              color: "white",
            }}
          >
            + Add action
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CanvasTab({
  label,
  active,
  disabled,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active ? "true" : "false"}
      disabled={disabled}
      title={disabled ? "Coming soon" : undefined}
      className="builder-mono inline-flex h-[22px] items-center rounded-[3px] px-2 text-[11.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        background: active ? "var(--builder-panel)" : "transparent",
        boxShadow: active ? "var(--builder-shadow-sm)" : undefined,
        color: active ? "var(--builder-text)" : "var(--builder-muted)",
        border: "0",
      }}
    >
      {label}
    </button>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <span
      className="builder-mono rounded-[3px] px-1.5 py-0.5 text-[10.5px]"
      style={{
        background: "var(--builder-bg)",
        border: "1px solid var(--builder-border)",
        color: "var(--builder-muted)",
      }}
    >
      {text}
    </span>
  );
}
