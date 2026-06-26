"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import { planToBuilderPatch } from "@/core/workflows/planToBuilderPatch";
import { draftPreviewSignature } from "@/core/workflows/canvasPreviewEligibility";
import { useRestoredDraftHandoff } from "./hooks/useRestoredDraftHandoff";
import { RestoredDraftBanner } from "./panels/RestoredDraftBanner";
import { WorkflowCanvas } from "./canvas/WorkflowCanvas";
import { BuilderPreviewOverlay } from "./canvas/BuilderPreviewOverlay";
import { BuilderPreviewControlBar } from "./canvas/BuilderPreviewControlBar";
import { buildPreviewDiffGraph } from "./utils/buildPreviewDiffGraph";
import { BuilderApplyNotice } from "./canvas/BuilderApplyNotice";
import { buildAppliedConfigHints, firstIncompleteAppliedNodeId } from "./utils/appliedConfigHints";
import {
  BuilderTeamProvider,
  type BuilderTeamContextValue,
} from "./context/builderTeamContext";
import { BuilderHeader } from "./layout/BuilderHeader";
import { BuilderLeftAgentRail } from "./layout/BuilderLeftAgentRail";
import { BuilderRightDrawer } from "./layout/BuilderRightDrawer";
import { BuilderShell } from "./layout/BuilderShell";
import { ActiveAccountMismatchBanner } from "./layout/ActiveAccountMismatchBanner";
import { WorkflowDisabledBanner } from "./layout/WorkflowDisabledBanner";
import {
  AddNodePanel,
  type AddNodePanelMode,
  type ProviderOption,
} from "./panels/AddNodePanel";
import { BuilderGuidanceRail } from "./panels/BuilderGuidanceRail";
import { AnonymousAgentRail } from "./panels/AnonymousAgentRail";
import { LocalBuildBanner, LocalConfigNote } from "./panels/AnonymousLocalChrome";
import { NodeInspectorPanel } from "./panels/NodeInspectorPanel";
import { RunResultsPanel } from "./panels/RunResultsPanel";
import { useConfigSlice } from "./state/configSlice";
import { useGraphSlice } from "./state/graphSlice";
import { useRunSlice } from "./state/runSlice";
import { useLatestRunPolling } from "./hooks/useLatestRunPolling";
import { useBuilderHistoryShortcuts } from "./hooks/useBuilderHistoryShortcuts";
import { useLeftAgentRail } from "./hooks/useLeftAgentRail";
import { useRightDrawer } from "./hooks/useRightDrawer";
import { useAgentRailWiring } from "./hooks/useAgentRailWiring";
import { insertActionAtEdge } from "./utils/insertActionAtEdge";
import { ValidationSummary } from "./validation/ValidationSummary";

interface Props {
  workflow: WorkflowDetail;
  triggerProviders: readonly ProviderOption[];
  actionProviders: readonly ProviderOption[];
  /**
   * Slice 4.TEAM-WORKFLOWS-6 (TW-3b) — display-only Team context (resolved
   * server-side) for credential-ownership badges + the active-account mismatch
   * banner. Optional: absent / personal-account workflows render neither.
   */
  teamContext?: BuilderTeamContextValue;
  /**
   * BUILDER-READINESS — required-field metadata per `provider:type`, computed
   * server-side from the discovery registry. Drives required-config readiness
   * (node "Needs setup" chip, header pill, Run/Activate gating). Optional so
   * isolated builder tests keep passing.
   */
  requiredFieldsByType?: import("./validation/collectBuilderValidationIssues").RequiredFieldsByType;
  /**
   * HERMES-AGENT-GUIDED-PREVIEW-SETUP — supported, metadata-derived setup fields per `provider:type`
   * (text/textarea/number/boolean/static-select; excludes secret/async/cascade/multi). Computed
   * server-side from the discovery registry. Used to SANITIZE/seed the new nodes' config at Apply time
   * (HERMES-AGENT-HOLOGRAPHIC-PREVIEW-NODE-UX moved the setup CONTROLS off the canvas — the holographic
   * nodes are visual-only; controls re-home to the React chat rail in a follow-up slice). Optional so
   * isolated builder tests keep passing.
   */
  setupFieldsByType?: import("@/core/workflows/previewSetupFields").PreviewSetupFieldsByType;
  /**
   * HERMES-AGENT-GUIDANCE-UI-BUILDER — owning account for the advisory "Build with me" guidance
   * entry. Resolved server-side from the workflow record; never client-supplied. The entry renders
   * only when this AND `guidanceEnabled` are present.
   */
  accountId?: string;
  /**
   * HERMES-AGENT-GUIDANCE-UI-BUILDER — server-evaluated `isHermesAgentEnabled()` flag (default OFF).
   * Gates the builder guidance entry so it never shows a dead box where Hermes is unconfigured.
   * Optional so isolated builder tests keep passing (undefined → entry hidden).
   */
  guidanceEnabled?: boolean;
  /**
   * ANON-BUILDER-1 — local-only (logged-out) anonymous build mode. Additive:
   * when omitted/false the builder is byte-identical to the authenticated path.
   * When true the builder renders for a logged-out visitor with NO account: the
   * persistent "building locally" banner shows, the header save/run/activate
   * cluster is replaced by a single sign-up CTA, the React Agent rail shows the
   * carried-over prompt + a sign-up CTA (no paid AI), and selecting a node shows
   * a sign-up note instead of the credential-fetching config form. Graph editing
   * stays fully local — `graphSlice` is in-memory with no autosave, so nothing
   * touches the server.
   */
  localOnly?: boolean;
  /**
   * ANON-BUILDER-1 — the homepage prompt carried into the local-only React Agent
   * rail (sessionStorage handoff). Only used when `localOnly` is true.
   */
  initialAgentPrompt?: string;
  /**
   * REACT-LIVE-SKELETON-2 — local-only: report composer edits in the anonymous
   * rail up to the owner so the anonymous draft persists the latest prompt. Only
   * used when `localOnly` is true.
   */
  onAnonPromptChange?: (prompt: string) => void;
}

/**
 * Workflow builder root.
 *
 * Slice 4.BUILDER-RUN-PANEL-1 — Test / Run controls live in the
 * BuilderHeader (via `HeaderRunControls`) and RunResultsPanel +
 * RunResultsRepairBlock now mount inside the right drawer's `results`
 * mode. The below-canvas RunNowPanel + RunResultsPanel mounts are
 * gone; there's exactly one of each visible at any time.
 *
 * Slice 4.BUILDER-LEFT-AGENT-1 — the React Agent rail (BuilderGuidanceRail)
 * moved from the below-canvas slot into the new
 * `BuilderLeftAgentRail`, a persistent left rail that is visible by
 * default on desktop and collapsible via the header toggle. The right
 * drawer is now strictly node-contextual (inspector / results /
 * validation) — AI does NOT mount there. Left rail collapse state is
 * persisted to localStorage via `useLeftAgentRail`. The drawer state
 * is independent of the rail state — both can be open simultaneously.
 *
 * Drawer mode is transitionally synchronized with two slice signals:
 *   - `configSlice.activeNodeId` — user picked a node → inspector.
 *   - `useRunSlice().runId` — a new run was dispatched → results.
 *
 * Each effect compares the latest value to a ref-tracked previous
 * value so steady-state matches don't fight each other. Earlier
 * BUILDER-INSPECTOR-1 logic forced the drawer back to `inspector`
 * any render where `activeNodeId !== null` — that would loop with
 * the new run-state signal. Transition-based opens fix that.
 *
 * Drawer × handler:
 *   - In `inspector` mode → also calls `closeNode()` to drop the
 *     active selection (lock-step with the canvas highlight).
 *   - In `results` mode → does NOT clear run state. The Latest Run
 *     stays in `runSlice` for the next results-open.
 */
export function WorkflowBuilder({
  workflow,
  triggerProviders,
  actionProviders,
  teamContext,
  requiredFieldsByType,
  setupFieldsByType,
  accountId,
  guidanceEnabled,
  localOnly,
  initialAgentPrompt,
  onAnonPromptChange,
}: Props) {
  const hydrate = useGraphSlice((s) => s.hydrate);
  const reset = useGraphSlice((s) => s.reset);
  const resetConfigSlice = useConfigSlice((s) => s.reset);
  const resetRunSlice = useRunSlice((s) => s.reset);
  const activeNodeId = useConfigSlice((s) => s.activeNodeId);
  const closeNode = useConfigSlice((s) => s.closeNode);
  const runId = useRunSlice((s) => s.runId);

  // HERMES-AGENT-BUILDER-PREVIEW-OVERLAY — ephemeral, UI-ONLY non-applied AI draft preview shown as a
  // ghost overlay over the canvas. It is deliberately plain React state (NOT the graph store): showing
  // it never touches pendingNodes/draftDefinition, never marks dirty, never autosaves. It carries the
  // display `preview` AND the validated `plan` (the source of truth for an explicit Apply). Discarding
  // just sets it back to null (no rollback needed — real state was never mutated).
  const [previewOverlay, setPreviewOverlay] = useState<{
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
  } | null>(null);
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
  // NOTE: the canvas holographic nodes are visual-only (HERMES-AGENT-HOLOGRAPHIC-PREVIEW-NODE-UX). The
  // guided setup CONTROLS live in the React rail's setup card (HERMES-AGENT-GUIDED-PREVIEW-SETUP-RAIL-UX,
  // BuilderPreviewSetupCard via BuilderGuidanceRail). This map is populated by that card and seeded into
  // the new draft nodes on explicit Apply — never sent to Hermes/a model/a prompt.
  const [previewConfig, setPreviewConfig] = useState<Record<string, Record<string, unknown>>>({});

  // Slice 4.BUILDER-SETTINGS-2 — the workflow name lives in local state so a
  // rename from the Settings tab updates the header without a reload. Re-synced
  // from the server prop on workflow switch (in the reset effect below).
  const [workflowName, setWorkflowName] = useState(workflow.name);

  // ANON-BUILDER-2/3 — when this builder was just opened by the anonymous-draft
  // restore flow, a one-shot { prompt, reason } is parked under the new workflow
  // id. Consume it once (client-only) to seed the React Agent composer + show the
  // dismissible next-action banner. Authenticated path only; never local-only.
  const {
    composerValue: restoredComposerValue,
    reason: restoredReason,
    dismissReason: dismissRestoredReason,
  } = useRestoredDraftHandoff(workflow.id, localOnly);

  // Hydrate from the server prop on initial mount AND whenever the prop's
  // definition / revision changes (e.g. an external refresh). The graphSlice
  // revision guard ignores a STALE re-hydrate — an older `updatedAt` arriving
  // after a fresher one — so a late prop render can never clobber a freshly
  // applied graph (Slice 4.BUILDER-APPLY-HYDRATE-RACE-1). Crucially this effect
  // has NO cleanup, so a same-workflow re-render does not reset the graph.
  useEffect(() => {
    hydrate(workflow.id, workflow.draftDefinition, workflow.updatedAt);
  }, [workflow.id, workflow.draftDefinition, workflow.updatedAt, hydrate]);

  // Reset per-workflow client state (config drafts, latest-run pointer, and the
  // graph) ONLY when the workflow id changes or the builder unmounts — never on
  // a same-workflow re-render, which would wipe a freshly-applied graph. Keyed
  // on `workflow.id` alone so a new prop object with the same id is a no-op.
  useEffect(() => {
    resetConfigSlice();
    resetRunSlice();
    // Drop any AI preview overlay / apply notice when switching workflows (setters are stable).
    setPreviewOverlay(null);
    setApplyNotice(null);
    setAppliedNodeIds([]);
    setPreviewConfig({});
    return () => {
      reset();
      resetConfigSlice();
      resetRunSlice();
    };
  }, [workflow.id, reset, resetConfigSlice, resetRunSlice]);

  // Slice 4.BUILDER-SETTINGS-2 — keep the local workflow name in sync with the
  // server prop (initial mount + workflow switch). A Settings rename updates the
  // local state directly via `onWorkflowNameSaved`; since the server prop doesn't
  // change on that path, this effect never clobbers a just-saved name.
  useEffect(() => {
    setWorkflowName(workflow.name);
  }, [workflow.id, workflow.name]);

  // Slice 3.8 — owns the 1s polling interval for the latest run.
  useLatestRunPolling();

  // BUILDER-TOPBAR-UNDO-REDO (keyboard) — builder-scoped Ctrl/Cmd+Z / Ctrl+Y / Shift+Z undo/redo,
  // mounted here so it only listens while the builder page is open. Reuses the toolbar's historyNav
  // orchestrators (same config-panel resync); skips editable fields so native text undo keeps working.
  useBuilderHistoryShortcuts();

  const providerLabels = buildProviderLabelMap(triggerProviders, actionProviders);
  const providerIcons = buildProviderIconMap(triggerProviders, actionProviders);

  // BUILDER-AGENT-RAIL-WIRING-EXTRACT — the rail's deterministic Check-workflow / setup / canvas-guard
  // callbacks live in a focused hook (no behavior change). All deterministic/local: no model call, no
  // save/activate/run, no new nodes.
  const { getCheckReviewContext, getCurrentGraphShape, getCurrentDraft, renderCheckSetup } = useAgentRailWiring({
    ...(requiredFieldsByType ? { requiredFieldsByType } : {}),
    providerLabels,
    ...(setupFieldsByType ? { setupFieldsByType } : {}),
    workflowId: workflow.id,
  });

  // Slice 4.BUILDER-INSPECTOR-1 → BUILDER-RUN-PANEL-1: right drawer
  // state machine.
  const { mode, openDrawer, closeDrawer } = useRightDrawer();

  // Slice 4.BUILDER-LEFT-AGENT-1: left React Agent rail collapse state
  // (persisted to localStorage via useLeftAgentRail). The header
  // exposes a toggle; the rail itself exposes an in-rail × button.
  const leftRail = useLeftAgentRail();

  // Transition refs — drawer mode changes are user-event-driven, so we
  // only re-open the drawer when the relevant signal *transitions* from
  // null → set (or set → different set). Steady-state passes are no-ops
  // so the inspector effect doesn't fight the results effect.
  const prevActiveNodeId = useRef<string | null>(activeNodeId);
  const prevRunId = useRef<string | null>(runId);

  useEffect(() => {
    const prevActive = prevActiveNodeId.current;
    const activeSet = activeNodeId !== null && activeNodeId !== prevActive;
    const activeCleared = activeNodeId === null && prevActive !== null;
    prevActiveNodeId.current = activeNodeId;
    if (activeSet) {
      openDrawer("inspector");
    } else if (activeCleared && mode === "inspector") {
      closeDrawer();
    }
  }, [activeNodeId, mode, openDrawer, closeDrawer]);

  useEffect(() => {
    const prevRun = prevRunId.current;
    const runSet = runId !== null && runId !== prevRun;
    prevRunId.current = runId;
    if (runSet) {
      openDrawer("results");
    }
    // Note: do NOT auto-close results when runId becomes null — the
    // run can transition to terminal (succeeded/failed) without runId
    // changing, and the user may want to keep the results panel open
    // for inspection. Drawer × closes results without touching runSlice.
  }, [runId, openDrawer]);

  // Drawer × / Esc handler:
  //   - `inspector` mode also drops `activeNodeId` for canvas lock-step.
  //   - `results` mode does NOT touch runSlice — the run is still
  //     valuable history; the user may re-open it.
  //   - `validation` mode is purely read-only with respect to graph
  //     state; closing it just closes the drawer.
  const handleDrawerClose = useCallback(() => {
    if (mode === "inspector") closeNode();
    closeDrawer();
  }, [mode, closeNode, closeDrawer]);

  // Slice 4.BUILDER-VALIDATION-1 — header pill opens the right
  // drawer in validation mode (replacing whichever surface was
  // previously open via useRightDrawer's mutual-exclusion contract).
  // Clicking an issue inside the summary calls configSlice.openNode,
  // which already triggers the inspector-mode transition via the
  // ref-tracked effect above.
  const handleOpenValidation = useCallback(() => {
    openDrawer("validation");
  }, [openDrawer]);

  // Slice 4.BUILDER-ADD-FLOW-1 — AddNodePanel state machine.
  const [addPanelMode, setAddPanelMode] = useState<AddNodePanelMode | null>(
    null,
  );
  // Slice 4.BUILDER-CANVAS-ERGONOMICS-FIX-1 — when the action picker is opened by a
  // per-node tail "+", this holds the exact branch end to append after. Null when
  // opened by the global "Add action" CTA (→ append to the sole chain tail). A ref
  // (not state) so the picker's pick handler reads the latest target without
  // re-creating the callback. Read in `handlePickAction`, then cleared on close.
  const appendAfterRef = useRef<string | null>(null);
  const openTriggerPicker = useCallback(() => {
    setAddPanelMode({ kind: "trigger" });
  }, []);
  const openActionPicker = useCallback(() => {
    appendAfterRef.current = null;
    setAddPanelMode({ kind: "action" });
  }, []);
  const handleAppendAfter = useCallback((nodeId: string) => {
    appendAfterRef.current = nodeId;
    setAddPanelMode({ kind: "action" });
  }, []);
  // Slice 4.BUILDER-CANVAS-LAYOUT-1 — re-arrange the whole graph into a clean,
  // non-overlapping layout. Pure position-only edit through the graph slice.
  const handleArrange = useCallback(() => {
    useGraphSlice.getState().autoLayout();
  }, []);
  const closeAddPanel = useCallback(() => {
    appendAfterRef.current = null;
    setAddPanelMode(null);
  }, []);
  const handleEdgePlusClick = useCallback((edgeId: string) => {
    setAddPanelMode({ kind: "insertAction", edgeId });
  }, []);

  const handlePickTrigger = useCallback((meta: TriggerMeta) => {
    useGraphSlice.getState().addTriggerFromMeta(meta);
  }, []);
  const handlePickAction = useCallback(
    (meta: ActionMeta, insertContext: { edgeId: string } | null) => {
      const slice = useGraphSlice.getState();
      if (insertContext) {
        insertActionAtEdge(insertContext.edgeId, meta);
        return;
      }
      // BUILDER-CANVAS-ERGONOMICS-FIX-1 — a tail "+" names the exact branch end to
      // extend; the global CTA leaves it null → append to the sole chain tail.
      const appendAfter = appendAfterRef.current;
      if (appendAfter) {
        slice.addActionAfterFromMeta(appendAfter, meta);
        return;
      }
      slice.addActionFromMeta(meta);
    },
    [],
  );

  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  const hasTrigger = useGraphSlice((s) =>
    s.pendingNodes.some((n) => n.kind === "trigger"),
  );
  // BUILDER-CANVAS-ERGONOMICS-FIX-1 — count chain/branch ends (nodes with no
  // outgoing edge). The global "Add action" CTA only appends safely when there is
  // ONE tail; with multiple branch ends it would have to guess, so it's disabled
  // and the user is redirected to a branch's own tail "+".
  const tailCount = useMemo(() => {
    const withOutgoing = new Set(pendingEdges.map((e) => e.from));
    return pendingNodes.filter((n) => !withOutgoing.has(n.id)).length;
  }, [pendingNodes, pendingEdges]);
  // HERMES-AGENT-PREVIEW-DIFF-GRAPH — for an EDIT proposal, compose the SINGLE read-only diff graph
  // (current + candidate) the canvas renders instead of the live graph. Null for additive/no preview.
  const previewDiffGraph = useMemo(
    () =>
      previewOverlay?.proposedDefinition
        ? buildPreviewDiffGraph({ nodes: pendingNodes, edges: pendingEdges }, previewOverlay.proposedDefinition)
        : null,
    [previewOverlay, pendingNodes, pendingEdges],
  );

  const canAddAction = hasTrigger && tailCount <= 1;
  const addActionBlockedReason: "no-trigger" | "multiple-tails" | undefined = !hasTrigger
    ? "no-trigger"
    : tailCount > 1
      ? "multiple-tails"
      : undefined;
  const triggerNode = useGraphSlice((s) =>
    s.pendingNodes.find((n) => n.kind === "trigger"),
  );
  const triggerTagText = triggerNode
    ? `trigger: ${triggerNode.type || triggerNode.provider}`
    : undefined;

  const memoizedEdgePlusClick = useMemo(
    () => handleEdgePlusClick,
    [handleEdgePlusClick],
  );

  // HERMES-AGENT-APPLY-CONFIG-HINTS — the per-node required-field hint list for the post-apply notice
  // (and the source for auto-opening the first incomplete node). Recomputes from the LIVE pending
  // nodes, so a hint clears as soon as the user fills the field. Field names come from metadata —
  // never inferred, never values. (The on-card "Added from preview" badge was removed in
  // HERMES-AGENT-REMOVE-ADDED-FROM-PREVIEW-BADGE — accepted nodes look like normal draft nodes.)
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
    (payload: { plan: WorkflowPlan; preview: DraftPreview; proposedDefinition?: WorkflowDefinition; baseGraphVersion?: string }) => {
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
  }, [previewOverlay, requiredFieldsByType, previewConfig, setupFieldsByType]);

  // Drawer rendering — one of three modes is active at a time.
  // Inspector only renders when activeNodeId is set so the drawer
  // doesn't show an empty form during a flicker. Results renders
  // whenever the drawer is in results mode. Validation renders
  // whenever the drawer is in validation mode (Slice 4.BUILDER-
  // VALIDATION-1).
  const drawerVisible =
    (mode === "inspector" && activeNodeId !== null) ||
    mode === "results" ||
    mode === "validation";
  const drawerTitle =
    mode === "results"
      ? "Run results"
      : mode === "validation"
        ? "Validation"
        : "Node configuration";

  return (
    <BuilderTeamProvider value={teamContext ?? null}>
    <BuilderShell
      header={
        <BuilderHeader
          workflowName={workflowName}
          workflowId={workflow.id}
          leftRail={{
            isCollapsed: leftRail.isCollapsed,
            onToggle: leftRail.toggle,
          }}
          validation={{ onOpen: handleOpenValidation }}
          lifecycle={{
            workflowId: workflow.id,
            state: workflow.state,
            unpublishedChanges: workflow.unpublishedChanges,
          }}
          requiredFieldsByType={requiredFieldsByType}
          // WF-RUNPERM follow-up — disable the header Test/Run controls for a
          // non-creator viewing a private-credential workflow (server-derived).
          // Only an explicit `false` blocks; undefined (fixture/back-compat) does
          // not. The run-now/activate routes still enforce with a typed 403.
          runEditBlocked={workflow.viewerCanRunEdit === false}
          // ANON-BUILDER-1 — local-only: replace save/run/activate with a sign-up CTA.
          {...(localOnly ? { localOnly: true } : {})}
        />
      }
      banner={
        <>
          {localOnly ? <LocalBuildBanner /> : null}
          {!localOnly && restoredReason ? (
            <RestoredDraftBanner reason={restoredReason} onDismiss={dismissRestoredReason} />
          ) : null}
          <ActiveAccountMismatchBanner />
          <WorkflowDisabledBanner
            state={workflow.state}
            disabledReason={workflow.disabledReason}
            disabledContext={workflow.disabledContext}
          />
        </>
      }
      leftRail={
        <BuilderLeftAgentRail
          isCollapsed={leftRail.isCollapsed}
          onCollapse={leftRail.collapse}
          // HERMES-AGENT-BUILDER-RAIL-CHAT-AVAILABLE — drive the header status from the SAME availability
          // rule the rail body uses, so the header can't claim "connected · Hermes" while the body shows
          // the "unavailable" note. Local-only (logged-out) is never "connected".
          connected={!localOnly && guidanceEnabled === true && !!accountId}
        >
          {localOnly ? (
            /* ANON-BUILDER-1 / REACT-LIVE-SKELETON-2 — logged-out visitor: a FREE deterministic
               skeleton rail. It calls the no-auth /api/ai/anon-skeleton endpoint (no paid AI / no
               provider / no DB) and auto-shows the result on the canvas via the SAME overlay path
               (handleShowPreview). Apply stays explicit + local-draft only. */
            <AnonymousAgentRail
              {...(initialAgentPrompt ? { prompt: initialAgentPrompt } : {})}
              onShowPreview={handleShowPreview}
              {...(onAnonPromptChange ? { onPromptChange: onAnonPromptChange } : {})}
            />
          ) : (
          /* HERMES-AGENT-REPLACE-BUILDER-AI-PLAN — the left rail is now the single, primary builder
              AI entry: Hermes workflow guidance (account route), NOT the deprecated plan endpoint.
              Reuses the verified guidance panel + the same canvas-preview/apply path. */
          <BuilderGuidanceRail
            workflowId={workflow.id}
            {...(accountId ? { accountId } : {})}
            {...(guidanceEnabled !== undefined ? { guidanceEnabled } : {})}
            onShowPreview={handleShowPreview}
            // HERMES-AGENT-PREVIEW-SHOWN-DEDUP — tell the rail which preview is ALREADY on the canvas so
            // it hides its redundant "Show on canvas" button for that one (Apply/Discard live in the
            // overlay), and restores it as a re-show control after Discard / supersede. null when none.
            displayedPreviewSignature={draftPreviewSignature(previewOverlay?.preview)}
            // HERMES-AGENT-GUIDED-PREVIEW-SETUP-RAIL-UX — guided setup card lives in the rail, tied to
            // the latest shown preview. PreviewConfig stays owned here (ephemeral, never dirty/saved).
            previewForSetup={previewOverlay?.preview ?? null}
            {...(setupFieldsByType ? { setupFieldsByType } : {})}
            previewConfig={previewConfig}
            onPreviewConfigChange={handlePreviewConfigChange}
            onApplyPreview={handleApplyPreview}
            getCheckReviewContext={getCheckReviewContext}
            getCurrentGraphShape={getCurrentGraphShape}
            getCurrentDraft={getCurrentDraft}
            renderCheckSetup={renderCheckSetup}
            {...(restoredComposerValue ? { initialComposerValue: restoredComposerValue } : {})}
          />
          )}
        </BuilderLeftAgentRail>
      }
      rightDrawer={
        drawerVisible ? (
          <BuilderRightDrawer
            title={drawerTitle}
            onClose={handleDrawerClose}
          >
            {mode === "inspector" ? (
              localOnly ? <LocalConfigNote /> : <NodeInspectorPanel />
            ) : null}
            {mode === "results" ? (
              // HERMES-AGENT-REHOME-RUN-RESULTS-REPAIR — accountId scopes the governed repair route.
              <RunResultsPanel {...(accountId ? { accountId } : {})} />
            ) : null}
            {mode === "validation" ? (
              <ValidationSummary
                onChooseTrigger={openTriggerPicker}
                requiredFieldsByType={requiredFieldsByType}
              />
            ) : null}
          </BuilderRightDrawer>
        ) : null
      }
    >
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        aria-label="Workflow builder"
        data-testid="builder-center-workspace"
      >
        <WorkflowCanvas
          providerLabels={providerLabels}
          providerIcons={providerIcons}
          onAddTrigger={openTriggerPicker}
          onEdgePlusClick={memoizedEdgePlusClick}
          onAddAction={openActionPicker}
          canAddAction={canAddAction}
          addActionBlockedReason={addActionBlockedReason}
          onAppendAfterNode={handleAppendAfter}
          onArrange={handleArrange}
          triggerTagText={triggerTagText}
          requiredFieldsByType={requiredFieldsByType}
          // HERMES-AGENT-APPLY-CONFIG-HINTS — nodes the most recent apply added get the
          // short-lived "Added from preview" badge. Undefined when nothing was just applied.
          // HERMES-AGENT-PREVIEW-CANVAS-STATE-AND-FIT — non-null while a preview is active (a fresh
          // value per show) so the canvas fits the viewport once + hides the empty-state card.
          previewToken={previewOverlay ? previewShowCount : null}
          previewDiff={previewDiffGraph}
          // BUILDER-SETTINGS-MVP-1 — workflow-level metadata for the Settings tab.
          workflowSettings={{
            name: workflowName,
            state: workflow.state,
            createdAt: workflow.createdAt,
            updatedAt: workflow.updatedAt,
            activeRevisionId: workflow.activeRevisionId,
            unpublishedChanges: workflow.unpublishedChanges,
          }}
          // BUILDER-SETTINGS-2 — sync the header when the name is renamed in Settings.
          onWorkflowNameSaved={setWorkflowName}
          // BUILDER-RUNS-TAB-1 — hide the Runs tab "Run again" when the viewer
          // can't run/edit (private-credential workflow). Mirrors HeaderRunControls.
          runEditBlocked={workflow.viewerCanRunEdit === false}
        />
        {addPanelMode !== null ? (
          <AddNodePanel
            mode={addPanelMode}
            triggerProviders={triggerProviders}
            actionProviders={actionProviders}
            providerIcons={providerIcons}
            onPickTrigger={handlePickTrigger}
            onPickAction={handlePickAction}
            onClose={closeAddPanel}
          />
        ) : null}
        {/* AI preview controls (UI state only — never merges into the real graph / writes / saves).
            Discard clears state; Apply runs the explicit local-draft edit (HERMES-AGENT-APPLY-PREVIEW-PATCH). */}
        {previewOverlay && previewDiffGraph ? (
          // EDIT proposal: the canvas shows the single diff graph; this is just the slim, non-overlay
          // Apply/Discard control bar (the SINGLE primary control). HERMES-AGENT-PREVIEW-DIFF-GRAPH.
          <BuilderPreviewControlBar
            notice={previewOverlay.preview.notice}
            onApply={handleApplyPreview}
            onDiscard={() => {
              setPreviewOverlay(null);
              setPreviewConfig({});
            }}
          />
        ) : previewOverlay ? (
          // Additive new-workflow skeleton (no candidate definition): keep the ghost overlay (empty canvas).
          <BuilderPreviewOverlay
            preview={previewOverlay.preview}
            onApply={handleApplyPreview}
            onDiscard={() => {
              setPreviewOverlay(null);
              setPreviewConfig({});
            }}
            providerLabels={providerLabels}
            providerIcons={providerIcons}
          />
        ) : null}
        {/* HERMES-AGENT-APPLY-PREVIEW-PATCH / -CONFIG-HINTS — transient confirmation after an explicit
            apply. The nodes are now part of the local draft (dirty); the user still reviews required
            fields + saves. The notice lists each newly-added node's still-empty required fields (names
            only, from metadata) so the user knows the workflow is incomplete. */}
        {applyNotice ? (
          <BuilderApplyNotice
            notice={applyNotice}
            hints={appliedConfigHints}
            onDismiss={() => {
              setApplyNotice(null);
              setAppliedNodeIds([]);
            }}
          />
        ) : null}
      </div>
    </BuilderShell>
    </BuilderTeamProvider>
  );
}

function buildProviderLabelMap(
  triggers: readonly ProviderOption[],
  actions: readonly ProviderOption[],
): Readonly<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const p of triggers) map[p.id] = p.displayName;
  for (const p of actions) map[p.id] = p.displayName;
  return map;
}

function buildProviderIconMap(
  triggers: readonly ProviderOption[],
  actions: readonly ProviderOption[],
): Readonly<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const p of triggers) if (p.iconUrl) map[p.id] = p.iconUrl;
  for (const p of actions) if (p.iconUrl) map[p.id] = p.iconUrl;
  return map;
}
