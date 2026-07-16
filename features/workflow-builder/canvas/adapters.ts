import type {
  Node as FlowNode,
  Edge as FlowEdge,
  XYPosition,
} from "@xyflow/react";
import type {
  WorkflowEdge,
  WorkflowNode,
} from "@/contracts/workflow";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import { requirementLookupKey } from "@/core/workflows/requiredFields";
import { buildNodeConfigSummary } from "@/core/workflows/nodeConfigSummary";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";
import { readResourceLabel } from "../state/resourceLabelCache";
import {
  missingRequiredFields,
  type RequiredFieldsByType,
} from "../validation/collectBuilderValidationIssues";
import type {
  PreviewDiffGraph,
  PreviewEdgeDiffStatus,
  PreviewNodeDiffStatus,
} from "../utils/buildPreviewDiffGraph";

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
export const WORKFLOW_EDGE_TYPE = "workflowEdge" as const;

export interface WorkflowNodeData extends Record<string, unknown> {
  kind: "trigger" | "action";
  provider: string;
  /** Provider-scoped action/trigger type, or empty string for unconfigured nodes. */
  type: string;
  /**
   * User-facing node name (Slice 4.BUILDER-NODE-IDENTITY-1). The custom
   * `node.displayName` when set, otherwise a friendly default derived from the
   * type key (`send_channel_message` → "Send Channel Message"). The card shows
   * this as the title — never the raw node id. Metadata-exact display names are
   * resolved in the config panel (which has the meta loaded); the canvas uses
   * the pure type-key fallback so it stays a synchronous converter.
   */
  displayName: string;
  /**
   * The node's RAW user-set custom name (`node.displayName`), or undefined when
   * the user hasn't named it (Slice 4.BUILDER-NODE-QUICK-ACTIONS-1). The inline
   * rename editor seeds from this (empty when unset, with `displayName` — the
   * resolved default — shown as the placeholder). Never identity.
   */
  customName?: string;
  /**
   * Slice 4.BUILDER-CANVAS-ERGONOMICS-FIX-1 — true when this node has NO outgoing
   * edge (a chain/branch end). Tail nodes render an "add next step" `+` so users
   * can append at the end (or extend a specific branch) without the top-right CTA.
   */
  isTail?: boolean;
  /** Optional provider-friendly label (e.g. "Slack" instead of "slack"). */
  providerLabel?: string;
  /**
   * BUILDER-READINESS — true when the node picked a type but a required config
   * field is empty. Computed here (the adapter has the live `node.config` + the
   * metadata lookup) and read by `WorkflowNodeCard` to show "Needs setup".
   */
  missingRequiredConfig?: boolean;
  /**
   * Optional public SVG icon URL for the provider. Sourced from
   * `integrations/_registry:providerIconUrl(id)` and threaded through
   * `NodeConversionContext.providerIcons`. When present,
   * `WorkflowNodeCard` renders an `<img>`; when missing or on
   * `<img onError>` it falls back to its initials avatar. No
   * per-provider branches anywhere.
   */
  providerIcon?: string;
  /**
   * CONFIG-UX-NODE-SUMMARY-1 — the node's at-a-glance summary line, e.g.
   * "Send Channel Message · #support-alerts". Present ONLY when the node's
   * primary resource resolved to a recognizable NAME; see
   * {@link summaryHeadlineFor} for why an unresolved id is omitted rather than
   * shown. Absent when no `summaryFieldsByType` is threaded (back-compat), when
   * the node has no configured resource, or when its labels aren't loaded yet.
   */
  summaryHeadline?: string;
  /**
   * HERMES-AGENT-PREVIEW-DIFF-GRAPH — when this node is part of an AI PREVIEW (one composed diff graph,
   * not a floating overlay), its diff status drives the card's diff treatment (added/removed/changed
   * styling + pill) and read-only behavior. Absent for the normal live graph.
   */
  diffStatus?: PreviewNodeDiffStatus;
}

export interface NodeConversionContext {
  /** Optional map of provider id → display label. Same map as NodeList. */
  providerLabels?: Readonly<Record<string, string>>;
  /**
   * Optional map of provider id → public SVG icon URL. Built by
   * WorkflowBuilder from the `iconUrl` field on `ProviderOption`. Missing
   * entries leave the node card on the initials-avatar fallback.
   */
  providerIcons?: Readonly<Record<string, string>>;
  /**
   * BUILDER-READINESS — required-field metadata per `provider:type`. When
   * supplied, the adapter flags nodes missing a required field so the card
   * renders "Needs setup". Omitting it preserves the prior configured/
   * unconfigured-only behavior.
   */
  requiredFieldsByType?: RequiredFieldsByType;
  /**
   * Slice 4.BUILDER-CANVAS-ERGONOMICS-FIX-1 — ids of nodes with no outgoing edge
   * (chain/branch ends). The canvas derives this once from the edge list; the
   * adapter flags each node's `isTail` so the card can render the tail `+`.
   */
  tailNodeIds?: ReadonlySet<string>;
  /**
   * CONFIG-UX-NODE-SUMMARY-1 — display-safe field metadata per `provider:type`,
   * computed server-side from the discovery registry. When supplied, the adapter
   * computes each node's summary headline for the collapsed card. Omitting it
   * preserves the prior card exactly (no summary line).
   */
  summaryFieldsByType?: NodeSummaryFieldsByType;
  /**
   * CONFIG-UX-NODE-SUMMARY-1 — the resource label cache SNAPSHOT
   * (`(optionsSource|value) → label`). The adapter is a pure synchronous
   * converter and must not read the Zustand store itself, so `WorkflowBuilder`
   * subscribes (`useResourceLabelCache((s) => s.labels)`) and threads the map
   * down; the card then re-renders as pickers resolve names. Absent/empty ⇒ no
   * resource name is known yet ⇒ no summary line (never a raw id).
   */
  resourceLabels?: Readonly<Record<string, string>>;
}

/**
 * The node's collapsed-card summary headline, or `undefined` when it would not
 * add a recognizable name.
 *
 * The card only earns a second line when the summary resolves the node's
 * primary RESOURCE to a real name ("#support-alerts") — that is the whole
 * product value. Two cases deliberately yield nothing rather than something:
 *
 *   - No resource segment at all ⇒ the headline is just the display name, which
 *     the card's title already shows; repeating it is noise.
 *   - Any resource lookup MISSED the label cache ⇒ `buildNodeConfigSummary`
 *     honestly falls back to the stored id, and a raw provider id (`C0192837`)
 *     on the canvas is worse than no line. The config panel is the surface that
 *     shows the saved id (flagged "saved id"); the canvas stays quiet until the
 *     pickers have resolved names.
 *
 * Pure — `labelFor` only reads the injected snapshot.
 */
function summaryHeadlineFor(
  node: WorkflowNode,
  ctx: NodeConversionContext,
): string | undefined {
  if (!ctx.summaryFieldsByType || !node.type) return undefined;
  const meta = ctx.summaryFieldsByType[requirementLookupKey(node)];
  if (!meta) return undefined;

  const labels = ctx.resourceLabels ?? {};
  let missedLabel = false;
  const summary = buildNodeConfigSummary({
    // The card's own title (custom name when the user set one), so the headline
    // reads as "<what the card says> · <resource>" rather than reintroducing the
    // metadata name the user renamed away from.
    displayName: getNodeDisplayName(node),
    fields: meta.fields,
    config: node.config ?? {},
    labelFor: (source, value) => {
      const label = readResourceLabel(labels, source, value);
      if (label === undefined) missedLabel = true;
      return label;
    },
  });

  if (missedLabel) return undefined;
  const hasResource = summary.segments.some((s) => s.kind === "resource");
  if (!hasResource) return undefined;
  return summary.headline;
}

export interface EdgeConversionContext {
  /**
   * Slice 4.BUILDER-ADD-FLOW-1 — optional callback the custom
   * `WorkflowEdge` invokes when its plus-button is clicked. Receives
   * the edge id so `WorkflowBuilder` can open `AddNodePanel` in
   * insertAction mode for the right edge. Omitting it suppresses the
   * plus-button (the edge still renders).
   */
  onEdgePlusClick?: (edgeId: string) => void;
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
      displayName: getNodeDisplayName(node),
      ...(node.displayName !== undefined ? { customName: node.displayName } : {}),
      ...(ctx.tailNodeIds?.has(node.id) ? { isTail: true } : {}),
      providerLabel: ctx.providerLabels?.[node.provider],
      providerIcon: ctx.providerIcons?.[node.provider],
      missingRequiredConfig:
        missingRequiredFields(node, ctx.requiredFieldsByType).length > 0,
      ...summaryHeadlineData(node, ctx),
    },
  }));
}

/** Spread-shaped so an absent headline leaves `summaryHeadline` off `data` entirely. */
function summaryHeadlineData(
  node: WorkflowNode,
  ctx: NodeConversionContext,
): { summaryHeadline?: string } {
  const summaryHeadline = summaryHeadlineFor(node, ctx);
  return summaryHeadline ? { summaryHeadline } : {};
}

export function workflowEdgesToFlowEdges(
  edges: readonly WorkflowEdge[],
  ctx: EdgeConversionContext = {},
): FlowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    type: WORKFLOW_EDGE_TYPE,
    source: edge.from,
    target: edge.to,
    // Surface optional branch label as the edge label so authors can
    // see it on the canvas. Router routes editor (Slice 3.6) is the
    // surface that produces labeled edges; until then `label` is just
    // a passthrough display.
    ...(edge.label ? { label: edge.label } : {}),
    // Slice 4.BUILDER-ADD-FLOW-1 — surface the plus-button click
    // handler through edge `data`. The custom `WorkflowEdge` reads it
    // and renders the plus only when a handler is supplied.
    data: ctx.onEdgePlusClick
      ? { onPlusClick: ctx.onEdgePlusClick }
      : undefined,
  }));
}

/** Edge `data` carries the optional diff status so {@link WorkflowEdge} can style a preview edge. */
export interface WorkflowEdgeDataWithDiff {
  diffStatus?: PreviewEdgeDiffStatus;
}

/**
 * HERMES-AGENT-PREVIEW-DIFF-GRAPH — convert the composed diff graph into ReactFlow nodes/edges for the
 * SINGLE preview graph the canvas renders (replacing the live graph + floating overlay). Every node
 * carries its `diffStatus` in `data` and is READ-ONLY (not draggable / connectable / selectable) so the
 * preview is a clean visualization, not an editable graph. Pure; no store/network.
 */
export function previewDiffToFlowNodes(
  graph: PreviewDiffGraph,
  ctx: NodeConversionContext = {},
): FlowNode<WorkflowNodeData>[] {
  return graph.nodes.map((node) => ({
    id: node.id,
    type: WORKFLOW_NODE_TYPE,
    position: { x: node.position.x, y: node.position.y } satisfies XYPosition,
    draggable: false,
    connectable: false,
    selectable: false,
    data: {
      kind: node.kind,
      provider: node.provider,
      type: node.type,
      displayName: getNodeDisplayName(node),
      ...(node.displayName !== undefined ? { customName: node.displayName } : {}),
      providerLabel: ctx.providerLabels?.[node.provider],
      providerIcon: ctx.providerIcons?.[node.provider],
      // Removed nodes are leaving — don't nag about their config; others show real readiness.
      missingRequiredConfig:
        node.diffStatus !== "removed" && missingRequiredFields(node, ctx.requiredFieldsByType).length > 0,
      ...summaryHeadlineData(node, ctx),
      diffStatus: node.diffStatus,
    },
  }));
}

/** Convert the diff graph's edges into ReactFlow edges carrying `diffStatus` (read-only; no plus-button). */
export function previewDiffToFlowEdges(graph: PreviewDiffGraph): FlowEdge[] {
  return graph.edges.map((edge, i) => ({
    // The candidate + removed edges may share endpoints across diff states; suffix keeps RF ids unique.
    id: `${edge.id}__diff-${i}`,
    type: WORKFLOW_EDGE_TYPE,
    source: edge.from,
    target: edge.to,
    selectable: false,
    ...(edge.label ? { label: edge.label } : {}),
    data: { diffStatus: edge.diffStatus } satisfies WorkflowEdgeDataWithDiff,
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
