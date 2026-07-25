"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { replaceCurrentWorkflowFromTemplate } from "@/lib/api/workflowTemplates";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";
import type { AgentChangeHistoryItem } from "@/contracts/agentChangeHistory";
import { useRestoredDraftHandoff } from "./hooks/useRestoredDraftHandoff";
import { useInitialBuilderFocus } from "./hooks/useInitialBuilderFocus";
import { RestoredDraftBanner } from "./panels/RestoredDraftBanner";
import { WorkflowCanvas } from "./canvas/WorkflowCanvas";
import type { BuilderTab } from "./canvas/BuilderTabPlaceholder";
import { BuilderTabStrip } from "./layout/BuilderTabStrip";
import { BuilderTabPanels } from "./layout/BuilderTabPanels";
import { BuilderViewChooser } from "./panels/BuilderViewChooser";
import { updateDefaultBuilderView } from "@/lib/api/accounts";
import { BuilderPreviewOverlay } from "./canvas/BuilderPreviewOverlay";
import { BuilderPreviewControlBar } from "./canvas/BuilderPreviewControlBar";
import type { ConfigDiffFieldMetaByType } from "@/core/workflows/configDiffFieldMeta";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";
import { useResourceLabelCache } from "./state/resourceLabelCache";
import { PreviewReviewPanel } from "./panels/PreviewReviewPanel";
import { BuilderApplyNotice } from "./canvas/BuilderApplyNotice";
import type { AgentSetupIssue } from "@/core/workflows/agentSetupIssues";
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
import {
  ADVANCED_BRANCHING_NODE_TYPES,
  isAdvancedBranchingTypeKey,
} from "@/core/workflows/advancedBranching";
import { BuilderGuidanceRail } from "./panels/BuilderGuidanceRail";
import type { ComposerSeed } from "@/features/workflows/composerSeed";
import { useGuidanceConversation } from "@/features/workflows/useGuidanceConversation";
import type { DocumentAgentContext } from "./document/documentAgentContext";
import {
  emitDocumentBuilderEvent,
  setDocumentBuilderTelemetryEnabled,
} from "./document/documentTelemetry";
import { HistoryPanel } from "./panels/HistoryPanel";
import { AgentChangeDiffDrawer } from "./panels/AgentChangeDiffDrawer";
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
import { useBuilderPreview } from "./hooks/useBuilderPreview";
import { useRepairTestVerification } from "./hooks/useRepairTestVerification";
import { useAgentRepairLoop } from "./hooks/useAgentRepairLoop";
import { useRepairLoopStore } from "./state/repairLoopStore";
import { useRunControls } from "./hooks/useRunControls";
import { useAgentApplyModeAvailability } from "./hooks/useAgentApplyModeAvailability";
import { useBuilderReadiness } from "./hooks/useBuilderReadiness";
import { insertActionAtEdge } from "./utils/insertActionAtEdge";
import { ValidationSummary } from "./validation/ValidationSummary";
import type { AgentApplyMode } from "@/core/workflows/agentApplyModes";
import { useDestructivePreview } from "./hooks/useDestructivePreview";
import {
  DocumentView,
  readBuilderViewPref,
  writeBuilderViewPref,
  addDocumentActionToEmptyLane,
  createDocumentIfThenBranch,
  createDocumentRouterBranch,
  describeBranchRefusal,
  type BranchInsertLocation,
  type BuilderViewMode,
} from "./document";

/**
 * 5.DUAL-BUILDER-1 CS-5 — classify a Document insertion context into a
 * branch-creation location: a labeled edge from a branching node → laneStart
 * (nested fork), an unlabeled edge → between, otherwise a tail anchor → tail.
 * Returns null when no safe location is known (the branch command would refuse).
 */
function documentBranchLocation(
  insertContext: { edgeId: string } | null,
  appendAfter: string | null,
): BranchInsertLocation | null {
  if (insertContext) {
    const edge = useGraphSlice
      .getState()
      .pendingEdges.find((e) => e.id === insertContext.edgeId);
    if (!edge) return null;
    if (edge.label !== undefined) {
      return {
        kind: "laneStart",
        edgeId: edge.id,
        expectedFrom: edge.from,
        expectedTo: edge.to,
        expectedLabel: edge.label,
      };
    }
    return { kind: "between", edgeId: edge.id, expectedFrom: edge.from, expectedTo: edge.to };
  }
  if (appendAfter) return { kind: "tail", anchorNodeId: appendAfter };
  return null;
}

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
   * HERMES-AGENT-CONFIG-DIFF-REVIEW — display-safe per-field metadata (label / required / hasDefault /
   * secret) per `provider:type`, computed server-side from the discovery registry. Drives the right-rail
   * "Review changes" value-level config diff while an EDIT preview is active. Optional so isolated builder
   * tests keep passing (absent → the diff still computes; field labels fall back to key names).
   */
  fieldMetaByType?: ConfigDiffFieldMetaByType;
  /**
   * CONFIG-UX-NODE-SUMMARY-1 — display-safe field metadata per `provider:type`, computed server-side
   * from the discovery registry. Lets the canvas adapter compute each node's at-a-glance summary line
   * ("Send Channel Message · #support-alerts") for the COLLAPSED card. Optional so isolated builder
   * tests keep passing (absent → cards render exactly as before, with no summary line).
   */
  summaryFieldsByType?: NodeSummaryFieldsByType;
  /**
   * HERMES-AGENT-GUIDANCE-UI-BUILDER — owning account for the advisory "Build with me" guidance
   * entry. Resolved server-side from the workflow record; never client-supplied. The entry renders
   * only when this AND `guidanceEnabled` are present.
   */
  accountId?: string;
  /**
   * HERMES-AGENT-GUIDANCE-UI-BUILDER — whether the React Agent rail renders. The builder page now
   * passes `true` unconditionally (React Agent is LIVE BY DEFAULT — no feature-flag gate); the actual
   * Hermes gateway call stays gated on gateway config server-side, so an unconfigured environment shows
   * a calm in-chat "unavailable" error rather than hiding the rail. Optional so isolated builder tests
   * keep passing (undefined → rail shows its safe "unavailable" note).
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
  /**
   * 5.ONBOARD-1 Batch 3 — validated `?focus=` deep-link target from the route
   * (setup → reveal the first incomplete node/field; test/activate → transient
   * header pulse). One-shot + navigation-only (see useInitialBuilderFocus).
   */
  initialFocus?: import("./hooks/useInitialBuilderFocus").BuilderInitialFocus;
  /**
   * BRANCH-ENT-1 C6 — whether the workflow-owning account's plan allows
   * advanced branching (If/Then Condition, Router). The route resolves it
   * server-side (fail-closed) and passes an explicit boolean; anonymous
   * local-only mode is treated as not entitled. `false` renders the branching
   * library entries LOCKED (visible + searchable, "Pro" badge, upgrade
   * explanation + CTA on click) and blocks every insertion path. Optional so
   * isolated builder tests keep passing (undefined → unlocked UI; the server
   * gates remain the enforcement authority regardless).
   */
  canUseAdvancedBranching?: boolean;
  /**
   * 5.DUAL-BUILDER-1 CS-1 — server-resolved `ENABLE_DOCUMENT_BUILDER` flag
   * (default OFF). When true the header shows a Visual/Document toggle and the
   * center workspace can render the read-only Document projection of the SAME
   * `graphSlice` draft. When false/undefined the builder is byte-identical to
   * today: no toggle, no Document surface mounted.
   */
  documentBuilderEnabled?: boolean;
  /**
   * BUILDER-VIEW-DEFAULT-1 — the user's saved default builder view from
   * `user_profiles.default_builder_view`, resolved server-side by the route.
   * `null`/undefined = no default chosen (a just-created workflow asks).
   * Ignored while the Document Builder flag is off.
   */
  defaultBuilderView?: BuilderViewMode | null;
  /**
   * BUILDER-VIEW-DEFAULT-1 — true when the route was reached straight from a
   * creation flow (`?created=1`). With the flag on and no saved default, the
   * builder shows the one-time view chooser. Never persisted; the param is
   * stripped from the URL after mount.
   */
  justCreated?: boolean;
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
 *
 * AI-preview lifecycle (ephemeral overlay + guided-setup + explicit Apply) and
 * checkpoint orchestration (create-before-apply + restore) + the "Review changes"
 * config diff are owned by the `useBuilderPreview` hook; this component wires the
 * returned state/handlers into the canvas + rails + drawer.
 */
export function WorkflowBuilder({
  workflow,
  triggerProviders,
  actionProviders,
  teamContext,
  requiredFieldsByType,
  setupFieldsByType,
  fieldMetaByType,
  summaryFieldsByType,
  accountId,
  guidanceEnabled,
  localOnly,
  initialAgentPrompt,
  onAnonPromptChange,
  initialFocus,
  canUseAdvancedBranching,
  documentBuilderEnabled,
  defaultBuilderView,
  justCreated,
}: Props) {
  const router = useRouter();
  const hydrate = useGraphSlice((s) => s.hydrate);
  const reset = useGraphSlice((s) => s.reset);
  const resetConfigSlice = useConfigSlice((s) => s.reset);
  const resetRunSlice = useRunSlice((s) => s.reset);
  const resetRepairLoop = useRepairLoopStore((s) => s.reset);
  const activeNodeId = useConfigSlice((s) => s.activeNodeId);
  const closeNode = useConfigSlice((s) => s.closeNode);
  const revealNode = useConfigSlice((s) => s.revealNode);
  const openNodeConfig = useConfigSlice((s) => s.openNode);
  const runId = useRunSlice((s) => s.runId);

  // Slice 4.BUILDER-SETTINGS-2 — the workflow name lives in local state so a
  // rename from the Settings tab updates the header without a reload. Re-synced
  // from the server prop on workflow switch (in the reset effect below).
  const [workflowName, setWorkflowName] = useState(workflow.name);

  // 5.DUAL-BUILDER-1 CS-1 — which surface renders the center workspace. The
  // SAME graphSlice draft backs both; switching is pure client view state
  // (never saves, hydrates, resets, or clones the workflow).
  // BUILDER-VIEW-DEFAULT-1 resolution: per-workflow key (last used on THIS
  // workflow, this device) → the user's saved server default → device-wide
  // key → visual.
  const [builderView, setBuilderView] = useState<BuilderViewMode>(() =>
    documentBuilderEnabled
      ? readBuilderViewPref(workflow.id, defaultBuilderView ?? null)
      : "visual",
  );
  useEffect(() => {
    setBuilderView(
      documentBuilderEnabled
        ? readBuilderViewPref(workflow.id, defaultBuilderView ?? null)
        : "visual",
    );
  }, [workflow.id, documentBuilderEnabled, defaultBuilderView]);

  // BUILDER-VIEW-DEFAULT-1 — one-time view chooser: only for a just-created
  // workflow, only while the flag is on, only when the user has NO saved
  // default. Dismissing keeps the current view and saves nothing (the next
  // new workflow asks again). Choosing switches immediately; "always use
  // this" additionally saves the account-level default (fail-safe: a failed
  // save never blocks building — the chooser simply asks again next time).
  const [showViewChooser, setShowViewChooser] = useState(
    () =>
      documentBuilderEnabled === true &&
      justCreated === true &&
      (defaultBuilderView ?? null) === null,
  );
  const handleChooseView = useCallback(
    (view: BuilderViewMode, rememberAsDefault: boolean) => {
      setShowViewChooser(false);
      setBuilderView(view);
      writeBuilderViewPref(view, workflow.id);
      emitDocumentBuilderEvent("builder_view_switched", { to: view });
      if (rememberAsDefault) {
        void updateDefaultBuilderView(view).catch(() => {
          // Preference save failed (offline / transient). Building continues
          // in the chosen view; with no stored default the chooser will ask
          // again on the next new workflow — never a blocking error here.
        });
      }
    },
    [workflow.id],
  );
  // Strip the one-shot ?created marker so refresh/back doesn't re-trigger the
  // chooser. Same history.replaceState idiom as useInitialBuilderFocus.
  useEffect(() => {
    if (!justCreated || typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("created")) {
        url.searchParams.delete("created");
        window.history.replaceState(window.history.state, "", url.toString());
      }
    } catch {
      // URL manipulation is best-effort — never break the builder over it.
    }
  }, [justCreated]);
  const handleSetBuilderView = useCallback(
    (view: BuilderViewMode) => {
      setBuilderView(view);
      writeBuilderViewPref(view, workflow.id);
      // CS-7 telemetry — categorical only (target view), never workflow content.
      emitDocumentBuilderEvent("builder_view_switched", { to: view });
    },
    [workflow.id],
  );
  const documentViewActive = documentBuilderEnabled === true && builderView === "document";

  // BUILDER-TABS-HEADER-1 — the top tab segment (Builder | Runs | Data Map |
  // History | Settings) now lives at the builder level, rendered in the header
  // region, so BOTH view modes reach every tab. State survives Visual/Document
  // switches; resets to "builder" on workflow switch.
  const [activeTab, setActiveTab] = useState<BuilderTab>("builder");
  useEffect(() => {
    setActiveTab("builder");
  }, [workflow.id]);
  // CS-7 telemetry — gate emission on the server-resolved flag so flag OFF emits
  // NOTHING, then record when the Document surface is actually shown.
  useEffect(() => {
    setDocumentBuilderTelemetryEnabled(documentBuilderEnabled === true);
  }, [documentBuilderEnabled]);
  useEffect(() => {
    if (documentViewActive) emitDocumentBuilderEvent("document_builder_view_opened");
  }, [documentViewActive]);
  // 5.DUAL-BUILDER-1 CS-2 → DOC-CONFIG-SYNC-1 — the node whose configSlice
  // selection is driven by an OPEN Document Guided Stop.
  //
  // CS-2 used this to SUPPRESS the inspector drawer, on the reasoning that two
  // editors for one field is one too many. DOC-CONFIG-SYNC-1 supersedes that:
  // the drawer is not a second editor, it is the second VIEW of the same shared
  // draft, and users read the sentence and the panel as one thing. So the
  // ordinary `activeNodeId` transition now opens the drawer for a stop-driven
  // selection too, and the panel reveals + rings the exact field the inline
  // editor is on (`configSlice.focusField`, published by GuidedStopEditor).
  // There is still exactly ONE pending draft and ONE commit path.
  //
  // The callback itself is retained (and must stay defined) because its presence
  // is how DocumentView knows it is mounted interactively
  // (`interactive = onGuidedStopActive !== undefined`); it no longer needs to
  // record anything, so the suppression ref is gone.
  const handleGuidedStopActive = useCallback(() => {}, []);
  // Transient Document notice (typed refusals, e.g. branching-in-CS-2).
  const [documentNotice, setDocumentNotice] = useState<string | null>(null);

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

  // 5.ONBOARD-1 Batch 3 — one-shot `?focus=` deep-link handling (defined AFTER
  // the hydrate effect so the graph store is populated when it fires). setup →
  // reveal first incomplete node/field via the existing validation rule;
  // test/activate → transient header pulse. Navigation-only; consumes the
  // query param so back/forward/reload never replay it.
  const headerFocusPulse = useInitialBuilderFocus({
    focus: initialFocus,
    workflowId: workflow.id,
    requiredFieldsByType,
    enabled: !localOnly,
  });

  // Reset per-workflow client state (config drafts, latest-run pointer, and the
  // graph) ONLY when the workflow id changes or the builder unmounts — never on
  // a same-workflow re-render, which would wipe a freshly-applied graph. Keyed
  // on `workflow.id` alone so a new prop object with the same id is a no-op. (The
  // AI-preview state is reset in parallel by useBuilderPreview, keyed the same.)
  useEffect(() => {
    resetConfigSlice();
    resetRunSlice();
    resetRepairLoop();
    return () => {
      reset();
      resetConfigSlice();
      resetRunSlice();
      resetRepairLoop();
    };
  }, [workflow.id, reset, resetConfigSlice, resetRunSlice, resetRepairLoop]);

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

  // CONFIG-UX-NODE-SUMMARY-1 — the canvas adapter is a PURE synchronous converter and must not read
  // the label store itself, so subscribe here and thread the snapshot down. The subscription is what
  // makes a card's summary line appear as its picker resolves the resource's name.
  const resourceLabels = useResourceLabelCache((s) => s.labels);

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
  // DOC-RAIL-LAYOUT-1 — builder-mode-aware: Document mode tracks its own
  // session-only state that defaults (and re-defaults on every entry) to
  // collapsed, so the Document gets the full workspace and its Ask React bar
  // is the one visible AI entry. The persisted Visual preference is never
  // touched by Document-mode toggling and is restored on switch back.
  const leftRail = useLeftAgentRail(documentViewActive ? "document" : "visual");

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
      // DOC-CONFIG-SYNC-1 — every selection path, including a Guided-Stop-driven
      // one, opens the inspector. The Document sentence, the inline stop, and the
      // panel are three views of one node draft; the panel following along is the
      // point (see `handleGuidedStopActive`).
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
  // CS-5 — when the picker was opened by an empty branch lane's "Add a step",
  // this names the fork + route label the pick should be wired into.
  const branchLaneRef = useRef<{ forkNodeId: string; label: string } | null>(null);
  // 5.DUAL-BUILDER-1 CS-6/CS-7 — the Document's empty-state composer, persistent
  // Ask React bar, and insertion "Ask React" all prefill the ONE existing agent
  // conversation (the left rail's WorkflowGuidancePanel) and expand the rail. They
  // NEVER open a second conversation or send on their own — the rail's composer
  // owns submit. CS-7: a keyed/VERSIONED seed (composerSeed.ts) so a second rapid
  // Document request reliably supersedes the first unsent seed instead of being
  // dropped, while an unrelated re-render never clobbers manually-typed text. The
  // restored anonymous-draft prompt (ANON-BUILDER-2) is folded into the SAME
  // channel as a `restore` seed (fill-if-empty only).
  const [documentComposerSeed, setDocumentComposerSeed] = useState<ComposerSeed | undefined>(
    undefined,
  );
  // DOC-REACT-AGENT-1 — THE React Agent conversation. One instance, owned here,
  // handed to whichever surface is mounted (the Visual left rail or the Document
  // bottom workspace). Switching modes remounts the PRESENTATION only: the
  // transcript, the in-flight request and the pending proposal all survive
  // because the state lives at this level. There is no second agent store.
  const agentConversation = useGuidanceConversation({
    accountId: accountId ?? "",
    workflowId: workflow.id,
    getCurrentDraft,
    getCheckReviewContext,
  });
  // Expanded state of the Document agent workspace — also owned here so a
  // Visual round-trip returns to the same expanded workspace.
  const [agentWorkspaceExpanded, setAgentWorkspaceExpanded] = useState(false);
  const seedVersionRef = useRef(0);
  const handleDocumentAskReact = useCallback(
    (prompt: string, source: "document-empty" | "document-bar" | "document-insert") => {
      setDocumentComposerSeed({ value: prompt, version: ++seedVersionRef.current, source });
      // DOC-REACT-AGENT-1 — in Document mode the seed lands in the bottom
      // workspace composer (the single entry point); in Visual it still opens
      // the rail's composer. Either way it is ONE conversation and never sends.
      setAgentWorkspaceExpanded(true);
      leftRail.expand();
      // CS-7 telemetry — the SOURCE token only (never the prompt text).
      if (source === "document-empty") {
        emitDocumentBuilderEvent("document_empty_react_started");
      }
    },
    [leftRail],
  );
  // DOC-REACT-AGENT-1 — the Document composer sends through the SAME conversation
  // the rail uses. The resolved document context is prefixed as plain language
  // (never ids) so React answers about the thing the user is looking at; the
  // request itself is the existing governed guidance call.
  const handleDocumentAgentSubmit = useCallback(
    (prompt: string, context: DocumentAgentContext) => {
      const scoped =
        context.kind === "workflow"
          ? prompt
          : context.kind === "field"
            ? `About the “${context.label}” detail: ${prompt}`
            : `About “${context.label}”: ${prompt}`;
      void agentConversation.send(scoped);
    },
    [agentConversation],
  );
  const handleDocumentAgentCheckWorkflow = useCallback(() => {
    agentConversation.checkWorkflow({
      accountId: accountId ?? "",
      workflowId: workflow.id,
      getCurrentDraft,
      getCheckReviewContext,
    });
  }, [agentConversation, accountId, workflow.id, getCurrentDraft, getCheckReviewContext]);

  // Fold the restored anonymous prompt into the versioned channel the first time
  // it arrives, only if no explicit Document seed has been minted yet.
  useEffect(() => {
    const restored = (restoredComposerValue ?? "").trim();
    if (restored.length === 0) return;
    setDocumentComposerSeed((current) =>
      current
        ? current
        : { value: restored, version: ++seedVersionRef.current, source: "restore" },
    );
  }, [restoredComposerValue]);
  const openTriggerPicker = useCallback(() => {
    setAddPanelMode({ kind: "trigger" });
  }, []);
  // CS-7 — the Document empty-state "Start with a trigger" path: record a manual
  // start (categorical, no content), then open the SAME shared trigger picker.
  const handleDocumentManualStart = useCallback(() => {
    emitDocumentBuilderEvent("document_manual_start");
    setAddPanelMode({ kind: "trigger" });
  }, []);
  const openActionPicker = useCallback(() => {
    appendAfterRef.current = null;
    branchLaneRef.current = null;
    setAddPanelMode({ kind: "action" });
  }, []);
  const handleAppendAfter = useCallback((nodeId: string) => {
    appendAfterRef.current = nodeId;
    branchLaneRef.current = null;
    setAddPanelMode({ kind: "action" });
  }, []);
  // 5.DUAL-BUILDER-1 CS-5 — an empty branch lane's "Add a step" opens the SAME
  // picker; the pick is wired into that lane (fork --[label]--> new) via the
  // Document branch command rather than the linear insert path.
  const handleAddToEmptyLane = useCallback((forkNodeId: string, label: string) => {
    branchLaneRef.current = { forkNodeId, label };
    appendAfterRef.current = null;
    setAddPanelMode({ kind: "action" });
  }, []);
  // Slice 4.BUILDER-CANVAS-LAYOUT-1 — re-arrange the whole graph into a clean,
  // non-overlapping layout. Pure position-only edit through the graph slice.
  const handleArrange = useCallback(() => {
    useGraphSlice.getState().autoLayout();
  }, []);
  const closeAddPanel = useCallback(() => {
    appendAfterRef.current = null;
    branchLaneRef.current = null;
    setAddPanelMode(null);
  }, []);
  const handleEdgePlusClick = useCallback((edgeId: string) => {
    branchLaneRef.current = null;
    setAddPanelMode({ kind: "insertAction", edgeId });
  }, []);

  // BRANCH-ENT-1 C6 — plan-locked library entries. `false` = locked (Free /
  // fail-closed resolution); anonymous local-only mode has no provable
  // entitlement, so it is locked too. Undefined (isolated tests) = unlocked
  // UI; the server-side gates remain authoritative either way.
  const branchingLocked = canUseAdvancedBranching === false || localOnly === true;
  const lockedActionKeys = useMemo(
    () => (branchingLocked ? ADVANCED_BRANCHING_NODE_TYPES : undefined),
    [branchingLocked],
  );

  // 5.DUAL-BUILDER-1 CS-1 — complex-region handoff: switch to the Visual
  // surface and reveal the region's anchor node via the EXISTING focus API
  // (configSlice.revealNode — navigation only, never a write/save/mutation).
  // CS-2 — "Configure step" from the Document selects through the same
  // configSlice.openNode the canvas uses, so the EXISTING transition effect
  // opens the inspector drawer. CS-5 — also used to open the router-routes
  // renderer right after a Router branch is created, so routes are configured
  // through the EXISTING inspector.
  const handleOpenStepInspector = useCallback(
    (nodeId: string) => {
      const node = useGraphSlice.getState().pendingNodes.find((n) => n.id === nodeId);
      if (!node) return;
      // Re-select: when the stop already had this node selected, openNode is a
      // no-op for the transition effect, so nudge it through a clear first.
      if (useConfigSlice.getState().activeNodeId === nodeId) {
        useConfigSlice.getState().closeNode();
      }
      openNodeConfig({ nodeId, initialValues: node.config ?? {} });
    },
    [openNodeConfig],
  );

  const handlePickTrigger = useCallback((meta: TriggerMeta) => {
    useGraphSlice.getState().addTriggerFromMeta(meta);
  }, []);
  const handlePickAction = useCallback(
    (meta: ActionMeta, insertContext: { edgeId: string } | null) => {
      // Defense in depth: the picker shows the upgrade explanation instead of
      // picking, so this should be unreachable — but no insertion surface
      // (search, keyboard, future callers) may ever add a locked node.
      if (branchingLocked && isAdvancedBranchingTypeKey(meta.key)) return;
      const slice = useGraphSlice.getState();

      // 5.DUAL-BUILDER-1 CS-5 — Document branch authoring. The SAME picker (with
      // its existing Pro locking) drives it; branch picks route through the
      // typed Document branch commands, which validate live store state and
      // refuse (never partially mutate) rather than dropping an unconfigured
      // node. Non-branch picks fall through to the shared linear paths below.
      if (documentViewActive) {
        const emptyLane = branchLaneRef.current;
        const isBranch = isAdvancedBranchingTypeKey(meta.key);
        if (emptyLane) {
          // Add a step (ordinary OR nested branch) into an empty lane.
          const result = addDocumentActionToEmptyLane({
            forkNodeId: emptyLane.forkNodeId,
            label: emptyLane.label,
            meta,
          });
          if (!result.ok) setDocumentNotice(describeBranchRefusal(result.reason));
          else if (isBranch && result.nodeId) handleOpenStepInspector(result.nodeId);
          return;
        }
        if (isBranch) {
          const location = documentBranchLocation(insertContext, appendAfterRef.current);
          if (!location) {
            setDocumentNotice(describeBranchRefusal("branching_not_supported_here"));
            return;
          }
          const result =
            meta.type === "router"
              ? createDocumentRouterBranch({ location, canUseAdvancedBranching })
              : createDocumentIfThenBranch({ location, canUseAdvancedBranching });
          if (!result.ok) setDocumentNotice(describeBranchRefusal(result.reason));
          else if (meta.type === "router" && result.nodeId) handleOpenStepInspector(result.nodeId);
          return;
        }
      }
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
    [branchingLocked, documentViewActive, canUseAdvancedBranching, handleOpenStepInspector],
  );

  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);

  const handleOpenInVisual = useCallback(
    (nodeId: string | null) => {
      setBuilderView("visual");
      writeBuilderViewPref("visual", workflow.id);
      if (!nodeId) return;
      const node = useGraphSlice.getState().pendingNodes.find((n) => n.id === nodeId);
      if (!node) return;
      revealNode({ nodeId, initialValues: node.config ?? {} });
    },
    [workflow.id, revealNode],
  );
  // CHECKPOINTS-1 — drives the "this will discard unsaved changes" warning on restore.
  const isDirty = useGraphSlice((s) => s.isDirty);
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

  // AI-preview lifecycle + checkpoint orchestration + "Review changes" config diff.
  // Owns the ephemeral overlay / guided-setup / apply / restore / discard logic and
  // the checkpoint create-before-apply + restore. Returns the state + handlers the
  // canvas, rails, and drawer wire up below.
  // REACT-AGENT-APPLY-MODES-1 — a builder-level run-controls instance so "Apply and test" can
  // dispatch a safe test after the apply is saved. The header mounts its own instance for its
  // Test/Run buttons; both share the run slice, so run results surface the same way regardless of
  // which path started the run.
  const builderRunControls = useRunControls();

  const {
    previewOverlay,
    previewShowCount,
    applyNotice,
    agentSetupIssues,
    previewConfig,
    previewPrefilledConfig,
    previewDiffGraph,
    configDiff,
    previewRationale,
    previewReviewActive,
    checkpointRestoringId,
    checkpointRestoreError,
    agentChanges,
    agentChangesLoading,
    agentChangesError,
    handleShowPreview,
    handlePreviewConfigChange,
    handleApplyPreview,
    handleApplyAndTest,
    handleKeepAsPreview,
    handleRestoreCheckpoint,
    handleDiscardPreview,
    dismissApplyNotice,
    showApplyNotice,
    refreshAgentChanges,
  } = useBuilderPreview({
    workflowId: workflow.id,
    localOnly,
    ...(requiredFieldsByType ? { requiredFieldsByType } : {}),
    ...(setupFieldsByType ? { setupFieldsByType } : {}),
    ...(fieldMetaByType ? { fieldMetaByType } : {}),
    pendingNodes,
    pendingEdges,
    runTestAfterApply: builderRunControls.handleTestWorkflow,
  });

  // CS-7 telemetry — Document-surface preview apply/reject. Emitted only while the
  // Document is the active surface (categorical, no workflow content); delegates
  // to the SAME canonical apply/discard handlers the rail uses.
  const handleDocumentApplyPreview = useCallback(() => {
    emitDocumentBuilderEvent("document_agent_preview_applied");
    handleApplyPreview();
  }, [handleApplyPreview]);
  const handleDocumentDiscardPreview = useCallback(() => {
    emitDocumentBuilderEvent("document_agent_preview_rejected");
    handleDiscardPreview();
  }, [handleDiscardPreview]);

  // REACT-AGENT-APPLY-MODES-1 — deterministic availability of the three apply modes for the active
  // edit preview (readiness vs the proposed end-state, risk from the rationale, trigger/active
  // gating). All decision logic lives in the hook + the pure core helper; this stays wiring.
  const applyModeAvailability = useAgentApplyModeAvailability({
    active: previewReviewActive,
    candidateDefinition: previewOverlay?.proposedDefinition ?? null,
    pendingNodes,
    configDiff,
    rationale: previewRationale,
    ...(requiredFieldsByType ? { requiredFieldsByType } : {}),
    workflowState: workflow.state,
    ...(localOnly ? { localOnly } : {}),
    ...(workflow.viewerCanRunEdit !== undefined ? { viewerCanRunEdit: workflow.viewerCanRunEdit } : {}),
  });

  // REACT-AGENT-READINESS-1 — the readiness verdict ("what is left before this can run?").
  // Evaluates the proposed end-state while previewing, else the live draft just after
  // an apply; folds in the server-resolved connection signal. All logic lives in the hook.
  const agentReadiness = useBuilderReadiness({
    workflowId: workflow.id,
    previewReviewActive,
    proposedDefinition: previewOverlay?.proposedDefinition ?? null,
    applyNoticeActive: !!applyNotice,
    pendingNodes,
    pendingEdges,
    ...(requiredFieldsByType ? { requiredFieldsByType } : {}),
    workflowState: workflow.state,
    ...(localOnly ? { localOnly } : {}),
    ...(workflow.viewerCanRunEdit !== undefined ? { viewerCanRunEdit: workflow.viewerCanRunEdit } : {}),
  });

  const handleSelectApplyMode = useCallback(
    (mode: AgentApplyMode) => {
      if (mode === "apply_to_draft") handleApplyPreview();
      else if (mode === "apply_and_test") void handleApplyAndTest();
      else handleKeepAsPreview();
    },
    [handleApplyPreview, handleApplyAndTest, handleKeepAsPreview],
  );

  // DOC-FINAL-ACCEPTANCE-1 — the SINGLE destructive classification for the active
  // preview, shared by the center Document preview and the right-drawer apply flow.
  const destructivePreview = useDestructivePreview(pendingNodes, pendingEdges, previewOverlay);

  // AI-TEMPLATE-APPLY-CURRENT — apply a React-Agent-suggested official template to the CURRENTLY-OPEN
  // workflow IN PLACE (the primary choice in the template match dialog). It overwrites the current
  // draft via the EXISTING replace-from-template route (origin `react_agent`, so the server captures a
  // pre-replace checkpoint + records a History row), then re-hydrates the canvas from the returned
  // detail, refreshes the History timeline, and re-reads the server-rendered lifecycle state. It keeps
  // the SAME workflow id + name + URL — no new workflow, no navigation. On failure it THROWS so the
  // dialog stays open with a safe error; nothing is re-hydrated and the previous draft is intact.
  // Not wired for the logged-out local-only builder (no server workflow → the anonymous rail is used).
  const handleTemplateApplyToCurrent = useCallback(
    async ({ templateId, templateName }: { templateId: string; templateName: string }): Promise<void> => {
      const detail = await replaceCurrentWorkflowFromTemplate(workflow.id, templateId, {
        origin: "react_agent",
      });
      // Reconcile client state from the server-confirmed baseline (not an authoritative write — the
      // server already persisted). The fresh updatedAt clears the revision guard so it isn't stale.
      hydrate(workflow.id, detail.draftDefinition, detail.updatedAt);
      closeNode();
      // Pull the server-recorded History row (checkpoint-linked → "Restore" available).
      await refreshAgentChanges();
      // Re-read the server-rendered lifecycle state (an ACTIVE workflow whose trigger changed was
      // deactivated server-side; workflow.state is a server prop, not graph-slice state).
      router.refresh();
      showApplyNotice(
        `Applied the “${templateName}” template to this workflow — review required fields, then reconnect and reactivate if needed. You can restore the previous version from History.`,
      );
    },
    [workflow.id, hydrate, closeNode, refreshAgentChanges, router, showApplyNotice],
  );

  // CHECKLIST-ITEM-10 — open the node's config panel and highlight the missing
  // field for a clicked post-apply "Setup needed" issue. NAVIGATION ONLY:
  // `revealNode` never writes a value, saves, runs, or activates. The drawer flips
  // to inspector via the existing `activeNodeId` transition effect (same path the
  // validation drawer + repair loop use).
  const handleOpenSetupIssue = useCallback(
    (issue: AgentSetupIssue) => {
      const target = issue.focusTarget;
      if (!target) return;
      const node = pendingNodes.find((n) => n.id === target.nodeId);
      if (!node) return;
      revealNode({
        nodeId: target.nodeId,
        initialValues: node.config ?? {},
        ...(target.fieldPath ? { fieldKey: target.fieldPath } : {}),
      });
    },
    [pendingNodes, revealNode],
  );

  // AGENT-CHANGE-HISTORY-1 (View diff) — the past change whose stored, redacted diff is shown read-only
  // in the right drawer. Set from the Agent changes timeline; cleared on drawer close.
  const [viewDiffItem, setViewDiffItem] = useState<AgentChangeHistoryItem | null>(null);

  // AGENT-CHANGE-HISTORY-1 (test-fix) — verify a just-applied failed-run repair against the next run,
  // recording tested / test_failed. Mounted here (stable) because the repair UI unmounts mid-verify.
  useRepairTestVerification(workflow.id, { enabled: !localOnly });

  // REACT-AGENT-TEST-FIX-LOOP — advance the user-visible guided repair thread
  // (test_failed → field_opened → retesting → test_passed / still_failing) from
  // the latest run slice. Mounted here (stable) because the guided panel unmounts
  // when the drawer switches away from run results.
  useAgentRepairLoop(workflow.id, { enabled: !localOnly });

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
        <>
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
          focusPulse={headerFocusPulse}
          // 5.DUAL-BUILDER-1 CS-1 — Visual/Document toggle, only when the
          // server-resolved flag is on (absent → header byte-identical).
          {...(documentBuilderEnabled
            ? { viewToggle: { view: builderView, onChange: handleSetBuilderView } }
            : {})}
          // ANON-BUILDER-1 — local-only: replace save/run/activate with a sign-up CTA.
          {...(localOnly ? { localOnly: true } : {})}
        />
        {/* BUILDER-TABS-HEADER-1 — the section tabs sit in the header region,
            below the 48px action bar, visible in BOTH Visual and Document
            modes (they were previously canvas-only in CanvasActionBar). */}
        <BuilderTabStrip activeTab={activeTab} onSelectTab={setActiveTab} />
        </>
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
      // DOC-REACT-AGENT-1 — in Document mode the bottom agent workspace IS the
      // React Agent surface, so the vertical rail is not rendered at all (not
      // merely collapsed): no spine, no gutter, no duplicate entry point. The
      // conversation itself is unaffected — it lives in `agentConversation`
      // here, so switching back to Visual re-renders the same transcript.
      leftRail={documentViewActive ? undefined : (
        <BuilderLeftAgentRail
          isCollapsed={leftRail.isCollapsed}
          onToggle={leftRail.toggle}
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
            // HERMES-AGENT-GUIDED-PREVIEW-SETUP-RAIL-UX — guided setup card lives in the rail, tied to
            // the latest shown preview. PreviewConfig stays owned here (ephemeral, never dirty/saved).
            previewForSetup={previewOverlay?.preview ?? null}
            {...(setupFieldsByType ? { setupFieldsByType } : {})}
            previewConfig={previewConfig}
            previewPrefilledConfig={previewPrefilledConfig}
            onPreviewConfigChange={handlePreviewConfigChange}
            onApplyPreview={handleApplyPreview}
            getCheckReviewContext={getCheckReviewContext}
            getCurrentGraphShape={getCurrentGraphShape}
            getCurrentDraft={getCurrentDraft}
            renderCheckSetup={renderCheckSetup}
            {...(documentComposerSeed ? { composerSeed: documentComposerSeed } : {})}
            onTemplateApplyToCurrent={handleTemplateApplyToCurrent}
            conversation={agentConversation}
          />
          )}
        </BuilderLeftAgentRail>
      )}
      rightDrawer={
        viewDiffItem ? (
          // AGENT-CHANGE-HISTORY-1 (View diff) — read-only render of a PAST change's stored, redacted
          // diff. Highest drawer precedence (user-initiated from the Agent changes timeline); closing
          // (× / Esc) returns to whatever drawer was underneath.
          <AgentChangeDiffDrawer item={viewDiffItem} onClose={() => setViewDiffItem(null)} />
        ) : previewReviewActive ? (
          // HERMES-AGENT-CONFIG-DIFF-REVIEW — while an EDIT preview is active the right drawer takes over
          // with the value-level "Review changes" rail (precedence over inspector/results/validation). The
          // canvas keeps the structural diff; this rail owns the field-level detail. Closing the drawer
          // (× / Esc) discards the preview — same as the canvas "Discard preview". The locked useRightDrawer
          // union is untouched (this is a local branch, not a 4th mode).
          <BuilderRightDrawer title="Review changes" onClose={handleDiscardPreview}>
            <PreviewReviewPanel
              {...(previewOverlay?.preview.summary ? { summary: previewOverlay.preview.summary } : {})}
              configDiff={configDiff}
              rationale={previewRationale}
              readiness={agentReadiness}
              applyModes={applyModeAvailability}
              onSelectApplyMode={handleSelectApplyMode}
              onDiscard={handleDiscardPreview}
              {...(destructivePreview.isDestructive ? { destructive: destructivePreview } : {})}
            />
          </BuilderRightDrawer>
        ) : drawerVisible ? (
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
        {/* 5.DUAL-BUILDER-1 CS-1 — the center workspace renders ONE of two
            projections of the same graphSlice draft. Switching mounts/unmounts
            the surface only; graph state, config drafts, dirty, undo history,
            and canvas positions live in the shared stores and are untouched.
            BUILDER-TABS-HEADER-1 — the Runs / Data Map / History / Settings
            tabs render HERE (above the mode branch) so both view modes share
            them; "builder" falls through to the Document/Visual branch. */}
        {activeTab !== "builder" ? (
          <BuilderTabPanels
            activeTab={activeTab}
            providerLabels={providerLabels}
            runEditBlocked={workflow.viewerCanRunEdit === false}
            settings={{
              name: workflowName,
              state: workflow.state,
              createdAt: workflow.createdAt,
              updatedAt: workflow.updatedAt,
              activeRevisionId: workflow.activeRevisionId,
              unpublishedChanges: workflow.unpublishedChanges,
            }}
            onNameSaved={setWorkflowName}
            builderViewPreferenceEnabled={documentBuilderEnabled === true && !localOnly}
            historyPanel={
              <HistoryPanel
                items={agentChanges}
                loading={agentChangesLoading}
                error={agentChangesError}
                isDirty={isDirty}
                restoringCheckpointId={checkpointRestoringId}
                restoreError={checkpointRestoreError}
                onRestore={handleRestoreCheckpoint}
                onViewDiff={setViewDiffItem}
              />
            }
            onBackToBuilder={() => setActiveTab("builder")}
          />
        ) : documentViewActive ? (
          <DocumentView
            requiredFieldsByType={requiredFieldsByType}
            summaryFieldsByType={summaryFieldsByType}
            providerLabels={providerLabels}
            providerIcons={providerIcons}
            workflowTitle={workflowName}
            onOpenInVisual={handleOpenInVisual}
            // CS-2 — Document gestures reuse the EXACT canvas paths: the same
            // action picker (tail append / edge insert) and the same inspector.
            onAppendAfter={handleAppendAfter}
            onInsertAtEdge={memoizedEdgePlusClick}
            onOpenStepInspector={handleOpenStepInspector}
            onGuidedStopActive={handleGuidedStopActive}
            onAddToEmptyLane={handleAddToEmptyLane}
            // CS-6 — empty-state manual creation + single-agent Ask React.
            onStartWithTrigger={handleDocumentManualStart}
            onAskReact={handleDocumentAskReact}
            {...(canUseAdvancedBranching !== undefined ? { canUseAdvancedBranching } : {})}
            // CS-6 — the ephemeral agent preview (owned by useBuilderPreview) +
            // the canonical apply/discard handlers, rendered as a ghost Document.
            previewOverlay={previewOverlay}
            // DOC-FINAL-ACCEPTANCE-1 — shared destructive classification (center confirm).
            {...(destructivePreview.isDestructive ? { previewDestructive: destructivePreview } : {})}
            onApplyPreview={handleDocumentApplyPreview}
            onDiscardPreview={handleDocumentDiscardPreview}
            notice={documentNotice}
            onNotice={setDocumentNotice}
            // DOC-REACT-AGENT-1 — the bottom workspace renders the SAME agent
            // transcript the Visual rail renders (one conversation, two
            // presentations). Its own composer is suppressed: the Document bar
            // is the single entry point.
            agentTranscript={
              !localOnly && guidanceEnabled === true && accountId ? (
                <BuilderGuidanceRail
                  workflowId={workflow.id}
                  accountId={accountId}
                  guidanceEnabled={guidanceEnabled}
                  onShowPreview={handleShowPreview}
                  previewForSetup={previewOverlay?.preview ?? null}
                  {...(setupFieldsByType ? { setupFieldsByType } : {})}
                  previewConfig={previewConfig}
                  previewPrefilledConfig={previewPrefilledConfig}
                  onPreviewConfigChange={handlePreviewConfigChange}
                  onApplyPreview={handleApplyPreview}
                  getCheckReviewContext={getCheckReviewContext}
                  getCurrentGraphShape={getCurrentGraphShape}
                  getCurrentDraft={getCurrentDraft}
                  renderCheckSetup={renderCheckSetup}
                  onTemplateApplyToCurrent={handleTemplateApplyToCurrent}
                  conversation={agentConversation}
                  hideComposer
                />
              ) : null
            }
            agentBusy={agentConversation.loading}
            agentHasConversation={agentConversation.messages.length > 0}
            agentExpanded={agentWorkspaceExpanded}
            onAgentExpandedChange={setAgentWorkspaceExpanded}
            onAgentSubmit={handleDocumentAgentSubmit}
            onAgentCheckWorkflow={handleDocumentAgentCheckWorkflow}
            {...(documentComposerSeed ? { agentSeed: documentComposerSeed } : {})}
          />
        ) : (
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
          summaryFieldsByType={summaryFieldsByType}
          resourceLabels={resourceLabels}
          // HERMES-AGENT-APPLY-CONFIG-HINTS — nodes the most recent apply added get the
          // short-lived "Added from preview" badge. Undefined when nothing was just applied.
          // HERMES-AGENT-PREVIEW-CANVAS-STATE-AND-FIT — non-null while a preview is active (a fresh
          // value per show) so the canvas fits the viewport once + hides the empty-state card.
          previewToken={previewOverlay ? previewShowCount : null}
          previewDiff={previewDiffGraph}
        />
        )}
        {/* BUILDER-VIEW-DEFAULT-1 — one-time view chooser for a just-created
            workflow (flag on, no saved default). Never for anonymous local-only
            drafts (no account to save a preference to). */}
        {showViewChooser && !localOnly ? (
          <BuilderViewChooser
            onChoose={handleChooseView}
            onDismiss={() => setShowViewChooser(false)}
          />
        ) : null}
        {addPanelMode !== null ? (
          <AddNodePanel
            mode={addPanelMode}
            triggerProviders={triggerProviders}
            actionProviders={actionProviders}
            providerIcons={providerIcons}
            onPickTrigger={handlePickTrigger}
            onPickAction={handlePickAction}
            onClose={closeAddPanel}
            {...(lockedActionKeys ? { lockedActionKeys } : {})}
          />
        ) : null}
        {/* AI preview controls (UI state only — never merges into the real graph / writes / saves).
            Discard clears state; Apply runs the explicit local-draft edit (HERMES-AGENT-APPLY-PREVIEW-PATCH). */}
        {/* Preview visuals are canvas-anchored; in Document view they stay
            unmounted (the preview STATE is untouched and returns on switch). */}
        {!documentViewActive && previewOverlay && previewDiffGraph ? (
          // EDIT proposal: the canvas shows the single diff graph; this is just the slim, non-overlay
          // Apply/Discard control bar (the SINGLE primary control). HERMES-AGENT-PREVIEW-DIFF-GRAPH.
          <BuilderPreviewControlBar
            notice={previewOverlay.preview.notice}
            onApply={handleApplyPreview}
            onDiscard={handleDiscardPreview}
          />
        ) : !documentViewActive && previewOverlay ? (
          // Additive new-workflow skeleton (no candidate definition): keep the ghost overlay (empty canvas).
          <BuilderPreviewOverlay
            preview={previewOverlay.preview}
            onApply={handleApplyPreview}
            onDiscard={handleDiscardPreview}
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
            setupIssues={agentSetupIssues}
            readiness={agentReadiness}
            onOpenIssue={handleOpenSetupIssue}
            onDismiss={dismissApplyNotice}
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
