"use client";

import { useCallback, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
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
  WORKFLOW_NODE_TYPE,
  flowNodePositionPatch,
  workflowEdgesToFlowEdges,
  workflowNodesToFlowNodes,
  type WorkflowNodeData,
} from "./adapters";
import { EmptyCanvasState } from "./EmptyCanvasState";
import { WorkflowNodeCard } from "./WorkflowNodeCard";

/**
 * ReactFlow canvas surface for the workflow builder.
 *
 * Slice 3.5 — first canvas surface for V2. State-of-truth invariants:
 *
 *   - graphSlice's `pendingNodes` / `pendingEdges` are the source of
 *     truth. The canvas derives FlowNode / FlowEdge arrays from them
 *     via `useMemo` and the pure adapters in `./adapters.ts`. ReactFlow
 *     never holds independent node/edge state.
 *   - User actions on the canvas dispatch to graphSlice (or
 *     configSlice for selection) — never directly to React Flow's
 *     internal store.
 *   - The same `configSlice.openNode` path used by the NodeList
 *     Configure button drives canvas node selection. Canvas and list
 *     stay in sync because they read from the same slice; selecting a
 *     node in either surface highlights it in both.
 *   - There is no hidden backend persistence here. Drag, connect, and
 *     remove operations only update graphSlice's pending* state. The
 *     toolbar Save still owns the `updateWorkflow` call (Slice 1I.2
 *     boundary preserved).
 *
 * Edge / node deletion: React Flow's built-in keyboard delete is wired
 * to `graphSlice.removeNode` / `removeEdge`. NodeList's explicit
 * Remove button continues to work — both paths funnel through the
 * same slice actions.
 *
 * Position changes: committed only on `onNodeDragStop` (drag end), not
 * on every pixel of drag. This keeps `isDirty` from flipping for
 * dragless clicks and avoids spamming the slice during a long drag.
 *
 * ReactFlowProvider wrapping: handled at this component's boundary so
 * callers don't need to know about it. The provider is required for
 * the `useStore` / `useReactFlow` hooks that React Flow internals
 * use even when we don't call them directly.
 */

interface Props {
  providerLabels?: Readonly<Record<string, string>>;
  /**
   * Optional map of provider id → public SVG icon URL. Slice 4.BUILDER-INSPECTOR-1
   * — WorkflowBuilder builds this from the `iconUrl` field on each
   * ProviderOption (sourced from `providerIconUrl()` in the registry).
   * WorkflowNodeCard renders an `<img>` when present and falls back to
   * its initials avatar on `<img onError>` or when absent.
   */
  providerIcons?: Readonly<Record<string, string>>;
  /**
   * Invoked by the empty-state CTA. WorkflowBuilder wires this to the
   * existing `+ Add trigger` button in `AddNodeMenu` via a ref so this
   * slice doesn't duplicate the add-node flow. Optional — the empty
   * state still renders without a handler.
   */
  onEmptyAddTrigger?: () => void;
}

const NODE_TYPES = {
  [WORKFLOW_NODE_TYPE]: WorkflowNodeCard,
};

export function WorkflowCanvas(props: Props) {
  // ReactFlowProvider must wrap any consumer of React Flow's hooks; the
  // canvas itself sits inside so we get a self-contained component.
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

  // Derived ReactFlow shapes. Recompute only when the slice values
  // (or provider label / icon maps) change.
  const flowNodes = useMemo<FlowNode<WorkflowNodeData>[]>(() => {
    const base = workflowNodesToFlowNodes(pendingNodes, {
      providerLabels,
      providerIcons,
    });
    if (!activeNodeId) return base;
    // Mirror the configSlice's active selection onto the canvas so a
    // node Configure'd from NodeList is highlighted here too.
    return base.map((n) =>
      n.id === activeNodeId ? { ...n, selected: true } : n,
    );
  }, [pendingNodes, providerLabels, providerIcons, activeNodeId]);

  const flowEdges = useMemo<FlowEdge[]>(
    () => workflowEdgesToFlowEdges(pendingEdges),
    [pendingEdges],
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
        // Self-loops / duplicate / unknown-endpoint connections are
        // rejected by the slice. Surfacing a toast is a later-slice
        // concern; for now we just no-op so the canvas snaps back.
      }
    },
    [connectNodes],
  );

  const handleNodesDelete = useCallback(
    (deleted: FlowNode[]) => {
      for (const node of deleted) {
        // Drop the matching config draft first so the rail doesn't
        // linger on a node that no longer exists in the graph.
        dropNodeConfigDraft(node.id);
        removeNode(node.id);
      }
      // If the active node was deleted, close the config rail.
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

  return (
    <div
      aria-label="Workflow canvas"
      data-testid="workflow-canvas"
      // jsdom returns 0 for getBoundingClientRect — explicit dimensions
      // keep React Flow rendering predictably in tests too. The bump
      // from 480 → 560 is a modest "feels closer to full-height" step;
      // true full-bleed needs page-shell changes that are out of scope
      // for BUILDER-CANVAS-1 (documented in the port plan).
      style={{ width: "100%", height: 560 }}
      className="relative overflow-hidden rounded-lg border border-input bg-background"
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        onNodeClick={handleNodeClick}
        onNodeDragStop={handleNodeDragStop}
        onConnect={handleConnect}
        onNodesDelete={handleNodesDelete}
        onEdgesDelete={handleEdgesDelete}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {isEmpty ? <EmptyCanvasState onAddTrigger={onEmptyAddTrigger} /> : null}
    </div>
  );
}
