import { create } from "zustand";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDefinition, WorkflowDetail, WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import type { WorkflowNodePosition } from "@/contracts/workflowDefinition";
import {
  normalizePresentation,
  type WorkflowPresentation,
} from "@/contracts/workflowPresentation";
import type { BuilderPreviewPatch } from "@/contracts/workflowPlanPreview";
import {
  addNodesToSectionCommand,
  createSectionCommand,
  removeNodesFromSectionCommand,
  renameSectionCommand,
  setSectionCollapsedCommand,
  ungroupSectionCommand,
  type SectionCommandOutcome,
  type SectionMutationRefusal,
  type SectionMutationResult,
} from "./presentationCommands";
import { isAdvancedBranchingNode } from "@/core/workflows/advancedBranching";
import { returnableBranchLabels } from "@/core/workflows/branchWiring";
import { computeEditableGraphVersion } from "@/core/workflows/editableGraphVersion";
import {
  WorkflowApiError,
  updateWorkflow,
} from "@/lib/api/workflows";
import {
  deleteNodeFromGraph,
  type DeleteNodeBlockedReason,
  type DeleteNodeWarning,
} from "../utils/deleteNodeFromGraph";
import {
  computeNonOverlappingPosition,
  findChainTailId,
  layoutWorkflowGraph,
} from "../utils/workflowLayout";
import {
  computeAdditivePatchPlacement,
  type AdditivePatchPlacementKind,
  type ResolvedInternalEdge,
} from "../utils/additivePatchPlacement";

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

  /**
   * 5.DUAL-BUILDER-1 CS-4 — presentation-only manual section metadata, part of
   * the SAME canonical draft as nodes/edges (never a separate store that could
   * drift). `null` = no sections. Reconciled to `savedPresentation` on save,
   * captured in undo/redo snapshots, and pruned to the live node set on every
   * node-set change (so removing a node prunes its membership atomically). The
   * engine, readiness, and entitlement never read it.
   */
  savedPresentation: WorkflowPresentation | null;
  pendingPresentation: WorkflowPresentation | null;

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

  /**
   * BUILDER-TOPBAR-UNDO-REDO — bounded draft-edit history. `past` holds prior
   * `{nodes,edges}` snapshots (oldest→newest); `future` holds undone snapshots
   * for redo. Captured automatically when an edit changes the pending graph
   * (see the wrapped `set`); cleared on `hydrate`/`reset`. LOCAL ONLY — never
   * persisted/sent anywhere; undo/redo only restore pending graph snapshots and
   * never save/activate/run/call a route.
   */
  past: readonly GraphSnapshot[];
  future: readonly GraphSnapshot[];
}

/** One bounded draft-graph snapshot for undo/redo (kept by reference for cheap dirty-vs-saved checks). */
export interface GraphSnapshot {
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly WorkflowEdge[];
  /** CS-4 — presentation is part of the same undoable draft snapshot. */
  readonly presentation: WorkflowPresentation | null;
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
   * Slice 4.BUILDER-CANVAS-ERGONOMICS-FIX-1 — append an action AFTER a SPECIFIC
   * node (the tail "+" affordance / a branch end), connecting `anchorNodeId → N`
   * and placing N at a non-overlapping slot below the anchor. Unlike `addAction`
   * (which picks the sole chain tail), this never guesses: the caller names the
   * exact branch end. Throws on an unknown anchor.
   */
  addActionAfter(anchorNodeId: string, input: AddNodeInput): WorkflowNode;
  /** Metadata-derived variant of `addActionAfter` (mirrors `addActionFromMeta`). */
  addActionAfterFromMeta(anchorNodeId: string, meta: ActionMeta): WorkflowNode;
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
   * unknown, when from === to (self-loop), or when an edge between the
   * same (from, to, label) already exists. `label` carries the branch
   * route ("true"/"false"/router route) the connection was drawn from
   * (BRANCH-ENT-1 C4); omitted = the always-run cleanup edge.
   */
  connectNodes(input: { from: string; to: string; label?: string }): WorkflowEdge;
  /**
   * Slice 3.5 — remove an edge by id (canvas keyboard-delete on a
   * selected edge). No-op on unknown edgeId.
   */
  removeEdge(edgeId: string): void;
  /**
   * Slice 4.BUILDER-CANVAS-LAYOUT-1 — re-arrange every node into a clean,
   * deterministic, non-overlapping top-down layout (delegates to the pure
   * `layoutWorkflowGraph`). A linear chain becomes a single column; branches
   * fan into columns; disconnected pieces stack. Pure layout only — never
   * touches node ids, edges, config, or execution. Marks the graph dirty only
   * when at least one position actually changed; a no-op (already tidy / empty)
   * leaves `isDirty` untouched.
   */
  autoLayout(): void;
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
  /**
   * HERMES-AGENT-APPLY-PREVIEW-PATCH — apply a deterministic, ADDITIVE-ONLY builder patch (derived
   * from a validated WorkflowPlan) to the LOCAL draft, exactly like user-added nodes/edges:
   *
   *   - Appends new nodes (real ids minted here) with EMPTY config (required fields surface as
   *     "needs setup" — nothing inferred) and edges from the patch's linear refs.
   *   - NEVER deletes/replaces/updates existing nodes, edges, or config — existing graph is untouched.
   *   - NO replace-trigger: a patch `trigger` node is SKIPPED when the graph already has a trigger
   *     (and across the patch itself once one trigger has been added) → `skippedTrigger: true`.
   *   - **Placement (HERMES-AGENT-APPLY-IN-PLACE / -INSERT-BETWEEN):** decided by the pure
   *     `computeAdditivePatchPlacement` helper. When the first added node is an ACTION and the
   *     selected/active node (`options.appendAfterNodeId`) has exactly ONE outgoing UNLABELED edge
   *     A→B, the chain is INSERTED between them (split A→B into A→firstNew + lastNew→B;
   *     `placement: "inserted_between"`). Selected with zero/multiple/labeled outgoing → `appended`
   *     after it. No selection + sole tail → `appended`. Blank graph → `blank`. Anything ambiguous
   *     (multi-tail / no anchor / trigger-first) → `side_chain`.
   *   - Edges are ADD-ONLY except the single split edge during `inserted_between` (replaced by two new
   *     edges involving a new id, so never a duplicate/invalid edge). All other existing edges + every
   *     existing node + its config/position are untouched. No branch rewrite (labeled edges never split).
   *   - Marks the graph dirty via the SAME mechanism as manual edits. Does NOT save/activate/run.
   *
   * Returns an outcome; never throws. `{ ok: false }` when nothing additive remained to apply.
   */
  applyAdditivePatch(
    patch: BuilderPreviewPatch,
    options?: { readonly appendAfterNodeId?: string },
  ): ApplyAdditivePatchOutcome;
  /**
   * HERMES-AGENT-WORKFLOW-EDITOR — atomically REPLACE the whole local draft graph with a
   * catalog-validated candidate definition (the exact end-state the React Agent proposed + the user
   * explicitly Applied). Untouched nodes keep their config/position (the candidate was built FROM the
   * current draft); new/changed nodes are laid out cleanly. Marks dirty via the normal mechanism. NO
   * save/activate/run/connect. Returns the ids of nodes that are NEW vs the prior graph (so the existing
   * post-apply "open the first incomplete node" UX works). This is the GENERAL mutation apply — it
   * supersedes any per-op local apply.
   */
  replaceGraphLocal(
    definition: { nodes: readonly WorkflowNode[]; edges: readonly WorkflowEdge[] },
    // HERMES-AGENT-WORKFLOW-EDITOR-LIVE — `expectedBaseVersion`: the draft version the candidate was
    // validated against. When provided, Apply re-checks the live pending graph and REFUSES (returns
    // `{ok:false, reason:"stale"}`) if it drifted since (the user kept editing) — never apply a patch to a
    // different graph version. Omitted (legacy callers / fallback) → no check, always applies.
    options?: { readonly expectedBaseVersion?: string },
  ):
    | { readonly ok: true; readonly addedNodeIds: readonly string[] }
    | { readonly ok: false; readonly reason: "stale" };
  /** Persist the pending graph → updated detail (callers react to server-side lifecycle
   * changes, e.g. a trigger edit that deactivates an active workflow); `undefined` if in-flight. */
  save(): Promise<WorkflowDetail | undefined>;
  /**
   * BUILDER-TOPBAR-UNDO-REDO — revert the last meaningful draft graph/config edit by restoring the most
   * recent `past` snapshot (the current state moves to `future` for redo). No-op when `past` is empty.
   * Pure-local: NEVER saves/activates/runs/tests/publishes or calls a route; only restores the pending
   * graph snapshot + recomputes `isDirty` vs the saved baseline. Config-panel re-sync is the caller's job.
   */
  undo(): void;
  /** BUILDER-TOPBAR-UNDO-REDO — re-apply the most recently undone edit (`future` → pending). No-op when empty. Same pure-local guarantees as `undo()`. */
  redo(): void;

  /**
   * 5.DUAL-BUILDER-1 CS-4 — presentation SECTION commands. All operate on
   * canonical node ids, mutate ONLY the presentation block (never nodes, edges,
   * config, positions, labels, or topology), mark the SAME workflow dirty, are
   * captured by undo/redo, and return a typed non-throwing result. The Document
   * command layer validates block contiguity/structural safety before calling
   * these; the store re-validates node existence and refuses (without mutation)
   * on a stale/empty selection.
   */
  createSection(input: {
    nodeIds: readonly string[];
    title: string;
    collapsed?: boolean;
  }): SectionMutationResult;
  /** Rename a section (trimmed, capped). No-op (still ok) when unchanged. */
  renameSection(sectionId: string, title: string): SectionMutationResult;
  /** Collapse/expand a section. No-op (still ok) when unchanged. */
  setSectionCollapsed(sectionId: string, collapsed: boolean): SectionMutationResult;
  /** Move node ids INTO a section (atomically removed from any prior section). */
  addNodesToSection(sectionId: string, nodeIds: readonly string[]): SectionMutationResult;
  /** Remove node ids from whatever section owns them; drop any emptied section. */
  removeNodesFromSection(nodeIds: readonly string[]): SectionMutationResult;
  /** Remove the section WRAPPER only — its member nodes stay exactly where they were. */
  ungroupSection(sectionId: string): SectionMutationResult;
}

// CS-4 — section command result types live in ./presentationCommands; re-exported
// so existing importers keep resolving them from the store module.
export type { SectionMutationResult, SectionMutationRefusal };

/** Outcome of {@link GraphSliceActions.applyAdditivePatch}. */
export type ApplyAdditivePatchOutcome =
  | {
      readonly ok: true;
      readonly addedNodeIds: readonly string[];
      readonly addedEdgeIds: readonly string[];
      /** True when a proposed trigger was skipped because the graph already had one (no replace). */
      readonly skippedTrigger: boolean;
      /**
       * Where the chain landed: `blank` (empty graph → origin), `appended` (after a safe anchor with
       * a new anchor edge), `inserted_between` (split the anchor's sole unlabeled edge: A→new…→B), or
       * `side_chain` (no safe anchor → detached chain to the right).
       */
      readonly placement: AdditivePatchPlacementKind;
    }
  | {
      readonly ok: false;
      readonly reason: "empty_patch" | "nothing_added";
      readonly skippedTrigger: boolean;
    };

/** Side-chain placement constants for an applied additive patch. */
const PATCH_SIDE_CHAIN_X_GAP = 400;
const PATCH_NODE_Y_GAP = 160;

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
  savedPresentation: null,
  pendingPresentation: null,
  isDirty: false,
  isSaving: false,
  saveError: null,
  hydratedRevision: null,
  past: [],
  future: [],
});

/** BUILDER-TOPBAR-UNDO-REDO — cap on retained snapshots so a long editing session can't grow unbounded. */
const MAX_HISTORY = 50;

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
 * Launch-blocker BUILDER-SAVE-WIPE-1 — is an incoming hydrate revision STRICTLY
 * NEWER than the currently-accepted one? Only a strictly-newer revision
 * represents genuinely fresh server data (e.g. an AI apply or an external
 * write). Unknown / unparseable / equal / older revisions are NOT newer, so a
 * re-hydrate carrying one must not clobber unsaved edits. Compared as epoch ms.
 */
function isStrictlyNewerRevision(incoming: string | undefined, current: string | null): boolean {
  if (incoming === undefined || current === null) return false;
  const a = Date.parse(incoming);
  const b = Date.parse(current);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return a > b;
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

/** CS-4 — stable id for a manual presentation section. */
function newSectionId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `section-${globalThis.crypto.randomUUID()}`;
  }
  return `section-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}


/**
 * BRANCH-ENT-1 C4 — after a branching node's config changes, drop its outgoing
 * labeled edges whose label the node can no longer return (stale routes).
 * Returns the filtered edge list, or null when nothing changed / the node has
 * no checkable vocabulary (non-branching, or a not-yet-valid Router config —
 * that state is owned by routes validation, never silently pruned).
 */
function reconcileBranchEdgesForNode(
  node: WorkflowNode,
  edges: readonly WorkflowEdge[],
): WorkflowEdge[] | null {
  if (!isAdvancedBranchingNode(node)) return null;
  const vocabulary = returnableBranchLabels(node);
  if (vocabulary === null) return null;
  const vocab = new Set(vocabulary);
  const next = edges.filter(
    (e) => !(e.from === node.id && e.label !== undefined && !vocab.has(e.label)),
  );
  return next.length === edges.length ? null : next;
}

export const useGraphSlice = create<GraphSlice>((rawSet, get) => {
  // BUILDER-TOPBAR-UNDO-REDO — history-capturing wrapper around the store setter. Every existing edit
  // action funnels through this `set`. An EDIT is an OBJECT partial that flips the graph DIRTY *and*
  // carries new pending nodes/edges; for those, the PRE-edit snapshot is pushed onto `past` and `future`
  // (redo) is cleared — merged into the SAME `set` so subscribers re-render once. Non-edits pass through
  // untouched and are excluded automatically: hydrate/reset/save-reconcile set `isDirty:false`; save's
  // leave-dirty + save-in-flight/failure carry no `pendingNodes`/`pendingEdges` key. undo()/redo() bypass
  // this wrapper (they call `rawSet`) so navigating history never records new history. The existing edit
  // actions are byte-identical — they simply use this `set`.
  const set: typeof rawSet = ((
    partial: Parameters<typeof rawSet>[0],
    replace?: boolean,
  ): void => {
    // CS-4 — a presentation-only edit (rename/collapse/wrap/ungroup) is also an
    // edit that history must capture, so it counts alongside node/edge edits.
    const isEdit =
      partial !== null &&
      typeof partial === "object" &&
      (partial as Partial<GraphSliceState>).isDirty === true &&
      ("pendingNodes" in partial ||
        "pendingEdges" in partial ||
        "pendingPresentation" in partial);
    if (isEdit) {
      // Edits are always partial updates (never a full replace), so a plain partial set is correct.
      const before = get();
      const p = partial as Partial<GraphSlice>;
      // CS-4 — when an edit changes the NODE SET but doesn't itself set
      // presentation (removeNode, deleteNodeAndRewire, replaceGraphLocal, an AI
      // patch), prune section membership to the surviving nodes atomically in
      // the SAME set. Empty sections drop out; `normalizePresentation` returns
      // the same reference when nothing changed, so a position/config edit keeps
      // presentation byte-identical.
      let applied = p;
      if ("pendingNodes" in p && !("pendingPresentation" in p) && before.pendingPresentation) {
        const ids = new Set((p.pendingNodes as readonly WorkflowNode[]).map((n) => n.id));
        const reconciled = normalizePresentation(before.pendingPresentation, ids);
        if (reconciled !== before.pendingPresentation) {
          applied = { ...p, pendingPresentation: reconciled };
        }
      }
      rawSet({
        ...applied,
        past: [
          ...before.past,
          {
            nodes: before.pendingNodes,
            edges: before.pendingEdges,
            presentation: before.pendingPresentation,
          },
        ].slice(-MAX_HISTORY),
        future: [],
      });
      return;
    }
    (rawSet as (p: typeof partial, r?: boolean) => void)(partial, replace);
  }) as typeof rawSet;

  return {
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
    // Launch-blocker BUILDER-SAVE-WIPE-1 — never let a re-hydrate that is NOT
    // strictly newer clobber UNSAVED edits. A late RSC re-render delivering the
    // same still-empty server draft (equal revision) would otherwise wipe the
    // nodes the user just added, and the next Save would persist the empty graph
    // (observed in prod: PATCH 200 carrying an empty draftDefinition; workflow
    // empty on reopen). Strictly-newer revisions still apply (AI apply / genuine
    // external write); a fresh mount is unaffected because isDirty is false.
    if (
      sameWorkflow &&
      state.isDirty &&
      !isStrictlyNewerRevision(revision, state.hydratedRevision)
    ) {
      return;
    }
    const nextRevision = sameWorkflow
      ? revision ?? state.hydratedRevision ?? null
      : revision ?? null;
    // CS-4 — hydrate presentation DEFENSIVELY: the repository read path casts
    // stored jsonb rather than parsing it, so `def.presentation` may be
    // malformed. `normalizePresentation` accepts unknown, prunes stale
    // membership against the hydrated nodes, and degrades to null on garbage —
    // it never crashes the builder. saved === pending by reference so the
    // dirty/undo checks match after a clean hydrate.
    const presentation = normalizePresentation(
      def.presentation,
      new Set(def.nodes.map((n) => n.id)),
    );
    set({
      workflowId,
      isHydrated: true,
      savedNodes: def.nodes,
      savedEdges: def.edges,
      pendingNodes: def.nodes,
      pendingEdges: def.edges,
      savedPresentation: presentation,
      pendingPresentation: presentation,
      isDirty: false,
      isSaving: false,
      saveError: null,
      hydratedRevision: nextRevision,
      // BUILDER-TOPBAR-UNDO-REDO — a fresh baseline (initial load / strictly-newer external revision)
      // starts a clean history; you can't undo across a hydrate.
      past: [],
      future: [],
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
    // Slice 4.BUILDER-CANVAS-LAYOUT-1 — append at the END OF THE CHAIN, not the
    // end of the array. The chain tail is the sole leaf (an action with no
    // outgoing edge); after a mid-chain insert / reorder the array tail is NOT
    // the chain tail, so anchoring on it branched off the middle. When the tail
    // is ambiguous (zero or ≥2 leaves — a branch / disconnected graph) we keep
    // the prior array-tail behavior. Position is computed to NEVER overlap an
    // existing node (the old `length * 120` heuristic collided after a delete
    // shrank the array). For a freshly-built linear chain this yields the exact
    // same positions as before.
    const tailId = findChainTailId(pendingNodes, pendingEdges);
    const anchor = (tailId ? pendingNodes.find((n) => n.id === tailId) : undefined)
      ?? pendingNodes[pendingNodes.length - 1]!;
    const node: WorkflowNode = {
      id: newNodeId(),
      kind: "action",
      provider: input.provider,
      type: input.type ?? "",
      config: input.config ?? {},
      position: computeNonOverlappingPosition(anchor.position, pendingNodes),
    };
    const newEdge: WorkflowEdge = {
      id: newEdgeId(),
      from: anchor.id,
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

  addActionAfter(anchorNodeId, input) {
    const { pendingNodes, pendingEdges } = get();
    const anchor = pendingNodes.find((n) => n.id === anchorNodeId);
    if (!anchor) {
      throw new Error("Cannot append after an unknown node.");
    }
    const node: WorkflowNode = {
      id: newNodeId(),
      kind: "action",
      provider: input.provider,
      type: input.type ?? "",
      config: input.config ?? {},
      // Non-overlap placement below the chosen branch end (BUILDER-CANVAS-LAYOUT-1
      // helper) so a branch-specific append never lands on an existing node.
      position: computeNonOverlappingPosition(anchor.position, pendingNodes),
    };
    const newEdge: WorkflowEdge = {
      id: newEdgeId(),
      from: anchor.id,
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

  addActionAfterFromMeta(anchorNodeId, meta) {
    return get().addActionAfter(anchorNodeId, {
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
    // BRANCH-ENT-1 C4 — reconcile branch edges with the new config so a
    // route the node can no longer return never survives as an invisible
    // stale edge: switching If/Then to onFalse="skip" drops its False
    // edge(s); removing/renaming a Router route drops that route's edges.
    // Re-enabling a route later starts UNWIRED (never silently reconnected).
    const nextEdges = reconcileBranchEdgesForNode(updated, get().pendingEdges);
    set({
      pendingNodes: nextNodes,
      ...(nextEdges !== null ? { pendingEdges: nextEdges } : {}),
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

  connectNodes({ from, to, label }) {
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
    // Dedup on (from, to, label) — mirrors WorkflowDefinitionSchema's edge
    // dedup key, so a branch node may run BOTH its True and False routes to
    // the same target, but the exact same route can't be drawn twice.
    if (
      pendingEdges.some(
        (e) => e.from === from && e.to === to && e.label === label,
      )
    ) {
      throw new Error(
        label === undefined
          ? `An edge from '${from}' to '${to}' already exists.`
          : `The "${label}" route already connects '${from}' to '${to}'.`,
      );
    }
    const edge: WorkflowEdge = {
      id: newEdgeId(),
      from,
      to,
      ...(label !== undefined ? { label } : {}),
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

  autoLayout() {
    const { pendingNodes, pendingEdges } = get();
    if (pendingNodes.length === 0) return;
    const laidOut = layoutWorkflowGraph(pendingNodes, pendingEdges);
    // layoutWorkflowGraph returns unchanged nodes BY REFERENCE, so a per-node
    // identity check tells us whether anything actually moved.
    const changed = laidOut.some((n, i) => n !== pendingNodes[i]);
    if (!changed) return;
    set({
      pendingNodes: laidOut,
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

  applyAdditivePatch(patch, options) {
    const { pendingNodes, pendingEdges } = get();
    if (!patch || patch.nodes.length === 0) {
      return { ok: false, reason: "empty_patch", skippedTrigger: false };
    }

    // 1. Resolve which patch nodes become real nodes (trigger skipped if one already exists), minting
    //    real ids. Positions are assigned in step 3 once placement is known.
    let triggerPresent = pendingNodes.some((n) => n.kind === "trigger");
    let skippedTrigger = false;
    const refToId = new Map<string, string>();
    const toAdd: Array<{
      id: string;
      kind: WorkflowNode["kind"];
      provider: string;
      type: string;
      config?: Readonly<Record<string, unknown>>;
    }> = [];
    for (const pn of patch.nodes) {
      // No replace-trigger: skip a proposed trigger when one already exists (existing graph OR an
      // earlier patch trigger). Edges referencing the skipped ref are dropped below.
      if (pn.kind === "trigger" && triggerPresent) {
        skippedTrigger = true;
        continue;
      }
      if (pn.kind === "trigger") triggerPresent = true;
      const id = newNodeId();
      refToId.set(pn.ref, id);
      // HERMES-AGENT-GUIDED-PREVIEW-SETUP-1 — carry any seeded config (already sanitized by the
      // producer) so the new node starts with the user's guided-setup values instead of empty config.
      toAdd.push({ id, kind: pn.kind, provider: pn.provider, type: pn.type, ...(pn.config ? { config: pn.config } : {}) });
    }
    if (toAdd.length === 0) {
      return { ok: false, reason: "nothing_added", skippedTrigger };
    }

    // 2. Resolve the proposed chain's internal edges to real ids (skipped-trigger refs drop out).
    const internalEdges: ResolvedInternalEdge[] = [];
    for (const pe of patch.edges) {
      const from = refToId.get(pe.fromRef);
      const to = refToId.get(pe.toRef);
      if (from && to && from !== to) internalEdges.push({ from, to });
    }

    // 3. Plan placement (pure): blank / appended / inserted_between (one safe edge split) / side_chain.
    const plan = computeAdditivePatchPlacement({
      pendingNodes,
      pendingEdges,
      toAdd,
      internalEdges,
      ...(options?.appendAfterNodeId ? { appendAfterNodeId: options.appendAfterNodeId } : {}),
      mintEdgeId: newEdgeId,
      sideChainXGap: PATCH_SIDE_CHAIN_X_GAP,
      nodeYGap: PATCH_NODE_Y_GAP,
    });

    // 4. Apply: append new nodes, remove ONLY the split edge (if any), add new edges. Existing nodes +
    //    their config/position + all other edges are untouched. Dirty via the normal mechanism.
    set({
      pendingNodes: [...pendingNodes, ...plan.addedNodes],
      pendingEdges: [
        ...pendingEdges.filter((e) => !plan.removedEdgeIds.includes(e.id)),
        ...plan.addedEdges,
      ],
      isDirty: true,
      saveError: null,
    });
    return {
      ok: true,
      addedNodeIds: plan.addedNodes.map((n) => n.id),
      addedEdgeIds: plan.addedEdges.map((e) => e.id),
      skippedTrigger,
      placement: plan.placement,
    };
  },

  replaceGraphLocal(definition, options) {
    const { pendingNodes, pendingEdges } = get();
    // HERMES-AGENT-WORKFLOW-EDITOR-LIVE — stale guard: refuse to replace a draft whose version drifted
    // from the one the proposal was pinned to. Never clobber edits the user made after the proposal.
    if (options?.expectedBaseVersion !== undefined) {
      const liveVersion = computeEditableGraphVersion({ nodes: pendingNodes, edges: pendingEdges });
      if (liveVersion !== options.expectedBaseVersion) {
        return { ok: false, reason: "stale" };
      }
    }
    const priorIds = new Set(pendingNodes.map((n) => n.id));
    // Nodes that are NEW (or whose capability changed) vs the prior graph → treat as "added" so the
    // post-apply UX (open the first incomplete node) can guide setup. By node id (stable refs).
    const priorById = new Map(pendingNodes.map((n) => [n.id, n]));
    const addedNodeIds = definition.nodes
      .filter((n) => {
        const prev = priorById.get(n.id);
        return !priorIds.has(n.id) || !prev || prev.provider !== n.provider || prev.type !== n.type;
      })
      .map((n) => n.id);
    // Clean layout for the candidate (new nodes otherwise stack at the origin). Existing nodes keep
    // their relative placement where the layout preserves it.
    const laidOut = layoutWorkflowGraph([...definition.nodes], [...definition.edges]);
    set({
      pendingNodes: laidOut,
      pendingEdges: [...definition.edges],
      isDirty: true,
      saveError: null,
    });
    return { ok: true, addedNodeIds };
  },

  async save() {
    const { workflowId, pendingNodes, pendingEdges, pendingPresentation, isSaving } = get();
    if (!workflowId) {
      throw new Error("graphSlice.save() called before hydrate().");
    }
    if (isSaving) return; // single-flight
    set({ isSaving: true, saveError: null });
    try {
      // CS-4 — include presentation ONLY when non-empty (normalized against the
      // nodes being saved), so a workflow with no sections sends the exact same
      // `{ nodes, edges }` payload as before. Save stays the SAME explicit PATCH
      // funnel; readiness/entitlement/engine ignore presentation server-side.
      const outboundPresentation = normalizePresentation(
        pendingPresentation,
        new Set(pendingNodes.map((n) => n.id)),
      );
      const updated = await updateWorkflow(workflowId, {
        draftDefinition: {
          nodes: [...pendingNodes],
          edges: [...pendingEdges],
          ...(outboundPresentation ? { presentation: outboundPresentation } : {}),
        },
      });
      // CS-4 — reconcile saved presentation from the server-echoed definition,
      // re-normalized against the echoed nodes (defensive; the read path casts).
      const savedPresentation = normalizePresentation(
        updated.draftDefinition.presentation,
        new Set(updated.draftDefinition.nodes.map((n) => n.id)),
      );
      set({
        savedNodes: updated.draftDefinition.nodes,
        savedEdges: updated.draftDefinition.edges,
        savedPresentation,
        // BUILDER-SAVE-WIPE-1 — track the server revision the save advanced to,
        // so a post-save RSC re-render at the SAME revision can't clobber any
        // further edits the user makes (the hydrate guard keys off this).
        hydratedRevision: updated.updatedAt,
        // The user could keep editing during save; the pending* values they
        // see should not snap back to the server payload. Reconcile only
        // when pending == what we just sent, otherwise leave dirty.
        ...(pendingNodes === get().pendingNodes &&
        pendingEdges === get().pendingEdges &&
        pendingPresentation === get().pendingPresentation
          ? {
              pendingNodes: updated.draftDefinition.nodes,
              pendingEdges: updated.draftDefinition.edges,
              pendingPresentation: savedPresentation,
              isDirty: false,
            }
          : { isDirty: true }),
        isSaving: false,
      });
      return updated;
    } catch (err) {
      const message =
        err instanceof WorkflowApiError ? err.message : "Failed to save workflow.";
      set({ isSaving: false, saveError: message });
      throw err;
    }
  },

  undo() {
    const {
      past,
      future,
      pendingNodes,
      pendingEdges,
      pendingPresentation,
      savedNodes,
      savedEdges,
      savedPresentation,
    } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1]!;
    // Restore via rawSet so navigating history never records new history. Dirty is recomputed against
    // the saved baseline BY REFERENCE (nodes + edges + presentation): history keeps the exact refs,
    // and hydrate/save set `saved* === pending*`, so undoing back to the saved state matches by ref.
    rawSet({
      pendingNodes: prev.nodes,
      pendingEdges: prev.edges,
      pendingPresentation: prev.presentation,
      past: past.slice(0, -1),
      future: [
        { nodes: pendingNodes, edges: pendingEdges, presentation: pendingPresentation },
        ...future,
      ].slice(0, MAX_HISTORY),
      isDirty: !(
        prev.nodes === savedNodes &&
        prev.edges === savedEdges &&
        prev.presentation === savedPresentation
      ),
      saveError: null,
    });
  },

  redo() {
    const {
      past,
      future,
      pendingNodes,
      pendingEdges,
      pendingPresentation,
      savedNodes,
      savedEdges,
      savedPresentation,
    } = get();
    if (future.length === 0) return;
    const next = future[0]!;
    rawSet({
      pendingNodes: next.nodes,
      pendingEdges: next.edges,
      pendingPresentation: next.presentation,
      past: [
        ...past,
        { nodes: pendingNodes, edges: pendingEdges, presentation: pendingPresentation },
      ].slice(-MAX_HISTORY),
      future: future.slice(1),
      isDirty: !(
        next.nodes === savedNodes &&
        next.edges === savedEdges &&
        next.presentation === savedPresentation
      ),
      saveError: null,
    });
  },

  // ---- CS-4 presentation section commands ---------------------------------
  // Each re-validates against LIVE pending state, mutates ONLY presentation,
  // marks dirty via `set` (history-captured), and refuses without mutation on a
  // stale/empty selection. `normalizePresentation` finalizes membership so a
  // node is never in two sections and no empty section persists.

  createSection(input) {
    return runSectionCommand(
      createSectionCommand({ nodes: get().pendingNodes, presentation: get().pendingPresentation }, input, newSectionId),
    );
  },
  renameSection(sectionId, title) {
    return runSectionCommand(
      renameSectionCommand({ nodes: get().pendingNodes, presentation: get().pendingPresentation }, sectionId, title),
    );
  },
  setSectionCollapsed(sectionId, collapsed) {
    return runSectionCommand(
      setSectionCollapsedCommand({ nodes: get().pendingNodes, presentation: get().pendingPresentation }, sectionId, collapsed),
    );
  },
  addNodesToSection(sectionId, nodeIds) {
    return runSectionCommand(
      addNodesToSectionCommand({ nodes: get().pendingNodes, presentation: get().pendingPresentation }, sectionId, nodeIds),
    );
  },
  removeNodesFromSection(nodeIds) {
    return runSectionCommand(
      removeNodesFromSectionCommand({ nodes: get().pendingNodes, presentation: get().pendingPresentation }, nodeIds),
    );
  },
  ungroupSection(sectionId) {
    return runSectionCommand(
      ungroupSectionCommand({ nodes: get().pendingNodes, presentation: get().pendingPresentation }, sectionId),
    );
  },
  };

  /** Commit a pure section-command outcome: on success, set + mark dirty (history-captured). */
  function runSectionCommand(outcome: SectionCommandOutcome): SectionMutationResult {
    if (outcome.result.ok) {
      set({ pendingPresentation: outcome.presentation, isDirty: true, saveError: null });
    }
    return outcome.result;
  }
});
