import { create } from "zustand";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "@/contracts/workflow";
import {
  WorkflowApiError,
  updateWorkflow,
} from "@/lib/api/workflows";

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
}

export interface AddNodeInput {
  provider: string;
  type?: string;
  /** Optional initial config (e.g. derived from ActionMeta.fields defaults). */
  config?: Record<string, unknown>;
}

export interface GraphSliceActions {
  hydrate(workflowId: string, def: WorkflowDefinition): void;
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
   */
  addTriggerFromMeta(meta: TriggerMeta): WorkflowNode;
  removeNode(nodeId: string): void;
  /**
   * Slice 3.2 — replace the named node's config. Caller passes the
   * full config object (typically the configSlice draft values for
   * the node). Sets `isDirty: true` if the config changed.
   */
  updateNodeConfig(nodeId: string, config: Record<string, unknown>): void;
  save(): Promise<void>;
}

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
});

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

  hydrate(workflowId, def) {
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
    return get().addTrigger({
      provider: meta.provider,
      type: meta.type,
      config: deriveDefaultConfig(meta),
    });
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
