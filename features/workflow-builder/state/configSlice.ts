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
   * DOC-CONFIG-SYNC-1 — the NODE half of the guidance focus identity. A field is
   * addressed canonically by `(nodeId, FieldMeta.name)`: two steps can both own a
   * field literally called `property`, and a bare key would let a stale highlight
   * land on the wrong step. The config panel only paints the highlight when this
   * matches its `activeNodeId`. `null` = legacy/unscoped focus (key-only), kept so
   * a caller that sets `focusFieldKey` without a node still behaves as before.
   */
  focusFieldNodeId: string | null;
  /**
   * DOC-CONFIG-SYNC-1 — which surface owns the current highlight, because the two
   * have different lifetimes:
   *
   *   - `"reveal"` — the AI-REPAIR-2F / validation / `?focus=` nudge. It is a
   *     one-shot "look here"; editing that field consumes it (unchanged).
   *   - `"inline"` — the Document Guided Stop is OPEN on this field. Here the
   *     highlight is a live "this is the field you're editing" indicator shown in
   *     the panel, so editing the field must NOT extinguish it. It is bound to the
   *     inline editor's lifetime: the editor clears it on close, and moves it when
   *     the user opens a different field.
   */
  focusFieldOrigin: "reveal" | "inline" | null;
  /**
   * Slice 4.AI-REPAIR-2F — the node the canvas should pan/zoom to. Read by the
   * canvas focus consumer (`useCanvasNodeFocus`). Paired with `canvasFocusSeq` so
   * repeated reveals of the SAME node re-trigger the pan (a bare id wouldn't).
   */
  canvasFocusNodeId: string | null;
  /** Monotonic counter bumped on each focus request so the canvas effect re-fires. */
  canvasFocusSeq: number;
  /**
   * BUILDER-CANVAS-FOCUS-SELECTED-NODE-1 — which focus intent drove the last signal:
   * `"reveal"` = the AI-REPAIR-2F "Go to field" deep reveal (close zoom, centered);
   * `"config"` = opening a node's config rail (gentler, context zoom + left offset so
   * the right-side config panel doesn't cover the node). Read by `useCanvasNodeFocus`
   * to pick zoom/offset/duration. Null before any focus request.
   */
  canvasFocusMode: "reveal" | "config" | null;
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
  /**
   * DOC-CONFIG-SYNC-1 — point the guidance highlight at `(nodeId, fieldKey)`
   * WITHOUT selecting, opening, panning, or hydrating anything. This is the
   * "two views of one field" signal used by the Document Guided Stop: the inline
   * editor already owns the selection, and this only tells the right-side config
   * panel which field container to reveal + ring.
   *
   * `fieldKey: null` clears the highlight, but only when the caller still owns it
   * (`focusFieldNodeId === nodeId`) — so a stale unmount can never yank a
   * highlight another surface has since claimed. NAVIGATION ONLY.
   */
  focusField(input: {
    nodeId: string;
    fieldKey: string | null;
    origin?: "reveal" | "inline";
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
   * BUILDER-AGENT-RAIL-EXISTING-NODE-SETUP-SYNC — sync an OPEN config draft after the node's config was
   * changed externally (e.g. the Agent rail "Update step" wrote new values into the graph node). Merges
   * `values` into BOTH the draft's `values` and `initialValues` for those keys, so the visible field
   * shows the new value and is NOT flagged as a pending edit. Other in-progress draft edits are
   * preserved (only the named keys change). The field highlight (`focusFieldKey`) is intentionally kept.
   * No-op when no draft exists for `nodeId` (the panel will read fresh config when next opened).
   * NAVIGATION/SYNC ONLY — it never writes back to the graph, saves, runs, or activates.
   */
  applyExternalConfig(input: {
    nodeId: string;
    values: Readonly<Record<string, unknown>>;
  }): void;
  /**
   * BUILDER-TOPBAR-UNDO-REDO — REPLACE an open draft's values + baseline with the node's current graph
   * config after an undo/redo restored it (so the visible panel can't show a stale value, and config
   * keys the undo REMOVED actually disappear — a full replace, unlike `applyExternalConfig`'s merge).
   * Clears errors, sets `isDirty:false` (matches the restored graph), and PRESERVES `activeNodeId` /
   * `focusFieldKey`. No-op when no draft exists for `nodeId`. SYNC ONLY — never writes back to the graph.
   */
  resyncDraftFromConfig(input: {
    nodeId: string;
    config: Readonly<Record<string, unknown>>;
  }): void;
  /**
   * 5.DUAL-BUILDER-1 CS-2 — restore a draft's VALUES to a caller-held
   * snapshot (the Document Guided Stop's Cancel/Escape path). Replaces
   * `values` wholesale, recomputes `isDirty` against the UNCHANGED
   * `initialValues` baseline, and clears inline errors — so abandoning an
   * inline edit returns the draft to exactly what it was when the stop
   * opened, without touching the graph or the committed baseline. No-op
   * when no draft exists for `nodeId`.
   */
  restoreDraftValues(input: {
    nodeId: string;
    values: Readonly<Record<string, unknown>>;
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
  focusFieldNodeId: null,
  focusFieldOrigin: null,
  canvasFocusNodeId: null,
  canvasFocusSeq: 0,
  canvasFocusMode: null,
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
    // BUILDER-CANVAS-FOCUS-SELECTED-NODE-1 — focus the canvas on a genuinely-NEW config
    // selection so the node stays connected to the editing experience. Re-opening the
    // already-active node does NOT re-pan (no annoying repeated zoom). Reveal/"Go to
    // field" keeps its own (closer, centered) path via `revealNode`.
    const isNewSelection = get().activeNodeId !== nodeId;
    const existing = get().drafts[nodeId];
    set({
      activeNodeId: nodeId,
      ...(existing
        ? {}
        : { drafts: { ...get().drafts, [nodeId]: makeDraft(nodeId, initialValues) } }),
      ...(isNewSelection
        ? {
            canvasFocusNodeId: nodeId,
            canvasFocusSeq: get().canvasFocusSeq + 1,
            canvasFocusMode: "config" as const,
          }
        : {}),
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
      focusFieldNodeId: fieldKey === undefined ? null : nodeId,
      focusFieldOrigin: fieldKey === undefined ? null : ("reveal" as const),
      canvasFocusNodeId: nodeId,
      canvasFocusSeq: get().canvasFocusSeq + 1,
      canvasFocusMode: "reveal" as const,
    });
  },

  focusField({ nodeId, fieldKey, origin }) {
    if (fieldKey === null) {
      // Only the current owner may clear — a late unmount must not steal a
      // highlight another field/step has already claimed.
      if (get().focusFieldNodeId !== nodeId) return;
      if (get().focusFieldKey === null) return;
      set({ focusFieldKey: null, focusFieldNodeId: null, focusFieldOrigin: null });
      return;
    }
    const nextOrigin = origin ?? "inline";
    if (
      get().focusFieldKey === fieldKey &&
      get().focusFieldNodeId === nodeId &&
      get().focusFieldOrigin === nextOrigin
    ) {
      return; // idempotent — never churn subscribers on a steady-state pass
    }
    set({ focusFieldKey: fieldKey, focusFieldNodeId: nodeId, focusFieldOrigin: nextOrigin });
  },

  clearFieldFocus() {
    if (get().focusFieldKey === null) return;
    set({ focusFieldKey: null, focusFieldNodeId: null, focusFieldOrigin: null });
  },

  closeNode() {
    set({
      activeNodeId: null,
      focusFieldKey: null,
      focusFieldNodeId: null,
      focusFieldOrigin: null,
    });
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
      // AI-REPAIR-2F — once the user edits the highlighted field, a one-shot
      // "go to field" nudge has served its purpose; clear it so it doesn't linger.
      // DOC-CONFIG-SYNC-1 — an `"inline"` highlight is NOT a nudge: it marks the
      // field an OPEN Guided Stop is editing, so it must survive that edit (the
      // inline editor clears/moves it on close). Scoped by node so an edit on one
      // step can never extinguish another step's highlight.
      ...(get().focusFieldOrigin === "reveal" &&
      get().focusFieldKey === name &&
      (get().focusFieldNodeId === null || get().focusFieldNodeId === targetId)
        ? { focusFieldKey: null, focusFieldNodeId: null, focusFieldOrigin: null }
        : {}),
    });
  },

  applyExternalConfig({ nodeId, values }) {
    const draft = get().drafts[nodeId];
    if (!draft) return; // panel not open for this node → nothing to sync
    const keys = Object.keys(values);
    if (keys.length === 0) return;
    const nextValues = { ...draft.values, ...values };
    const nextInitial = { ...draft.initialValues, ...values };
    // The externally-applied keys are now the committed baseline → drop any stale inline errors.
    const nextErrors = { ...draft.errors };
    for (const k of keys) delete nextErrors[k];
    set({
      drafts: {
        ...get().drafts,
        [nodeId]: {
          ...draft,
          values: nextValues,
          initialValues: nextInitial,
          errors: nextErrors,
          isDirty: !shallowEqual(nextValues, nextInitial),
          lastUpdatedAt: Date.now(),
        },
      },
      // focusFieldKey is intentionally PRESERVED so the rail-updated field stays highlighted.
    });
  },

  resyncDraftFromConfig({ nodeId, config }) {
    const draft = get().drafts[nodeId];
    if (!draft) return; // panel not open for this node → nothing to sync
    set({
      drafts: {
        ...get().drafts,
        [nodeId]: {
          ...draft,
          values: { ...config },
          initialValues: { ...config },
          errors: {},
          isDirty: false,
          lastUpdatedAt: Date.now(),
        },
      },
      // activeNodeId + focusFieldKey intentionally preserved.
    });
  },

  restoreDraftValues({ nodeId, values }) {
    const draft = get().drafts[nodeId];
    if (!draft) return;
    set({
      drafts: {
        ...get().drafts,
        [nodeId]: {
          ...draft,
          values: { ...values },
          errors: {},
          isDirty: !shallowEqual(values, draft.initialValues),
          lastUpdatedAt: Date.now(),
        },
      },
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
    set({
      drafts,
      activeNodeId,
      ...(get().focusFieldNodeId === nodeId || wasActive
        ? { focusFieldKey: null, focusFieldNodeId: null, focusFieldOrigin: null }
        : {}),
    });
  },

  reset() {
    set({ ...INITIAL_STATE });
  },
}));
