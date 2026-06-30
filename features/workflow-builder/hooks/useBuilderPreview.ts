"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "@/contracts/workflow";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { AgentApplyMode } from "@/contracts/agentApplyModes";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";
import { planToBuilderPatch } from "@/core/workflows/planToBuilderPatch";
import { buildConfigDiff, type ConfigDiff } from "@/core/workflows/buildConfigDiff";
import {
  buildPreviewRationale,
  type AgentPreviewRationale,
} from "@/core/workflows/buildPreviewRationale";
import type { ConfigDiffFieldMetaByType } from "@/core/workflows/configDiffFieldMeta";
import {
  EMPTY_AGENT_CHANGE_COUNTS,
  buildAgentChangeTitle,
  summarizeConfigDiff,
} from "./agentChangeSummary";
import { mintAgentChangeId, useAgentChangeEmission } from "./useAgentChangeEmission";
import { buildPreviewDiffGraph } from "../utils/buildPreviewDiffGraph";
import {
  buildAppliedConfigHints,
  firstIncompleteAppliedNodeId,
} from "../utils/appliedConfigHints";
import { useGraphSlice } from "../state/graphSlice";
import { useConfigSlice } from "../state/configSlice";
import { useWorkflowCheckpoints } from "./useWorkflowCheckpoints";
import type { RequiredFieldsByType } from "../validation/collectBuilderValidationIssues";

/**
 * Builder AI-preview lifecycle + checkpoint orchestration (extracted from
 * WorkflowBuilder.tsx, no behavior change).
 *
 * Co-locates the tightly-coupled state these features share:
 *   - the ephemeral, non-applied AI draft preview overlay + guided-setup values,
 *   - the post-apply confirmation notice + applied-node hints,
 *   - the value-level config diff for the "Review changes" rail, and
 *   - durable "before agent changes" checkpoints (create-before-apply + restore).
 *
 * `handleApplyPreview` writes BOTH preview state and a checkpoint; `handleRestoreCheckpoint`
 * writes BOTH checkpoint state and the preview notice — so they live in one hook rather
 * than two that would have to thread setters across the boundary. Pure orchestration: the
 * only server effects are the typed checkpoint client API (via useWorkflowCheckpoints).
 */

/** The ephemeral preview overlay shown over the canvas (UI-only; never mutates the draft). */
export interface BuilderPreviewOverlayState {
  plan: WorkflowPlan;
  preview: DraftPreview;
  /**
   * HERMES-AGENT-WORKFLOW-EDITOR — for a general EDIT proposal, the exact catalog-validated end-state
   * graph. When present, Apply REPLACES the local draft with this (atomic, via `replaceGraphLocal`)
   * instead of running the additive new-workflow patch. Absent → the new-workflow additive path.
   */
  proposedDefinition?: WorkflowDefinition;
  /**
   * HERMES-AGENT-WORKFLOW-EDITOR-LIVE — the draft version the proposal was validated against. Apply
   * re-checks the live draft against it and refuses to replace a canvas that changed since.
   */
  baseGraphVersion?: string;
  /** CHECKPOINTS-1 — the user prompt that drove this change, recorded on the pre-apply checkpoint. */
  prompt?: string;
  /**
   * AGENT-CHANGE-HISTORY-1 — the change-history correlation id minted when this preview is shown.
   * Threaded so apply/discard transition the SAME timeline row. Set by `handleShowPreview`.
   */
  agentChangeId?: string;
}

export interface UseBuilderPreviewInput {
  workflowId: string;
  localOnly?: boolean;
  requiredFieldsByType?: RequiredFieldsByType;
  setupFieldsByType?: PreviewSetupFieldsByType;
  fieldMetaByType?: ConfigDiffFieldMetaByType;
  pendingNodes: readonly WorkflowNode[];
  pendingEdges: readonly WorkflowEdge[];
  /**
   * REACT-AGENT-APPLY-MODES-1 — dispatch a safe TEST run of the (just-saved) draft.
   * Injected by WorkflowBuilder (it owns the run controls). `handleApplyAndTest`
   * calls it AFTER the apply is persisted; absent → apply-and-test is unavailable.
   */
  runTestAfterApply?: () => Promise<void>;
}

export function useBuilderPreview({
  workflowId,
  localOnly,
  requiredFieldsByType,
  setupFieldsByType,
  fieldMetaByType,
  pendingNodes,
  pendingEdges,
  runTestAfterApply,
}: UseBuilderPreviewInput) {
  // HERMES-AGENT-BUILDER-PREVIEW-OVERLAY — ephemeral, UI-ONLY non-applied AI draft preview shown as a
  // ghost overlay over the canvas. It is deliberately plain React state (NOT the graph store): showing
  // it never touches pendingNodes/draftDefinition, never marks dirty, never autosaves. It carries the
  // display `preview` AND the validated `plan` (the source of truth for an explicit Apply). Discarding
  // just sets it back to null (no rollback needed — real state was never mutated).
  const [previewOverlay, setPreviewOverlay] = useState<BuilderPreviewOverlayState | null>(null);
  // HERMES-AGENT-PREVIEW-CANVAS-STATE-AND-FIT — per-show counter. Bumped each time a preview is shown so
  // the canvas fits the viewport once per show (and re-fits when a preview supersedes another). The
  // canvas reads `previewToken` (this count while a preview is active, else null) to fit + hide the
  // empty-state card. UI-only — never touches the draft.
  const [previewShowCount, setPreviewShowCount] = useState(0);
  // HERMES-AGENT-APPLY-PREVIEW-PATCH — transient confirmation after an explicit "Apply preview".
  const [applyNotice, setApplyNotice] = useState<string | null>(null);
  // HERMES-AGENT-APPLY-CONFIG-HINTS — ids of the nodes the most recent apply ADDED. Drives the
  // short-lived "Added from preview" badge on those cards AND the post-apply required-field hint
  // list. Lifetime is tied to the notice: cleared on dismiss / workflow switch / a new preview.
  const [appliedNodeIds, setAppliedNodeIds] = useState<readonly string[]>([]);
  // HERMES-AGENT-GUIDED-PREVIEW-SETUP — ephemeral guided-setup values for the CURRENT holographic
  // preview, keyed by previewId → fieldName → value. Preview-only: never written to configSlice / the
  // real draft / DB, never makes the workflow dirty. Cleared when a new preview supersedes, on
  // discard, and on workflow switch/unmount. Seeded into the new nodes' config ONLY on explicit Apply.
  const [previewConfig, setPreviewConfig] = useState<Record<string, Record<string, unknown>>>({});

  // CHECKPOINTS-1 — durable "before agent changes" restore points. The hook owns load/create/restore
  // (typed client API only); the builder owns the graph re-hydration on restore. Disabled for the
  // logged-out local-only builder (no account / no server draft). `checkpointWarning` surfaces a
  // non-blocking notice if creating a restore point fails on apply.
  const checkpointsEnabled = !localOnly;
  const {
    checkpoints,
    loading: checkpointsLoading,
    error: checkpointsError,
    restoringId: checkpointRestoringId,
    restoreError: checkpointRestoreError,
    createReactAgentCheckpoint,
    restore: restoreCheckpoint,
  } = useWorkflowCheckpoints(workflowId, { enabled: checkpointsEnabled });
  const [checkpointWarning, setCheckpointWarning] = useState<string | null>(null);

  // AGENT-CHANGE-HISTORY-1 — durable, account-scoped activity timeline of what the React Agent did.
  // Shares the enablement of checkpoints (disabled for the logged-out local-only builder). Emits at the
  // preview lifecycle seams below (shown / applied / discarded / failed / restored) + undo detection.
  // Fail-open: a failed record never breaks the preview flow.
  const agentChanges = useAgentChangeEmission(workflowId, { enabled: checkpointsEnabled });
  // Stable read of the current overlay for the stable (deps-free) discard handler.
  const previewOverlayRef = useRef<BuilderPreviewOverlayState | null>(null);
  previewOverlayRef.current = previewOverlay;

  // Drop any AI preview overlay / apply notice when switching workflows (setters are stable). This is
  // the preview-state half of WorkflowBuilder's per-workflow reset effect; the slice resets stay there.
  // checkpointWarning is intentionally NOT cleared here (matches the prior in-component behavior).
  useEffect(() => {
    setPreviewOverlay(null);
    setApplyNotice(null);
    setAppliedNodeIds([]);
    setPreviewConfig({});
  }, [workflowId]);

  // HERMES-AGENT-PREVIEW-DIFF-GRAPH — for an EDIT proposal, compose the SINGLE read-only diff graph
  // (current + candidate) the canvas renders instead of the live graph. Null for additive/no preview.
  const previewDiffGraph = useMemo(
    () =>
      previewOverlay?.proposedDefinition
        ? buildPreviewDiffGraph({ nodes: pendingNodes, edges: pendingEdges }, previewOverlay.proposedDefinition)
        : null,
    [previewOverlay, pendingNodes, pendingEdges],
  );

  // HERMES-AGENT-CONFIG-DIFF-REVIEW — value-level config diff for the right-rail "Review changes" panel
  // (the canvas keeps the structural node diff). Computed client-side from the same two inputs the canvas
  // diff uses; values are the user's own draft, redacted/summarized by the pure core helper. Wrapped so a
  // compute failure renders the panel's calm fallback instead of breaking the builder. Null when no EDIT
  // preview is active.
  const configDiff: ConfigDiff | null = useMemo(() => {
    if (!previewOverlay?.proposedDefinition) return null;
    try {
      return buildConfigDiff({
        current: { nodes: pendingNodes },
        candidate: { nodes: previewOverlay.proposedDefinition.nodes },
        ...(fieldMetaByType ? { fieldMetaByType } : {}),
      });
    } catch {
      return null;
    }
  }, [previewOverlay, pendingNodes, fieldMetaByType]);
  // True while an EDIT preview is active — the right drawer takes over with the review panel.
  const previewReviewActive = !!previewOverlay?.proposedDefinition;

  // REACT-AGENT-PREVIEW-WHY — deterministic "Why this change?" rationale shown at the top of the
  // review rail. Derived ONLY from the user's prompt, the (already redacted) config diff, and the
  // current/candidate node lists — no model call, no invented reasoning, no config values. The
  // agent's summary is carried through for display only. Wrapped so a builder failure degrades to
  // no rationale (the rail simply omits the section). Null when no EDIT preview is active.
  const previewRationale: AgentPreviewRationale | null = useMemo(() => {
    if (!previewOverlay?.proposedDefinition) return null;
    try {
      return buildPreviewRationale({
        ...(previewOverlay.prompt ? { prompt: previewOverlay.prompt } : {}),
        ...(previewOverlay.preview.summary ? { summary: previewOverlay.preview.summary } : {}),
        configDiff,
        current: { nodes: pendingNodes },
        candidate: { nodes: previewOverlay.proposedDefinition.nodes },
        ...(fieldMetaByType ? { fieldMetaByType } : {}),
      });
    } catch {
      return null;
    }
  }, [previewOverlay, pendingNodes, configDiff, fieldMetaByType]);

  // HERMES-AGENT-APPLY-CONFIG-HINTS — the per-node required-field hint list for the post-apply notice
  // (and the source for auto-opening the first incomplete node). Recomputes from the LIVE pending
  // nodes, so a hint clears as soon as the user fills the field. Field names come from metadata —
  // never inferred, never values.
  const appliedConfigHints = useMemo(
    () =>
      appliedNodeIds.length > 0
        ? buildAppliedConfigHints(appliedNodeIds, pendingNodes, requiredFieldsByType)
        : [],
    [appliedNodeIds, pendingNodes, requiredFieldsByType],
  );

  // HERMES-AGENT-BUILDER-PREVIEW-OVERLAY — open the ghost overlay with the validated plan + display
  // preview (clears any prior apply notice). Showing the overlay mutates nothing.
  const handleShowPreview = useCallback(
    (payload: BuilderPreviewOverlayState) => {
      setApplyNotice(null);
      setAppliedNodeIds([]);
      // A NEW preview supersedes the old one — drop any guided-setup values entered for the prior
      // preview (previewIds are positional and would otherwise collide across previews).
      setPreviewConfig({});
      // AGENT-CHANGE-HISTORY-1 — mint a correlation id so apply/discard transition the SAME timeline
      // row, and record a `preview_created` event. Counts come from a VALUE-FREE structural diff of the
      // current draft vs the proposed end-state (edit path); the additive new-workflow path has no
      // proposedDefinition → zero counts. The user's prompt + the preview summary carry the meaning.
      const agentChangeId = payload.agentChangeId ?? mintAgentChangeId();
      const withId: BuilderPreviewOverlayState = { ...payload, agentChangeId };
      // Compute the (already-secret-redacted) value diff ONCE: counts are derived from it, and the
      // diff itself is stored for the per-item "View diff" (edit path; additive new-workflow path has
      // no proposedDefinition → no diff/zero counts). The server re-scrubs + size-caps before persisting.
      let counts = EMPTY_AGENT_CHANGE_COUNTS;
      let showDiff: ConfigDiff | undefined;
      if (payload.proposedDefinition) {
        try {
          showDiff = buildConfigDiff({
            current: { nodes: useGraphSlice.getState().pendingNodes },
            candidate: { nodes: payload.proposedDefinition.nodes },
            ...(fieldMetaByType ? { fieldMetaByType } : {}),
          });
          counts = summarizeConfigDiff(showDiff);
        } catch {
          showDiff = undefined;
          counts = EMPTY_AGENT_CHANGE_COUNTS;
        }
      }
      agentChanges.emitPreviewCreated({
        agentChangeId,
        ...(payload.prompt ? { prompt: payload.prompt } : {}),
        title: buildAgentChangeTitle(counts),
        ...(payload.preview.summary ? { summary: payload.preview.summary } : {}),
        counts,
        ...(showDiff ? { diff: showDiff } : {}),
      });
      setPreviewOverlay(withId);
      // HERMES-AGENT-PREVIEW-CANVAS-STATE-AND-FIT — bump the per-show token so the canvas fits once for
      // this (possibly superseding) preview.
      setPreviewShowCount((c) => c + 1);
    },
    [agentChanges, fieldMetaByType],
  );

  // HERMES-AGENT-GUIDED-PREVIEW-SETUP-RAIL-UX — record one guided-setup value for the current preview,
  // entered in the RAIL setup card. Pure local state: never touches configSlice / the real draft / DB,
  // never makes the workflow dirty, never sent to Hermes/a model. Seeded into the new nodes ONLY on
  // explicit Apply.
  const handlePreviewConfigChange = useCallback(
    (previewId: string, fieldName: string, value: unknown) => {
      setPreviewConfig((prev) => ({
        ...prev,
        [previewId]: { ...(prev[previewId] ?? {}), [fieldName]: value },
      }));
    },
    [],
  );

  // HERMES-AGENT-APPLY-PREVIEW-PATCH — explicit, user-clicked apply. Builds a deterministic ADDITIVE
  // patch from the VALIDATED plan (not the display preview) and applies it to the LOCAL draft via the
  // graph slice — the same dirty-making path as manual edits. No save/activate/run; no separate
  // workflow. Then clears the overlay and shows a safe confirmation.
  const applyPreview = useCallback((applyMode: AgentApplyMode): boolean => {
    if (!previewOverlay) return false;
    // AGENT-CHANGE-HISTORY-1 — the correlation id minted when this preview was shown; transitions the
    // SAME timeline row from preview_created → applied / apply_failed.
    const agentChangeId = previewOverlay.agentChangeId;
    // CHECKPOINTS-1 — capture the EXACT pre-apply local draft (including any unsaved edits) BEFORE the
    // mutation, so a checkpoint can restore "what it looked like before this agent change". Read from
    // the store directly to avoid a stale closure.
    const preApply = useGraphSlice.getState();
    const beforeDefinition = {
      nodes: [...preApply.pendingNodes],
      edges: [...preApply.pendingEdges],
    };
    // HERMES-AGENT-WORKFLOW-EDITOR — a general EDIT proposal carries the exact catalog-validated end-state
    // graph. Apply REPLACES the local draft with it atomically (untouched nodes keep config/position;
    // the candidate was built FROM the current draft). New-workflow skeletons have no proposedDefinition
    // and take the additive path (insert after the user's selected/active node).
    // HERMES-AGENT-GUIDED-PREVIEW-SETUP-1 — additive path seeds new-node config from sanitized guided-setup values.
    const additivePatch = previewOverlay.proposedDefinition
      ? null
      : planToBuilderPatch(previewOverlay.plan, { previewConfig, ...(setupFieldsByType ? { setupFieldsByType } : {}) });
    const activeNodeId = useConfigSlice.getState().activeNodeId ?? undefined;
    const outcome = previewOverlay.proposedDefinition
      ? useGraphSlice.getState().replaceGraphLocal(
          previewOverlay.proposedDefinition,
          previewOverlay.baseGraphVersion ? { expectedBaseVersion: previewOverlay.baseGraphVersion } : {},
        )
      : additivePatch
        ? useGraphSlice.getState().applyAdditivePatch(additivePatch, activeNodeId ? { appendAfterNodeId: activeNodeId } : {})
        : null;
    // HERMES-AGENT-WORKFLOW-EDITOR-LIVE — stale candidate (user edited since): refuse + ask to re-propose.
    if (outcome && !outcome.ok && "reason" in outcome && outcome.reason === "stale") {
      setApplyNotice("Your workflow changed since this suggestion. Ask React to update it and try again.");
      setAppliedNodeIds([]);
      if (agentChangeId) {
        agentChanges.emitApplyFailed({
          agentChangeId,
          reason: "Your workflow changed since this suggestion, so it wasn't applied.",
        });
      }
      setPreviewOverlay(null);
      setPreviewConfig({});
      return false;
    }
    if (outcome?.ok) {
      // AGENT-CHANGE-HISTORY-1 (View diff) — capture the FAITHFUL before→after value diff for this
      // applied change (the actual draft delta, for BOTH the edit and additive paths), already
      // secret-redacted by the core helper. Stored on the timeline row so a past item can render
      // "View diff" read-only. Wrapped so a diff failure never blocks the apply.
      let appliedDiff: ConfigDiff | undefined;
      try {
        appliedDiff = buildConfigDiff({
          current: { nodes: beforeDefinition.nodes },
          candidate: { nodes: useGraphSlice.getState().pendingNodes },
          ...(fieldMetaByType ? { fieldMetaByType } : {}),
        });
      } catch {
        appliedDiff = undefined;
      }
      const appliedDiffArg = appliedDiff ? { diff: appliedDiff } : {};
      // CHECKPOINTS-1 — a real change landed: durably record a "Before React Agent change" restore
      // point with the captured pre-apply draft + the user's prompt + the change summary. Fire-and-
      // forget so apply stays instant; on failure surface a non-blocking warning (the local undo/redo
      // stack remains as the in-session fallback). Skipped for the logged-out local-only builder.
      if (!localOnly) {
        void createReactAgentCheckpoint({
          definition: beforeDefinition,
          ...(previewOverlay.prompt ? { prompt: previewOverlay.prompt } : {}),
          ...(previewOverlay.preview.summary ? { summary: previewOverlay.preview.summary } : {}),
        })
          .then((cp) => {
            // AGENT-CHANGE-HISTORY-1 — record the apply, LINKED to the restore point just captured so
            // the timeline item offers "Restore". The checkpoint id is only known here (client-created).
            // REACT-AGENT-APPLY-MODES-1 — applyMode records which variant the user chose.
            if (agentChangeId) agentChanges.emitApplied({ agentChangeId, checkpointId: cp.id, applyMode, ...appliedDiffArg });
          })
          .catch(() => {
            setCheckpointWarning("Couldn't save a restore point for this change.");
            // The change DID apply — record it even though the restore point couldn't be saved.
            if (agentChangeId) agentChanges.emitApplied({ agentChangeId, applyMode, ...appliedDiffArg });
          });
      }
      const placement = "placement" in outcome ? outcome.placement : "replaced";
      setApplyNotice(
        placement === "replaced"
          ? "Change applied to your draft — review required fields before saving or activating."
          : placement === "inserted_between"
            ? "Preview inserted into draft — review required fields before saving or activating."
            : placement === "side_chain"
              ? "Preview added as a separate draft chain because ChainReact could not safely determine where to insert it."
              : "Preview applied to draft — review required fields before saving or activating.",
      );
      // HERMES-AGENT-APPLY-CONFIG-HINTS — remember WHICH nodes this apply added so the cards show
      // the "Added from preview" badge and the notice lists each new node's still-empty required
      // fields (names only, from metadata). Nothing inferred / saved / run.
      setAppliedNodeIds(outcome.addedNodeIds);
      // HERMES-AGENT-AUTO-OPEN-FIRST-INCOMPLETE-AFTER-APPLY — UX only: open the first newly-added node
      // metadata confirms is incomplete. `openNode` is navigation only (never saves/activates/runs).
      const postApplyNodes = useGraphSlice.getState().pendingNodes;
      const incompleteId = firstIncompleteAppliedNodeId(
        buildAppliedConfigHints(outcome.addedNodeIds, postApplyNodes, requiredFieldsByType),
      );
      if (incompleteId) {
        const node = postApplyNodes.find((n) => n.id === incompleteId);
        useConfigSlice.getState().openNode({ nodeId: incompleteId, initialValues: node?.config ?? {} });
      }
    } else {
      // No patch could be built, or nothing safe to apply (e.g. trigger-only into a graph that
      // already has a trigger). Surface a safe, non-scary notice.
      setApplyNotice("ChainReact could not safely apply this preview.");
      setAppliedNodeIds([]);
      if (agentChangeId) {
        agentChanges.emitApplyFailed({
          agentChangeId,
          reason: "ChainReact could not safely apply this preview.",
        });
      }
    }
    setPreviewOverlay(null);
    setPreviewConfig({});
    return outcome?.ok === true;
  }, [previewOverlay, requiredFieldsByType, previewConfig, setupFieldsByType, fieldMetaByType, localOnly, createReactAgentCheckpoint, agentChanges]);

  // REACT-AGENT-APPLY-MODES-1 — the three explicit apply-mode handlers wired to the rail picker.
  // Availability (enabled / disabled-reason / confirmation) is decided deterministically in
  // WorkflowBuilder via `computeAgentApplyModes`; these handlers carry out the chosen action and
  // record the choice in the audit timeline. None of them activate the workflow.

  // "Apply to draft" — the existing local-draft apply (no save / run / activate). Kept as the
  // default handler so every existing call site (control bar, additive overlay, guidance rail)
  // behaves exactly as before.
  const handleApplyPreview = useCallback(() => {
    applyPreview("apply_to_draft");
  }, [applyPreview]);

  // "Apply and test" — apply to the draft, PERSIST it (run-now executes the saved draft, not the
  // in-memory pending graph), then dispatch a safe test run. Sequenced so the test validates the
  // change the user just applied. Never activates. The rail only enables this when the candidate is
  // ready + testable + not an active-trigger change, but we still guard each step here.
  const handleApplyAndTest = useCallback(async () => {
    if (!runTestAfterApply) return;
    const applied = applyPreview("apply_and_test");
    if (!applied) return;
    try {
      // Persist the just-applied draft so the test runs against it (not the stale saved copy).
      await useGraphSlice.getState().save();
    } catch {
      setApplyNotice(
        "Applied to your draft, but it couldn't be saved to test. Try Save, then Test from the header.",
      );
      return;
    }
    try {
      await runTestAfterApply();
    } catch {
      setApplyNotice(
        "Applied and saved your draft, but the test couldn't start. Try Test from the header.",
      );
    }
  }, [runTestAfterApply, applyPreview]);

  // "Keep as preview" — the explicit non-destructive choice when a change is dangerous/incomplete.
  // Records the decision in the audit timeline and LEAVES the preview active so the user keeps
  // reviewing; nothing is mutated, saved, or run.
  const handleKeepAsPreview = useCallback(() => {
    const agentChangeId = previewOverlayRef.current?.agentChangeId;
    if (agentChangeId) agentChanges.emitKeptAsPreview(agentChangeId);
  }, [agentChanges]);

  // CHECKPOINTS-1 — restore a checkpoint server-side, then re-hydrate the builder graph with the
  // returned (restored) draft. The restore advances updatedAt to a strictly-newer revision, so the
  // graphSlice hydrate guard accepts it even when the live draft is dirty (the confirmation in the
  // CheckpointsPanel already warned the user that unsaved changes are discarded). Pure UI navigation
  // after that (close any open inspector). Errors surface via the hook's restoreError in the panel.
  const handleRestoreCheckpoint = useCallback(
    (checkpointId: string) => {
      void restoreCheckpoint(checkpointId)
        .then((detail) => {
          useGraphSlice.getState().hydrate(workflowId, detail.draftDefinition, detail.updatedAt);
          useConfigSlice.getState().closeNode();
          setAppliedNodeIds([]);
          setApplyNotice("Checkpoint restored — your draft was returned to that earlier state.");
          setCheckpointWarning(null);
          // AGENT-CHANGE-HISTORY-1 — a restore is its own timeline event, linked to the checkpoint.
          agentChanges.emitRestored(checkpointId);
        })
        .catch(() => {
          // restoreError is set by the hook and rendered in the CheckpointsPanel.
        });
    },
    [restoreCheckpoint, workflowId, agentChanges],
  );

  // HERMES-AGENT-CONFIG-DIFF-REVIEW — shared "Discard preview" used by the canvas control bar / overlay
  // AND the right-rail review panel (incl. its drawer close ×/Esc). Drops the preview; the real draft was
  // never mutated, so there is nothing to roll back. Behavior is identical to the prior inline handlers.
  const handleDiscardPreview = useCallback(() => {
    // AGENT-CHANGE-HISTORY-1 — an explicit discard (canvas control, drawer ×/Esc) transitions the
    // timeline row. Read the current overlay via ref so this handler stays stable (deps-free). The
    // per-workflow reset clears the overlay directly (not through here), so this only fires on a real
    // user discard.
    const agentChangeId = previewOverlayRef.current?.agentChangeId;
    if (agentChangeId) agentChanges.emitDiscarded(agentChangeId);
    setPreviewOverlay(null);
    setPreviewConfig({});
  }, [agentChanges]);

  // The BuilderApplyNotice dismiss — clears the notice + applied-node hints.
  const dismissApplyNotice = useCallback(() => {
    setApplyNotice(null);
    setAppliedNodeIds([]);
  }, []);

  return {
    previewOverlay,
    previewShowCount,
    applyNotice,
    appliedConfigHints,
    previewConfig,
    previewDiffGraph,
    configDiff,
    previewRationale,
    previewReviewActive,
    // checkpoint surface (for CheckpointsPanel)
    checkpoints,
    checkpointsLoading,
    checkpointsError,
    checkpointWarning,
    checkpointRestoringId,
    checkpointRestoreError,
    // AGENT-CHANGE-HISTORY-1 — change-timeline surface (for AgentChangesPanel). Restore reuses the
    // checkpoint restore path above (checkpointRestoringId / checkpointRestoreError / handleRestoreCheckpoint).
    agentChanges: agentChanges.items,
    agentChangesLoading: agentChanges.loading,
    agentChangesError: agentChanges.error,
    // handlers
    handleShowPreview,
    handlePreviewConfigChange,
    handleApplyPreview,
    handleApplyAndTest,
    handleKeepAsPreview,
    handleRestoreCheckpoint,
    handleDiscardPreview,
    dismissApplyNotice,
  };
}
