import type {
  Node as FlowNode,
  Edge as FlowEdge,
  XYPosition,
} from "@xyflow/react";
import type {
  WorkflowEdge,
  WorkflowNode,
} from "@/contracts/workflow";

/**
 * Pure converters between the workflow-definition shape (the
 * source-of-truth used by graphSlice, the resolver, and the
 * execution engine) and ReactFlow's runtime node/edge shapes.
 *
 * Slice 3.5 — these helpers live next to the canvas so the
 * builder UI never persists ReactFlow's internal types. They are
 * intentionally side-effect free (no state, no fetch) so the
 * canvas component can call them inside `useMemo` without
 * concerning itself with synchronization edge cases.
 *
 * Naming convention:
 *   - `WorkflowNode` / `WorkflowEdge`  → contract shape
 *   - `FlowNode` / `FlowEdge`          → ReactFlow shape
 *
 * The `data` payload we attach to FlowNodes is a narrow window
 * into the underlying WorkflowNode — just what the custom node
 * renderer needs to display a node. Storing the full WorkflowNode
 * inside `data` would tempt callers to mutate it through React
 * Flow's API, defeating the single-source-of-truth invariant.
 */

export const WORKFLOW_NODE_TYPE = "workflowNode" as const;

export interface WorkflowNodeData extends Record<string, unknown> {
  kind: "trigger" | "action";
  provider: string;
  /** Provider-scoped action/trigger type, or empty string for unconfigured nodes. */
  type: string;
  /** Optional provider-friendly label (e.g. "Slack" instead of "slack"). */
  providerLabel?: string;
}

export interface NodeConversionContext {
  /** Optional map of provider id → display label. Same map as NodeList. */
  providerLabels?: Readonly<Record<string, string>>;
}

export function workflowNodesToFlowNodes(
  nodes: readonly WorkflowNode[],
  ctx: NodeConversionContext = {},
): FlowNode<WorkflowNodeData>[] {
  return nodes.map((node) => ({
    id: node.id,
    type: WORKFLOW_NODE_TYPE,
    position: { x: node.position.x, y: node.position.y } satisfies XYPosition,
    data: {
      kind: node.kind,
      provider: node.provider,
      type: node.type,
      providerLabel: ctx.providerLabels?.[node.provider],
    },
  }));
}

export function workflowEdgesToFlowEdges(
  edges: readonly WorkflowEdge[],
): FlowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    // Surface optional branch label as the edge label so authors can
    // see it on the canvas. Router routes editor (Slice 3.6) is the
    // surface that produces labeled edges; until then `label` is just
    // a passthrough display.
    ...(edge.label ? { label: edge.label } : {}),
  }));
}

export interface FlowNodeWithPosition {
  id: string;
  position: XYPosition;
}

/**
 * Pull the `(id, position)` pair out of a FlowNode for the
 * canvas's `onNodeDragStop` → `graphSlice.updateNodePosition`
 * dispatch path. Kept here (rather than inlined in the canvas) so
 * it stays trivially testable.
 */
export function flowNodePositionPatch(
  node: FlowNodeWithPosition,
): { nodeId: string; position: { x: number; y: number } } {
  return {
    nodeId: node.id,
    position: { x: node.position.x, y: node.position.y },
  };
}
