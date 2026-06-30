"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "@/contracts/workflow";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";
import { planToBuilderPatch } from "@/core/workflows/planToBuilderPatch";
import { buildConfigDiff, type ConfigDiff } from "@/core/workflows/buildConfigDiff";
import type { ConfigDiffFieldMetaByType } from "@/core/workflows/configDiffFieldMeta";
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
}

export interface UseBuilderPreviewInput {
  workflowId: string;
  localOnly?: boolean;
  requiredFieldsByType?: RequiredFieldsByType;
  setupFieldsByType?: PreviewSetupFieldsByType;
  fieldMetaByType?: ConfigDiffFieldMetaByType;
  pendingNodes: readonly WorkflowNode[];
  pendingEdges: readonly WorkflowEdge[];
}

export function useBuilderPreview({
  workflowId,
  localOnly,
  requiredFieldsByType,
  setupFieldsByType,
  fieldMetaByType,
  pendingNodes,
  pendingEdges,
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
      setPreviewOverlay(payload);
      // HERMES-AGENT-PREVIEW-CANVAS-STATE-AND-FIT — bump the per-show token so the canvas fits once for
      // this (possibly superseding) preview.
      setPreviewShowCount((c) => c + 1);
    },
    [],
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
  const handleApplyPreview = useCallback(() => {
    if (!previewOverlay) return;
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
      setPreviewOverlay(null);
      setPreviewConfig({});
      return;
    }
    if (outcome?.ok) {
      // CHECKPOINTS-1 — a real change landed: durably record a "Before React Agent change" restore
      // point with the captured pre-apply draft + the user's prompt + the change summary. Fire-and-
      // forget so apply stays instant; on failure surface a non-blocking warning (the local undo/redo
      // stack remains as the in-session fallback). Skipped for the logged-out local-only builder.
      if (!localOnly) {
        void createReactAgentCheckpoint({
          definition: beforeDefinition,
          ...(previewOverlay.prompt ? { prompt: previewOverlay.prompt } : {}),
          ...(previewOverlay.preview.summary ? { summary: previewOverlay.preview.summary } : {}),
        }).catch(() => {
          setCheckpointWarning("Couldn't save a restore point for this change.");
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
    }
    setPreviewOverlay(null);
    setPreviewConfig({});
  }, [previewOverlay, requiredFieldsByType, previewConfig, setupFieldsByType, localOnly, createReactAgentCheckpoint]);

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
        })
        .catch(() => {
          // restoreError is set by the hook and rendered in the CheckpointsPanel.
        });
    },
    [restoreCheckpoint, workflowId],
  );

  // HERMES-AGENT-CONFIG-DIFF-REVIEW — shared "Discard preview" used by the canvas control bar / overlay
  // AND the right-rail review panel (incl. its drawer close ×/Esc). Drops the preview; the real draft was
  // never mutated, so there is nothing to roll back. Behavior is identical to the prior inline handlers.
  const handleDiscardPreview = useCallback(() => {
    setPreviewOverlay(null);
    setPreviewConfig({});
  }, []);

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
    previewReviewActive,
    // checkpoint surface (for CheckpointsPanel)
    checkpoints,
    checkpointsLoading,
    checkpointsError,
    checkpointWarning,
    checkpointRestoringId,
    checkpointRestoreError,
    // handlers
    handleShowPreview,
    handlePreviewConfigChange,
    handleApplyPreview,
    handleRestoreCheckpoint,
    handleDiscardPreview,
    dismissApplyNotice,
  };
}
