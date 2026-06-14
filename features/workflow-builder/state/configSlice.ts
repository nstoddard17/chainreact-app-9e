import { create } from "zustand";

/**
 * Builder config slice — in-progress per-node field edits.
 *
 * Per docs/rules/workflow-state-store.md + docs/slices/phase-3-builder-ui-plan.md §10
 * Slice 3.1:
 *   - graphSlice owns the saved graph + pending nodes/edges.
 *   - configSlice owns in-progress field edits for the currently-open
 *     node's config modal. Keyed by `nodeId` so the config rail can
 *     persist edits while the user navigates between selected nodes,
 *     and a future save action can pluck the dirty entry off this slice
 *     and pass it to graphSlice.
 *   - In-memory only; never persisted to localStorage.
 *   - No API calls; no service imports. The slice is a pure state
 *     container — saves go through hooks → typed client API → server.
 *   - Designed so an undo-stack slice can plug in alongside without
 *     restructuring (record `update*` action emissions; the
 *     `lastUpdatedAt` field makes the undo bookkeeping discoverable).
 */

export interface NodeConfigDraft {
  /** The node this draft belongs to. */
  nodeId: string;
  /** Current in-progress values keyed by FieldMeta.name. */
  values: Readonly<Record<string, unknown>>;
  /**
   * Inline field-level errors. Populated by callers running soft
   * validation; cleared per-field on `updateField`.
   */
  errors: Readonly<Record<string, string | undefined>>;
  /**
   * True iff `values` diverges from `initialValues`. Computed at update
   * time, not on every read, so dirty becomes a cheap O(1) check.
   */
  isDirty: boolean;
  /**
   * The initial values the draft was hydrated from. Used to compute
   * `isDirty` and to support a discard/reset action.
   */
  initialValues: Readonly<Record<string, unknown>>;
  /**
   * Wall-clock epoch milliseconds of the last field edit. Drives a
   * future "save indicator" / undo-stack timestamping without coupling
   * to graphSlice's save mechanics.
   */
  lastUpdatedAt: number | null;
}

export interface ConfigSliceState {
  /** Drafts by nodeId. Cleared when the node is removed from the graph. */
  drafts: Readonly<Record<string, NodeConfigDraft>>;
  /** Currently-open nodeId in the config rail, if any. */
  activeNodeId: string | null;
  /**
   * Slice 4.AI-REPAIR-2F — UX guidance focus. The field KEY (FieldMeta.name) the
   * config rail should visually highlight, if any. Set by `revealNode` when the
   * user clicks a "Go to field" affordance (e.g. from a blocked repair preview);
   * the SchemaForm highlights + scrolls to the matching field. NAVIGATION ONLY —
   * never changes a config value. Cleared on edit of that field / close / reset.
   */
  focusFieldKey: string | null;
  /**
   * Slice 4.AI-REPAIR-2F — the node the canvas should pan/zoom to. Read by the
   * canvas focus consumer (`useCanvasNodeFocus`). Paired with `canvasFocusSeq` so
   * repeated reveals of the SAME node re-trigger the pan (a bare id wouldn't).
   */
  canvasFocusNodeId: string | null;
  /** Monotonic counter bumped on each `revealNode` so the canvas effect re-fires. */
  canvasFocusSeq: number;
}

export interface ConfigSliceActions {
  /**
   * Open a node's config rail. If a draft already exists for the
   * nodeId, reuses it (preserving in-progress edits). Otherwise
   * initializes a fresh draft from `initialValues`.
   */
  openNode(input: {
    nodeId: string;
    initialValues: Readonly<Record<string, unknown>>;
  }): void;
  /**
   * Slice 4.AI-REPAIR-2F — open a node's config rail AND request UX focus:
   * highlight `fieldKey` in the rail (when given) and pan/zoom the canvas to the
   * node. Reuses `openNode`'s draft semantics (existing draft preserved). This is
   * NAVIGATION ONLY — it never mutates a config value, saves, runs, or changes the
   * graph. The draft it may create mirrors `initialValues` (isDirty stays false).
   */
  revealNode(input: {
    nodeId: string;
    initialValues: Readonly<Record<string, unknown>>;
    fieldKey?: string;
  }): void;
  /** Clear the field-highlight focus (e.g. after the user edits that field). */
  clearFieldFocus(): void;
  /** Close the config rail. In-progress draft is preserved. */
  closeNode(): void;
  /** Patch one field on the active (or specified) node. */
  updateField(input: {
    nodeId?: string;
    name: string;
    value: unknown;
  }): void;
  /**
   * Set / clear inline errors for one field on the active node. Pass
   * `undefined` to clear.
   */
  setFieldError(input: {
    nodeId?: string;
    name: string;
    error: string | undefined;
  }): void;
  /**
   * Reset the named node's draft back to its initial values (or to the
   * active node if no nodeId is supplied).
   */
  resetNode(nodeId?: string): void;
  /**
   * Mark the named node's draft as saved — sets `initialValues` to
   * current `values`, clears errors, flips isDirty to false. Used by
   * the future save flow once graphSlice persists the values.
   */
  markSaved(nodeId?: string): void;
  /**
   * Drop the named node's draft entirely. Called by graphSlice when a
   * node is removed from the graph.
   */
  dropNode(nodeId: string): void;
  /** Hard reset — used by tests and the workflow-leave flow. */
  reset(): void;
}

export type ConfigSlice = ConfigSliceState & ConfigSliceActions;

const INITIAL_STATE: ConfigSliceState = Object.freeze({
  drafts: {},
  activeNodeId: null,
  focusFieldKey: null,
  canvasFocusNodeId: null,
  canvasFocusSeq: 0,
});

function shallowEqual(
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function makeDraft(
  nodeId: string,
  initialValues: Readonly<Record<string, unknown>>,
): NodeConfigDraft {
  return {
    nodeId,
    values: { ...initialValues },
    errors: {},
    isDirty: false,
    initialValues: { ...initialValues },
    lastUpdatedAt: null,
  };
}

export const useConfigSlice = create<ConfigSlice>((set, get) => ({
  ...INITIAL_STATE,

  openNode({ nodeId, initialValues }) {
    const existing = get().drafts[nodeId];
    if (existing) {
      set({ activeNodeId: nodeId });
      return;
    }
    set({
      activeNodeId: nodeId,
      drafts: { ...get().drafts, [nodeId]: makeDraft(nodeId, initialValues) },
    });
  },

  revealNode({ nodeId, initialValues, fieldKey }) {
    const existing = get().drafts[nodeId];
    const drafts = existing
      ? get().drafts
      : { ...get().drafts, [nodeId]: makeDraft(nodeId, initialValues) };
    set({
      activeNodeId: nodeId,
      drafts,
      focusFieldKey: fieldKey ?? null,
      canvasFocusNodeId: nodeId,
      canvasFocusSeq: get().canvasFocusSeq + 1,
    });
  },

  clearFieldFocus() {
    if (get().focusFieldKey === null) return;
    set({ focusFieldKey: null });
  },

  closeNode() {
    set({ activeNodeId: null, focusFieldKey: null });
  },

  updateField({ nodeId, name, value }) {
    const targetId = nodeId ?? get().activeNodeId;
    if (!targetId) return;
    const draft = get().drafts[targetId];
    if (!draft) return;
    const nextValues = { ...draft.values, [name]: value };
    // Clear the field's inline error on edit — the renderer / caller can
    // re-set it after the next soft validation pass.
    const nextErrors = (() => {
      if (!(name in draft.errors)) return draft.errors;
      const copy = { ...draft.errors };
      delete copy[name];
      return copy;
    })();
    const isDirty = !shallowEqual(nextValues, draft.initialValues);
    set({
      drafts: {
        ...get().drafts,
        [targetId]: {
          ...draft,
          values: nextValues,
          errors: nextErrors,
          isDirty,
          lastUpdatedAt: Date.now(),
        },
      },
      // AI-REPAIR-2F — once the user edits the highlighted field, the guidance
      // highlight has served its purpose; clear it so it doesn't linger.
      ...(get().focusFieldKey === name ? { focusFieldKey: null } : {}),
    });
  },

  setFieldError({ nodeId, name, error }) {
    const targetId = nodeId ?? get().activeNodeId;
    if (!targetId) return;
    const draft = get().drafts[targetId];
    if (!draft) return;
    const nextErrors = { ...draft.errors };
    if (error === undefined) {
      delete nextErrors[name];
    } else {
      nextErrors[name] = error;
    }
    set({
      drafts: { ...get().drafts, [targetId]: { ...draft, errors: nextErrors } },
    });
  },

  resetNode(nodeId) {
    const targetId = nodeId ?? get().activeNodeId;
    if (!targetId) return;
    const draft = get().drafts[targetId];
    if (!draft) return;
    set({
      drafts: {
        ...get().drafts,
        [targetId]: {
          ...draft,
          values: { ...draft.initialValues },
          errors: {},
          isDirty: false,
          lastUpdatedAt: null,
        },
      },
    });
  },

  markSaved(nodeId) {
    const targetId = nodeId ?? get().activeNodeId;
    if (!targetId) return;
    const draft = get().drafts[targetId];
    if (!draft) return;
    set({
      drafts: {
        ...get().drafts,
        [targetId]: {
          ...draft,
          initialValues: { ...draft.values },
          errors: {},
          isDirty: false,
        },
      },
    });
  },

  dropNode(nodeId) {
    const drafts = { ...get().drafts };
    if (!(nodeId in drafts)) return;
    delete drafts[nodeId];
    const wasActive = get().activeNodeId === nodeId;
    const activeNodeId = wasActive ? null : get().activeNodeId;
    set({ drafts, activeNodeId, ...(wasActive ? { focusFieldKey: null } : {}) });
  },

  reset() {
    set({ ...INITIAL_STATE });
  },
}));
