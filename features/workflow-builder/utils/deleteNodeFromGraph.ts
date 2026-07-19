import type {
  WorkflowEdge,
  WorkflowNode,
} from "@/contracts/workflow";

/**
 * Pure node-delete + edge-rewire helper (Slice 4.BUILDER-NODE-DELETE-1).
 *
 * The inspector's "Delete node" button funnels through `graphSlice.deleteNodeAndRewire`,
 * which delegates to this helper. Kept pure (no slice / fetch / DOM access) so it
 * is trivially testable and re-usable from anywhere — agents, batch ops, future
 * keyboard shortcuts, server-side reconciliation.
 *
 * ── Behavior contract ───────────────────────────────────────────────────────
 *
 *  1. Unknown nodeId
 *     → blocked with `reason: "unknown_node"`. Caller treats as no-op.
 *
 *  2. Standalone (0 in, 0 out)
 *     → ok; just removes the node, no edge changes.
 *
 *  3. Last node (≥1 in, 0 out)
 *     → ok; removes the node + every incoming edge. No rewire (nothing
 *       downstream to connect to). Multiple incoming edges allowed here —
 *       fan-in with no continuation is unambiguous to drop.
 *
 *  4. First node (0 in, ≥1 out)
 *     → ok; removes the node + every outgoing edge. No rewire. Downstream
 *       nodes become disconnected; surfaced separately by validation
 *       (no_trigger if the deleted node was the trigger; unreachable-node
 *       checks deferred to a follow-up validator slice).
 *
 *  5. Linear (1 in, 1 out)
 *     → ok; removes the node + both incoming+outgoing edges, then creates a
 *       single rewire edge A → C. Three sub-cases:
 *        a. A === C (back-edge / cycle through the deleted node)
 *           → rewire SKIPPED, warning = "rewire_would_self_loop". Node is
 *             still deleted; the cycle is broken (which is the intent).
 *        b. An unlabeled edge A → C already exists
 *           → rewire SKIPPED, warning = "rewire_would_duplicate". Existing
 *             edge keeps the chain connected; no duplicate is created
 *             (mirrors graphSlice.connectNodes's dedup rule).
 *        c. Otherwise → rewire CREATED with a fresh id.
 *
 *  6. Multi-edge with both sides present (≥2 in AND ≥1 out, OR ≥1 in AND ≥2 out)
 *     → blocked with `reason: "cannot_rewire_multi_edge"`. We refuse to
 *       silently fan out N×M rewire edges — that may drop branch labels,
 *       create duplicates, or fundamentally change graph semantics
 *       (especially around router/branching nodes whose outgoing edges carry
 *       branch labels). The UI surfaces a "disconnect manually first" message.
 *
 *  Key design points:
 *
 *   - Pure. `input` is `readonly`; output arrays are fresh. Caller mutates
 *     state via its own setter.
 *   - Edge ids are caller-supplied via `newEdgeId()`. Default uses crypto's
 *     randomUUID when available (mirrors graphSlice's own pattern) so the
 *     helper is safe to call without a custom generator.
 *   - Labeled edges (router branches, Slice 3.6+) are counted toward the
 *     "multi-edge" check on the outgoing side. A single unlabeled outgoing
 *     edge keeps a router node deletable via the linear rule — but the
 *     common case of a router with ≥2 labeled branches blocks correctly.
 *   - No provider-specific branches. Treats every node identically.
 *
 *  Forward-compatibility:
 *
 *   - Future slices may want a "force delete with downstream cascade" mode.
 *     Not added here — v1 is conservative + explicit. The blocked-multi-edge
 *     surface is the right place to grow that option later.
 */

export type DeleteNodeBlockedReason =
  | "unknown_node"
  | "cannot_rewire_multi_edge";

export type DeleteNodeWarning =
  | "rewire_would_self_loop"
  | "rewire_would_duplicate";

export interface DeleteNodeFromGraphInput {
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly WorkflowEdge[];
  readonly nodeId: string;
  /**
   * Optional id generator for the rewire edge. Defaults to crypto.randomUUID
   * when available, with a timestamp fallback. Tests inject a deterministic
   * generator.
   */
  readonly newEdgeId?: () => string;
}

export interface DeleteNodeFromGraphSuccess {
  readonly ok: true;
  /** Updated node list (deleted node removed). Fresh array. */
  readonly nodes: WorkflowNode[];
  /** Updated edge list (connected edges removed; rewire appended if created). Fresh array. */
  readonly edges: WorkflowEdge[];
  /** The node that was removed. */
  readonly deletedNode: WorkflowNode;
  /** Ids of every edge dropped (incoming + outgoing of the deleted node). */
  readonly removedEdgeIds: readonly string[];
  /**
   * Id of the rewire edge added, or null when no rewire was needed
   * (standalone / last / first / warning suppressed).
   */
  readonly rewiredEdgeId: string | null;
  /**
   * Non-blocking signal. Set when the linear-rewire branch decided to skip
   * the rewire (would self-loop or would duplicate an existing edge). Node
   * still deleted; caller can surface a hint to the user.
   */
  readonly warning: DeleteNodeWarning | null;
}

export interface DeleteNodeFromGraphBlocked {
  readonly ok: false;
  readonly reason: DeleteNodeBlockedReason;
  readonly message: string;
}

export type DeleteNodeFromGraphResult =
  | DeleteNodeFromGraphSuccess
  | DeleteNodeFromGraphBlocked;

function defaultNewEdgeId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function deleteNodeFromGraph(
  input: DeleteNodeFromGraphInput,
): DeleteNodeFromGraphResult {
  const target = input.nodes.find((n) => n.id === input.nodeId);
  if (!target) {
    return {
      ok: false,
      reason: "unknown_node",
      message: `No node with id '${input.nodeId}' was found in the workflow.`,
    };
  }

  const incoming = input.edges.filter((e) => e.to === input.nodeId);
  const outgoing = input.edges.filter((e) => e.from === input.nodeId);

  const hasBothSides = incoming.length > 0 && outgoing.length > 0;
  const isMultiEdgeRewire =
    hasBothSides && (incoming.length > 1 || outgoing.length > 1);

  if (isMultiEdgeRewire) {
    return {
      ok: false,
      reason: "cannot_rewire_multi_edge",
      message:
        "This node connects multiple paths. Disconnect the extra edges manually, then try again.",
    };
  }

  // From here: standalone, last (n in / 0 out), first (0 in / n out), or
  // strict linear (1 in / 1 out). Build the rewire candidate when both sides
  // exist; skip on self-loop or duplicate.
  let rewiredEdge: WorkflowEdge | null = null;
  let warning: DeleteNodeWarning | null = null;

  if (hasBothSides) {
    // Linear case — incoming.length === 1 && outgoing.length === 1 by the
    // multi-edge guard above.
    const fromId = incoming[0]!.from;
    const toId = outgoing[0]!.to;

    if (fromId === toId) {
      warning = "rewire_would_self_loop";
    } else {
      // BRANCH-ENT-1 C4 — the rewire inherits the INCOMING edge's branch
      // label (deleting a step inside a True branch keeps A —true→ C), so a
      // linear delete never silently drops the route. Duplicate detection
      // therefore matches on the same (from, to, label) key the definition
      // contract dedupes on.
      const inheritedLabel = incoming[0]!.label;
      const hasDuplicate = input.edges.some(
        (e) =>
          e.from === fromId && e.to === toId && e.label === inheritedLabel,
      );
      if (hasDuplicate) {
        warning = "rewire_would_duplicate";
      } else {
        const idGen = input.newEdgeId ?? defaultNewEdgeId;
        rewiredEdge = {
          id: idGen(),
          from: fromId,
          to: toId,
          ...(inheritedLabel !== undefined ? { label: inheritedLabel } : {}),
        };
      }
    }
  }

  const removedEdgeIds = [...incoming, ...outgoing].map((e) => e.id);
  const removedEdgeIdSet = new Set(removedEdgeIds);
  const remainingEdges = input.edges.filter((e) => !removedEdgeIdSet.has(e.id));
  const finalEdges = rewiredEdge
    ? [...remainingEdges, rewiredEdge]
    : remainingEdges;
  const finalNodes = input.nodes.filter((n) => n.id !== target.id);

  return {
    ok: true,
    nodes: finalNodes,
    edges: finalEdges,
    deletedNode: target,
    removedEdgeIds,
    rewiredEdgeId: rewiredEdge?.id ?? null,
    warning,
  };
}
