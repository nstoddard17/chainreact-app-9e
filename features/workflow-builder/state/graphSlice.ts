import { create } from "zustand";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "@/contracts/workflow";
import type { WorkflowNodePosition } from "@/contracts/workflowDefinition";
import {
  WorkflowApiError,
  updateWorkflow,
} from "@/lib/api/workflows";
import {
  deleteNodeFromGraph,
  type DeleteNodeBlockedReason,
  type DeleteNodeWarning,
} from "../utils/deleteNodeFromGraph";

/**
 * Builder graph slice.
 *
 * Per docs/rules/workflow-state-store.md (Resolved Decisions):
 *   - Slice owns nodes + edges + dirty / save state for the builder.
 *   - `saved*` reflects the last server-confirmed payload; `pending*` holds
 *     in-progress edits. Save reconciles.
 *   - Slice does NOT import other slices and does NOT import from
 *     repositories/ or services/. It calls the typed client API.
 *   - In-memory only — never persisted to localStorage (workflow data is
 *     server-synced; only UI prefs persist).
 *
 * 1I.2 ships the actions the minimum builder needs: hydrate, reset,
 * addTrigger, addAction, removeNode, save. Per-node config edits (Slice 1L+)
 * extend the slice with updateNodeConfig.
 */

export interface GraphSliceState {
  workflowId: string | null;
  isHydrated: boolean;

  /** Server-confirmed (last successful save / hydrate). */
  savedNodes: readonly WorkflowNode[];
  savedEdges: readonly WorkflowEdge[];

  /** In-progress edits. Reconciled to saved* on successful save. */
  pendingNodes: readonly WorkflowNode[];
  pendingEdges: readonly WorkflowEdge[];

  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;

  /**
   * Slice 4.BUILDER-APPLY-HYDRATE-RACE-1 — the server revision (`updatedAt`)
   * of the last ACCEPTED hydrate for the current workflow. A later hydrate for
   * the SAME workflow carrying a STRICTLY-OLDER revision is ignored, so a
   * stale/late prop-driven hydrate can never clobber a freshly-applied graph.
   * `null` when unknown (legacy hydrate with no revision, or after reset).
   */
  hydratedRevision: string | null;
}

export interface AddNodeInput {
  provider: string;
  type?: string;
  /** Optional initial config (e.g. derived from ActionMeta.fields defaults). */
  config?: Record<string, unknown>;
}

export interface GraphSliceActions {
  /**
   * Replace saved + pending graph state from a server definition.
   *
   * Slice 4.BUILDER-APPLY-HYDRATE-RACE-1 — pass the workflow's server
   * `revision` (`updatedAt`) so a STALE re-hydrate for the SAME workflow (an
   * older revision arriving after a fresher one — e.g. the builder's
   * prop-driven mount effect re-firing after a React Agent apply already
   * hydrated the newer draft) is IGNORED. Omitting `revision` keeps the legacy
   * always-accept behavior (used by tests / non-revisioned callers).
   */
  hydrate(workflowId: string, def: WorkflowDefinition, revision?: string): void;
  reset(): void;
  addTrigger(input: AddNodeInput): WorkflowNode;
  addAction(input: AddNodeInput): WorkflowNode;
  /**
   * Slice 3.2 — add an action node by its ActionMeta. Derives the
   * default config from `meta.fields[].defaultValue` so authors see
   * the recommended starting values pre-populated in the config form.
   */
  addActionFromMeta(meta: ActionMeta): WorkflowNode;
  /**
   * Slice 3.3 — add a trigger node by its TriggerMeta. Symmetric to
   * `addActionFromMeta`: derives the default config from
   * `meta.fields[].defaultValue` so e.g. the scheduled trigger's
   * cronExpression field can pre-populate a sensible placeholder.
   * Same single-trigger-per-workflow guard as `addTrigger`.
   *
   * Slice 4.BUILDER-TRIGGER-RECOVERY-1 — when actions remain but the trigger
   * was deleted, the new trigger auto-connects to the SOLE root action (an
   * action with no incoming edge) so the chain becomes runnable again. Skips
   * the edge when the target is ambiguous (zero or ≥2 root actions). Returns
   * the trigger node.
   */
  addTriggerFromMeta(meta: TriggerMeta): WorkflowNode;
  removeNode(nodeId: string): void;
  /**
   * Slice 3.2 — replace the named node's config. Caller passes the
   * full config object (typically the configSlice draft values for
   * the node). Sets `isDirty: true` if the config changed.
   */
  updateNodeConfig(nodeId: string, config: Record<string, unknown>): void;
  /**
   * Slice 4.BUILDER-NODE-IDENTITY-1 — set/clear the node's USER-FACING display
   * name. Trims; an empty/whitespace value clears it (the UI then derives a
   * friendly default from metadata). No-op on unknown nodeId or an unchanged
   * value. Marks the graph dirty — displayName persists with the workflow
   * draft. NEVER touches `id`, provider/type, config, or execution: this is a
   * pure label edit, deliberately independent of the configSlice draft cycle.
   */
  renameNode(nodeId: string, displayName: string | undefined): void;
  /**
   * Slice 3.5 — replace the named node's position after a canvas drag.
   * No-op if the position is shallow-equal to the current one (avoids
   * flipping dirty on a click that doesn't move the node). No-op on
   * unknown nodeId.
   */
  updateNodePosition(nodeId: string, position: WorkflowNodePosition): void;
  /**
   * Slice 3.5 — add an edge between two existing nodes (canvas connect
   * handle). Returns the new edge. Throws when either endpoint is
   * unknown, when from === to (self-loop), or when an unlabeled edge
   * between the same (from, to) already exists. Label support is
   * deferred — branching edits land with Slice 3.6 (router routes).
   */
  connectNodes(input: { from: string; to: string }): WorkflowEdge;
  /**
   * Slice 3.5 — remove an edge by id (canvas keyboard-delete on a
   * selected edge). No-op on unknown edgeId.
   */
  removeEdge(edgeId: string): void;
  /**
   * Slice 4.BUILDER-NODE-DELETE-1 — safe delete with edge-rewire. Delegates
   * to the pure `deleteNodeFromGraph` helper:
   *
   *   - Standalone / last / first node → drop the node + its connected edges.
   *   - Linear middle (1 in, 1 out) → drop node + both edges, create A → C
   *     rewire (suppressed with `warning` if it would self-loop or duplicate
   *     an existing unlabeled edge).
   *   - Multi-edge with both sides present (≥2 in OR ≥2 out) → blocked.
   *     State is NOT mutated; the inspector surfaces the reason and asks the
   *     user to disconnect manually first.
   *
   * Trigger deletion is allowed by this action (the caller — typically the
   * inspector's confirmation dialog — gates it behind a confirmation step).
   * Validation surfaces `no_trigger` afterward.
   *
   * Returns an outcome record so the caller can react without re-reading
   * slice state. Never throws.
   */
  deleteNodeAndRewire(nodeId: string): DeleteNodeOutcome;
  save(): Promise<void>;
}

/**
 * Outcome of `deleteNodeAndRewire`. Three shapes:
 *
 *   - `{ ok: true }` — node deleted; pendingNodes/pendingEdges updated;
 *     `isDirty` flipped on. `warning` is set when the linear-rewire branch
 *     chose to skip the rewire (self-loop or duplicate); the node was still
 *     deleted in that case.
 *   - `{ ok: false, reason: "unknown_node" }` — silent no-op; no state change.
 *   - `{ ok: false, reason: "cannot_rewire_multi_edge" }` — no state change;
 *     caller renders the `message` so the user can disconnect edges manually.
 */
export type DeleteNodeOutcome =
  | {
      readonly ok: true;
      readonly deletedNodeId: string;
      readonly removedEdgeIds: readonly string[];
      readonly rewiredEdgeId: string | null;
      readonly warning: DeleteNodeWarning | null;
    }
  | {
      readonly ok: false;
      readonly reason: DeleteNodeBlockedReason;
      readonly message: string;
    };

/**
 * Derive an initial config Record from a meta's field defaults.
 *
 * Slice 3.2 introduced this helper for ActionMeta; Slice 3.3 widens it
 * to TriggerMeta — both shapes share the same `FieldMeta[]` contract,
 * so a single helper covers both via a structural `{ fields }` param.
 *
 * Only fields whose `defaultValue` is explicitly set contribute; other
 * fields are left absent so the schema's own defaults / requireds take
 * effect when the workflow runs.
 */
export function deriveDefaultConfig(
  meta: Pick<ActionMeta, "fields"> | Pick<TriggerMeta, "fields">,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of meta.fields) {
    if (field.defaultValue !== undefined) {
      out[field.name] = field.defaultValue;
    }
  }
  return out;
}

/**
 * Slice 4.BUILDER-TRIGGER-RECOVERY-1 — find the single "root" action a newly
 * added trigger can safely connect to.
 *
 * A root action is an `action` node with NO incoming edge. After a trigger is
 * deleted from `trigger → A → B`, A loses its incoming edge and becomes the
 * sole root — so re-adding a trigger should reconnect `trigger → A` to restore
 * a runnable chain without forcing the user to rewire by hand.
 *
 * Returns the root action id ONLY when there is EXACTLY ONE — i.e. the
 * reconnection target is unambiguous. Returns `null` when there are zero root
 * actions (nothing to attach to) or two-or-more (ambiguous — adding an edge
 * could pick the wrong branch, so we leave it to the user / edge UI). Pure;
 * never throws.
 */
export function findSoleRootActionId(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): string | null {
  const nodesWithIncoming = new Set(edges.map((e) => e.to));
  const rootActions = nodes.filter(
    (n) => n.kind === "action" && !nodesWithIncoming.has(n.id),
  );
  return rootActions.length === 1 ? rootActions[0]!.id : null;
}

export type GraphSlice = GraphSliceState & GraphSliceActions;

const INITIAL_STATE: GraphSliceState = Object.freeze({
  workflowId: null,
  isHydrated: false,
  savedNodes: [],
  savedEdges: [],
  pendingNodes: [],
  pendingEdges: [],
  isDirty: false,
  isSaving: false,
  saveError: null,
  hydratedRevision: null,
});

/**
 * Slice 4.BUILDER-APPLY-HYDRATE-RACE-1 — is an incoming hydrate revision
 * STRICTLY older than the currently-accepted one? Compared as epoch ms (robust
 * to ISO timestamp formatting). Unknown / unparseable revisions are NOT stale
 * (we can't prove staleness → accept), preserving legacy behavior.
 */
function isStaleRevision(incoming: string | undefined, current: string | null): boolean {
  if (incoming === undefined || current === null) return false;
  const a = Date.parse(incoming);
  const b = Date.parse(current);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return a < b;
}

/**
 * Random id generator. Uses crypto.randomUUID when available; falls back to
 * a timestamp+random combination for environments without it. Slice tests
 * inject `__nodeIdGen` via setState if they need deterministic ids.
 */
function newNodeId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function newEdgeId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useGraphSlice = create<GraphSlice>((set, get) => ({
  ...INITIAL_STATE,

  hydrate(workflowId, def, revision) {
    const state = get();
    const sameWorkflow = state.workflowId === workflowId;
    // Slice 4.BUILDER-APPLY-HYDRATE-RACE-1 — refuse a STALE re-hydrate for the
    // same workflow so a late/older prop hydrate can't overwrite a freshly
    // applied (newer) graph. A different workflow id always hydrates.
    if (sameWorkflow && isStaleRevision(revision, state.hydratedRevision)) {
      return;
    }
    const nextRevision = sameWorkflow
      ? revision ?? state.hydratedRevision ?? null
      : revision ?? null;
    set({
      workflowId,
      isHydrated: true,
      savedNodes: def.nodes,
      savedEdges: def.edges,
      pendingNodes: def.nodes,
      pendingEdges: def.edges,
      isDirty: false,
      isSaving: false,
      saveError: null,
      hydratedRevision: nextRevision,
    });
  },

  reset() {
    set({ ...INITIAL_STATE });
  },

  addTrigger(input) {
    const { pendingNodes } = get();
    if (pendingNodes.some((n) => n.kind === "trigger")) {
      throw new Error(
        "Workflow already has a trigger. Remove it first to add another.",
      );
    }
    const node: WorkflowNode = {
      id: newNodeId(),
      kind: "trigger",
      provider: input.provider,
      type: input.type ?? "",
      config: input.config ?? {},
      position: { x: 0, y: 0 },
    };
    set({
      pendingNodes: [node, ...pendingNodes],
      isDirty: true,
      saveError: null,
    });
    return node;
  },

  addAction(input) {
    const { pendingNodes, pendingEdges } = get();
    if (pendingNodes.length === 0) {
      throw new Error("Add a trigger before adding actions.");
    }
    const lastNode = pendingNodes[pendingNodes.length - 1]!;
    const node: WorkflowNode = {
      id: newNodeId(),
      kind: "action",
      provider: input.provider,
      type: input.type ?? "",
      config: input.config ?? {},
      position: { x: 0, y: (pendingNodes.length) * 120 },
    };
    const newEdge: WorkflowEdge = {
      id: newEdgeId(),
      from: lastNode.id,
      to: node.id,
    };
    set({
      pendingNodes: [...pendingNodes, node],
      pendingEdges: [...pendingEdges, newEdge],
      isDirty: true,
      saveError: null,
    });
    return node;
  },

  addActionFromMeta(meta) {
    // Delegates to addAction with metadata-derived defaults so the
    // dirty-check + edge-creation behavior stays single-sourced.
    return get().addAction({
      provider: meta.provider,
      type: meta.type,
      config: deriveDefaultConfig(meta),
    });
  },

  addTriggerFromMeta(meta) {
    // Slice 3.3 — mirror of addActionFromMeta. Delegates to addTrigger
    // so the single-trigger-per-workflow guard + dirty-check stay
    // single-sourced. Same metadata-derived defaults policy as actions.
    const triggerNode = get().addTrigger({
      provider: meta.provider,
      type: meta.type,
      config: deriveDefaultConfig(meta),
    });
    // Slice 4.BUILDER-TRIGGER-RECOVERY-1 — when the user re-adds a trigger to a
    // workflow that still has actions but lost its trigger, reconnect the new
    // trigger to the sole root action so the chain is runnable again. Only
    // fires when the target is unambiguous (exactly one root action); a fresh
    // trigger id can never self-loop or duplicate an existing edge, but the
    // try/catch keeps this defensive against connectNodes' guards. No-op for
    // the empty-canvas first-trigger flow (no actions → no root → null).
    const rootActionId = findSoleRootActionId(
      get().pendingNodes,
      get().pendingEdges,
    );
    if (rootActionId !== null) {
      try {
        get().connectNodes({ from: triggerNode.id, to: rootActionId });
      } catch {
        // Leave the trigger unconnected; validation / edge UI guides the user.
      }
    }
    return triggerNode;
  },

  updateNodeConfig(nodeId, config) {
    const { pendingNodes } = get();
    const idx = pendingNodes.findIndex((n) => n.id === nodeId);
    if (idx === -1) return;
    const current = pendingNodes[idx]!;
    // Cheap shallow-equality short-circuit: if values match, no-op.
    const currentKeys = Object.keys(current.config);
    const nextKeys = Object.keys(config);
    if (currentKeys.length === nextKeys.length) {
      let same = true;
      for (const k of currentKeys) {
        if (current.config[k] !== config[k]) {
          same = false;
          break;
        }
      }
      if (same) return;
    }
    const updated: WorkflowNode = { ...current, config: { ...config } };
    const nextNodes = [...pendingNodes];
    nextNodes[idx] = updated;
    set({
      pendingNodes: nextNodes,
      isDirty: true,
      saveError: null,
    });
  },

  removeNode(nodeId) {
    const { pendingNodes, pendingEdges } = get();
    const remaining = pendingNodes.filter((n) => n.id !== nodeId);
    if (remaining.length === pendingNodes.length) return; // not found, no-op
    const newEdges = pendingEdges.filter(
      (e) => e.from !== nodeId && e.to !== nodeId,
    );
    set({
      pendingNodes: remaining,
      pendingEdges: newEdges,
      isDirty: true,
      saveError: null,
    });
  },

  renameNode(nodeId, displayName) {
    const { pendingNodes } = get();
    const idx = pendingNodes.findIndex((n) => n.id === nodeId);
    if (idx === -1) return;
    const current = pendingNodes[idx]!;
    const trimmed = displayName?.trim();
    const next = trimmed && trimmed.length > 0 ? trimmed : undefined;
    if (current.displayName === next) return; // no-op (covers undefined === undefined)
    const updated: WorkflowNode = { ...current };
    if (next === undefined) {
      delete updated.displayName;
    } else {
      updated.displayName = next;
    }
    const nextNodes = [...pendingNodes];
    nextNodes[idx] = updated;
    set({
      pendingNodes: nextNodes,
      isDirty: true,
      saveError: null,
    });
  },

  updateNodePosition(nodeId, position) {
    const { pendingNodes } = get();
    const idx = pendingNodes.findIndex((n) => n.id === nodeId);
    if (idx === -1) return;
    const current = pendingNodes[idx]!;
    if (
      current.position.x === position.x &&
      current.position.y === position.y
    ) {
      return; // shallow-equal — no dirty flip.
    }
    const updated: WorkflowNode = {
      ...current,
      position: { x: position.x, y: position.y },
    };
    const nextNodes = [...pendingNodes];
    nextNodes[idx] = updated;
    set({
      pendingNodes: nextNodes,
      isDirty: true,
      saveError: null,
    });
  },

  connectNodes({ from, to }) {
    const { pendingNodes, pendingEdges } = get();
    if (from === to) {
      throw new Error("Self-loops are not allowed.");
    }
    if (!pendingNodes.some((n) => n.id === from)) {
      throw new Error(`Unknown source node '${from}'.`);
    }
    if (!pendingNodes.some((n) => n.id === to)) {
      throw new Error(`Unknown target node '${to}'.`);
    }
    // Dedup unlabeled edges. Labels are deferred to Slice 3.6.
    if (
      pendingEdges.some(
        (e) => e.from === from && e.to === to && e.label === undefined,
      )
    ) {
      throw new Error(
        `An edge from '${from}' to '${to}' already exists.`,
      );
    }
    const edge: WorkflowEdge = {
      id: newEdgeId(),
      from,
      to,
    };
    set({
      pendingEdges: [...pendingEdges, edge],
      isDirty: true,
      saveError: null,
    });
    return edge;
  },

  removeEdge(edgeId) {
    const { pendingEdges } = get();
    const remaining = pendingEdges.filter((e) => e.id !== edgeId);
    if (remaining.length === pendingEdges.length) return;
    set({
      pendingEdges: remaining,
      isDirty: true,
      saveError: null,
    });
  },

  deleteNodeAndRewire(nodeId) {
    const { pendingNodes, pendingEdges } = get();
    const result = deleteNodeFromGraph({
      nodes: pendingNodes,
      edges: pendingEdges,
      nodeId,
      newEdgeId,
    });
    if (!result.ok) {
      return { ok: false, reason: result.reason, message: result.message };
    }
    set({
      pendingNodes: result.nodes,
      pendingEdges: result.edges,
      isDirty: true,
      saveError: null,
    });
    return {
      ok: true,
      deletedNodeId: result.deletedNode.id,
      removedEdgeIds: result.removedEdgeIds,
      rewiredEdgeId: result.rewiredEdgeId,
      warning: result.warning,
    };
  },

  async save() {
    const { workflowId, pendingNodes, pendingEdges, isSaving } = get();
    if (!workflowId) {
      throw new Error("graphSlice.save() called before hydrate().");
    }
    if (isSaving) return; // single-flight
    set({ isSaving: true, saveError: null });
    try {
      const updated = await updateWorkflow(workflowId, {
        draftDefinition: {
          nodes: [...pendingNodes],
          edges: [...pendingEdges],
        },
      });
      set({
        savedNodes: updated.draftDefinition.nodes,
        savedEdges: updated.draftDefinition.edges,
        // The user could keep editing during save; the pending* values they
        // see should not snap back to the server payload. Reconcile only
        // when pending == what we just sent, otherwise leave dirty.
        ...(pendingNodes === get().pendingNodes && pendingEdges === get().pendingEdges
          ? { pendingNodes: updated.draftDefinition.nodes, pendingEdges: updated.draftDefinition.edges, isDirty: false }
          : { isDirty: true }),
        isSaving: false,
      });
    } catch (err) {
      const message =
        err instanceof WorkflowApiError ? err.message : "Failed to save workflow.";
      set({ isSaving: false, saveError: message });
      throw err;
    }
  },
}));
