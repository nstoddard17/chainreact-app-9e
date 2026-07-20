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
 *  5. Rewirable (≥1 in, EXACTLY 1 out)
 *     → ok; removes the node + all incoming+outgoing edges, then creates one
 *       rewire edge from_i → successor PER incoming edge, preserving each
 *       incoming edge's branch label. With a single successor the heal is
 *       unambiguous even under fan-in (RECONV-1 S2 — a reconverged shared
 *       step no longer blocks deletion). Per rewire candidate:
 *        a. from_i === successor (back-edge / cycle through the deleted node)
 *           → that candidate is SKIPPED, warning = "rewire_would_self_loop".
 *             Node is still deleted; the cycle is broken (which is the intent).
 *        b. An edge from_i → successor with the same label already exists
 *           → that candidate is SKIPPED, warning = "rewire_would_duplicate".
 *             The existing edge keeps the route connected; no duplicate is
 *             created (mirrors graphSlice.connectNodes's dedup rule).
 *        c. Otherwise → rewire CREATED with a fresh id.
 *
 *  6. Multi-out with an incoming side (≥1 in AND ≥2 out)
 *     → blocked with `reason: "cannot_rewire_multi_edge"`. With several
 *       outgoing edges there is no single successor to heal to — we refuse to
 *       silently fan out N×M rewire edges, which could drop branch-route
 *       semantics (router/branching nodes' outgoing edges carry route
 *       labels). The UI surfaces a "disconnect the outgoing edges first"
 *       message.
 *
 *  Key design points:
 *
 *   - Pure. `input` is `readonly`; output arrays are fresh. Caller mutates
 *     state via its own setter.
 *   - Edge ids are caller-supplied via `newEdgeId()`. Default uses crypto's
 *     randomUUID when available (mirrors graphSlice's own pattern) so the
 *     helper is safe to call without a custom generator.
 *   - Labeled edges (router branches, Slice 3.6+) are counted toward the
 *     "multi-out" check. A single outgoing edge keeps a router node deletable
 *     via the rewirable rule — but the common case of a router with ≥2 labeled
 *     branches blocks correctly.
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
   * Id of the FIRST rewire edge added, or null when no rewire was needed
   * (standalone / last / first / every candidate suppressed). A fan-in heal
   * creates one rewire per incoming edge — all of them appear in `edges`.
   */
  readonly rewiredEdgeId: string | null;
  /**
   * Non-blocking signal. Set when at least one rewire candidate was skipped
   * (would self-loop or would duplicate an existing edge); the first
   * suppression wins if several occur. Node still deleted; caller can
   * surface a hint to the user.
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

  if (hasBothSides && outgoing.length > 1) {
    return {
      ok: false,
      reason: "cannot_rewire_multi_edge",
      message:
        "This node fans out to multiple paths. Disconnect its outgoing edges manually, then try again.",
    };
  }

  // From here: standalone, last (n in / 0 out), first (0 in / n out), or
  // rewirable (n in / exactly 1 out). Build one rewire candidate per incoming
  // edge; skip individual candidates on self-loop or duplicate.
  const rewiredEdges: WorkflowEdge[] = [];
  let warning: DeleteNodeWarning | null = null;

  if (hasBothSides) {
    // outgoing.length === 1 by the multi-out guard above.
    const toId = outgoing[0]!.to;
    const idGen = input.newEdgeId ?? defaultNewEdgeId;
    for (const inEdge of incoming) {
      const fromId = inEdge.from;
      if (fromId === toId) {
        warning ??= "rewire_would_self_loop";
        continue;
      }
      // BRANCH-ENT-1 C4 — each rewire inherits its INCOMING edge's branch
      // label (deleting a step inside a True branch keeps A —true→ C), so a
      // heal never silently drops a route. Duplicate detection therefore
      // matches on the same (from, to, label) key the definition contract
      // dedupes on — against existing edges AND rewires already built.
      const inheritedLabel = inEdge.label;
      const isDuplicate = (e: WorkflowEdge) =>
        e.from === fromId && e.to === toId && e.label === inheritedLabel;
      if (input.edges.some(isDuplicate) || rewiredEdges.some(isDuplicate)) {
        warning ??= "rewire_would_duplicate";
        continue;
      }
      rewiredEdges.push({
        id: idGen(),
        from: fromId,
        to: toId,
        ...(inheritedLabel !== undefined ? { label: inheritedLabel } : {}),
      });
    }
  }

  const removedEdgeIds = [...incoming, ...outgoing].map((e) => e.id);
  const removedEdgeIdSet = new Set(removedEdgeIds);
  const remainingEdges = input.edges.filter((e) => !removedEdgeIdSet.has(e.id));
  const finalEdges = [...remainingEdges, ...rewiredEdges];
  const finalNodes = input.nodes.filter((n) => n.id !== target.id);

  return {
    ok: true,
    nodes: finalNodes,
    edges: finalEdges,
    deletedNode: target,
    removedEdgeIds,
    rewiredEdgeId: rewiredEdges[0]?.id ?? null,
    warning,
  };
}
