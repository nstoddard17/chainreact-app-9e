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
import { BuilderTabPanels } from "./layout/BuilderTabPanels";
import { BuilderViewChooser } from "./panels/BuilderViewChooser";
import { updateDefaultBuilderView } from "@/lib/api/accounts";
import { BuilderPreviewOverlay } from "./canvas/BuilderPreviewOverlay";
import { BuilderPreviewControlBar } from "./canvas/BuilderPreviewControlBar";
import { VisualAgentThinkingBubble } from "./canvas/VisualAgentThinkingBubble";
import type { ConfigDiffFieldMetaByType } from "@/core/workflows/configDiffFieldMeta";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";
import { useResourceLabelCache } from "./state/resourceLabelCache";
import { PreviewReviewPanel } from "./panels/PreviewReviewPanel";
import { BuilderApplyNotice } from "./canvas/BuilderApplyNotice";
import { BuilderTemplatesModal } from "./panels/BuilderTemplatesModal";
import {
  BuilderTeamProvider,
  type BuilderTeamContextValue,
} from "./context/builderTeamContext";
import { BuilderHeader } from "./layout/BuilderHeader";
import { BuilderLeftAgentRail } from "./layout/BuilderLeftAgentRail";
import { BuilderRightDrawer } from "./layout/BuilderRightDrawer";
import { BuilderShell } from "./layout/BuilderShell";
import { useBuilderLayout } from "./layout/useBuilderLayout";
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
import { useAutoShowLatestProposal } from "@/features/workflows/useAutoShowLatestProposal";
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
import { useRightDrawer, type RightDrawerMode } from "./hooks/useRightDrawer";
import { useAgentRailWiring } from "./hooks/useAgentRailWiring";
import { useBuilderPreview } from "./hooks/useBuilderPreview";
import { useRepairTestVerification } from "./hooks/useRepairTestVerification";
import { useAgentRepairLoop } from "./hooks/useAgentRepairLoop";
import { useRepairLoopStore } from "./state/repairLoopStore";
import { useRunControls } from "./hooks/useRunControls";
import { useAgentApplyModeAvailability } from "./hooks/useAgentApplyModeAvailability";
import { useBuilderReadiness } from "./hooks/useBuilderReadiness";
import { useConnectionReadiness } from "./hooks/useConnectionReadiness";
import { useGuidedConnect } from "./hooks/useGuidedConnect";
import type { CheckWorkflowSetupTarget } from "@/core/workflows/checkWorkflowReview";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import { useGuidedBuildSession } from "./hooks/useGuidedBuildSession";
import { useGuidedBuild } from "./hooks/useGuidedBuild";
import { useAgentConversationPersistence } from "./hooks/useAgentConversationPersistence";
import {
  reconcilePersistedPreview,
  type PersistedPreviewVerdict,
} from "@/core/workflows/reactAgentPreviewReconciliation";
import { insertActionAtEdge } from "./utils/insertActionAtEdge";
import { ValidationSummary } from "./validation/ValidationSummary";
import { buildCheckReviewContext } from "./validation/buildCheckReviewContext";
import { activateWorkflow } from "@/lib/api/workflows";
import type { AgentApplyMode } from "@/core/workflows/agentApplyModes";
import { useDestructivePreview } from "./hooks/useDestructivePreview";
import {
  DocumentView,
  readBuilderViewPref,
  writeBuilderViewPref,
  markViewChooserResolved,
  hasResolvedViewChooser,
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
  // BUILDER-VIEW-QA-1 — the session marker suppresses re-shows when Next's
  // router cache remounts the builder with the ORIGINAL justCreated payload
  // (browser back → forward after a choose/dismiss).
  const [showViewChooser, setShowViewChooser] = useState(
    () =>
      documentBuilderEnabled === true &&
      justCreated === true &&
      (defaultBuilderView ?? null) === null &&
      !hasResolvedViewChooser(workflow.id),
  );
  const handleDismissChooser = useCallback(() => {
    setShowViewChooser(false);
    markViewChooserResolved(workflow.id);
  }, [workflow.id]);
  const handleChooseView = useCallback(
    (view: BuilderViewMode, rememberAsDefault: boolean) => {
      setShowViewChooser(false);
      markViewChooserResolved(workflow.id);
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

  // REACT-AGENT-RAIL-NODE-DISPLAY-NAMES-1 — `provider:type` → registry display name, derived from the
  // requirements map the server already threads in (it carries `displayName` per node type). The React
  // rail's setup card uses it to name each sketched step the way the canvas and config panel do,
  // instead of printing the raw capability key. No new server plumbing, no new fetch.
  const nodeDisplayNames = useMemo(
    () =>
      requiredFieldsByType
        ? Object.fromEntries(Object.entries(requiredFieldsByType).map(([key, r]) => [key, r.displayName]))
        : undefined,
    [requiredFieldsByType],
  );

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
  const { mode, openDrawer: openDrawerRaw, closeDrawer } = useRightDrawer();

  // BUILDER-RESPONSIVE-LAYOUT-1 — the resolved width class for the whole
  // builder. ONE subscription, read here and threaded down as presentation
  // props; no component below this line measures the viewport.
  const layout = useBuilderLayout();

  // Slice 4.BUILDER-LEFT-AGENT-1: left React Agent rail collapse state
  // (persisted to localStorage via useLeftAgentRail). The header
  // exposes a toggle; the rail itself exposes an in-rail × button.
  // DOC-RAIL-LAYOUT-1 — builder-mode-aware: Document mode tracks its own
  // session-only state that defaults (and re-defaults on every entry) to
  // collapsed, so the Document gets the full workspace and its Ask React bar
  // is the one visible AI entry. The persisted Visual preference is never
  // touched by Document-mode toggling and is restored on switch back.
  const leftRail = useLeftAgentRail(documentViewActive ? "document" : "visual");

  /*
    BUILDER-RESPONSIVE-LAYOUT-1 — "one secondary surface at a time" on narrow
    screens.

    Below 900px both the agent rail and the config surface are sheets over the
    canvas. Two stacked sheets would leave no canvas visible at all, so opening
    either one closes the other — but ONLY at that width. At ≥900px the rail is
    still an in-flow column beside a config sheet and both stay open, because
    throwing away the transcript a user is working from is a worse outcome than
    a slightly smaller canvas when there is room for both.

    This is deliberately implemented by wrapping the two ACTIONS, not by an
    effect watching the layout mode. A resize must never be able to close a
    surface on its own: rotating a phone should not discard the config sheet the
    user is filling in. Only an explicit open decides anything, and it reads the
    CURRENT mode through refs so the callbacks stay referentially stable for the
    effect dependency lists below.
  */
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const railRef = useRef(leftRail);
  railRef.current = leftRail;

  const openDrawer = useCallback(
    (next: RightDrawerMode) => {
      if (layoutRef.current.oneSurfaceAtATime && !railRef.current.isCollapsed) {
        railRef.current.collapse();
      }
      openDrawerRaw(next);
    },
    [openDrawerRaw],
  );

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

  /*
    BUILDER-RESPONSIVE-LAYOUT-1 — the other half of the exclusion rule: opening
    the rail on a narrow screen closes the config sheet.

    It routes through `handleDrawerClose`, i.e. the SAME path as the drawer's own
    × and Esc, which clears `activeNodeId`. That is deliberate and it does NOT
    lose work: in-progress field edits live in `configSlice.drafts`, keyed by node
    id, and neither `closeNode` nor `openNode` discards an existing draft. So
    re-opening the step restores exactly what was typed. Using the raw
    `closeDrawer` instead would leave `activeNodeId` set with the sheet shut, and
    because the inspector only re-opens on a node-id TRANSITION, tapping the same
    node again would then do nothing — a dead end.
  */
  const drawerCloseRef = useRef(handleDrawerClose);
  drawerCloseRef.current = handleDrawerClose;
  const drawerVisibleRef = useRef(false);

  const handleLeftRailToggle = useCallback(() => {
    const wasCollapsed = railRef.current.isCollapsed;
    railRef.current.toggle();
    if (wasCollapsed && layoutRef.current.oneSurfaceAtATime && drawerVisibleRef.current) {
      drawerCloseRef.current();
    }
  }, []);

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
  // REACT-AGENT-CONVERSATION-PERSISTENCE-1 — the durable transcript for THIS
  // workflow. The conversation stays the single owner of the message list; this
  // only gives it somewhere to read from and write to. Off for the logged-out
  // local-only builder (no account, no server workflow, no thread).
  const agentConversationPersistence = useAgentConversationPersistence({
    workflowId: workflow.id,
    enabled: !localOnly && !!accountId,
  });
  const agentConversation = useGuidanceConversation(
    {
      accountId: accountId ?? "",
      workflowId: workflow.id,
      getCurrentDraft,
      getCheckReviewContext,
    },
    agentConversationPersistence ? { persistence: agentConversationPersistence } : {},
  );
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
    reviewSessionToken,
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
    handleApplyPreview,
    handleApplyAndTest,
    handleKeepAsPreview,
    // REACT-AGENT-CONVERSATION-PERSISTENCE-1 — both are re-exported below wrapped
    // with `guidedSession.invalidate()`: restoring a checkpoint or discarding a
    // preview changes what exists, and a guided session that survived either
    // would be walking the user through work that is no longer there.
    handleRestoreCheckpoint: restoreCheckpointOnly,
    handleDiscardPreview: discardPreviewOnly,
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

  // REACT-AGENT-TRUTH-AND-TURN-INTEGRITY-AUDIT-1 — same-turn canvas delivery. The auto-show
  // effect lives HERE (always mounted for the builder session), not inside the guidance panel:
  // when the panel is unmounted (collapsed Document workspace, mode switch) a proposal must still
  // reach the canvas during the turn that produced it — never held until the user's next message
  // remounts the panel and flushes it as if the later turn had produced it.
  useAutoShowLatestProposal({
    messages: agentConversation.messages,
    onPreviewToCanvas: handleShowPreview,
    getCurrentGraphShape,
  });

  // REACT-AGENT-CONVERSATION-PERSISTENCE-1 — the workflow as it is actually
  // SAVED. `hydratedRevision` is the server `updatedAt` of the last accepted
  // hydrate/save, so it identifies the graph version a returning user is looking
  // at; `savedNodes` is what that version contains. Both feed the guided-session
  // hint and the restored-proposal reconciliation, which is the whole point:
  // neither may be decided from the local draft or from conversation history.
  const savedGraphVersion = useGraphSlice((s) => s.hydratedRevision);
  const savedWorkflowEmpty = useGraphSlice((s) => s.savedNodes.length === 0);

  // REACT-AGENT-GUIDED-BUILD-1 — the guided build session switch. Starts on a
  // React Agent apply (new review session while the notice is up).
  // REACT-AGENT-CONVERSATION-PERSISTENCE-1 — it now persists ONLY once the
  // applied work has been SAVED, bound to that saved revision, so an
  // applied-but-abandoned draft can never bring the setup card back.
  const guidedSession = useGuidedBuildSession({
    workflowId: workflow.id,
    ...(localOnly ? { localOnly } : {}),
    reviewSessionToken,
    hasApplyNotice: !!applyNotice,
    workflowState: workflow.state,
    savedGraphVersion,
    savedWorkflowEmpty,
    draftIsDirty: isDirty,
    // Nothing is left to walk the user through once the workflow is live; the
    // stored hint is cleared at that point so a finished journey never returns.
    hasRemainingSetupWork: workflow.state !== "active",
  });
  const invalidateGuidedSession = guidedSession.invalidate;

  const handleDiscardPreview = useCallback(() => {
    discardPreviewOnly();
    invalidateGuidedSession();
  }, [discardPreviewOnly, invalidateGuidedSession]);

  const handleRestoreCheckpoint = useCallback(
    (checkpointId: string) => {
      restoreCheckpointOnly(checkpointId);
      invalidateGuidedSession();
    },
    [restoreCheckpointOnly, invalidateGuidedSession],
  );

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

  /**
   * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — judge ONE restored proposal against
   * the workflow as it stands now.
   *
   * The three inputs are deliberately all present-tense: the canonical lifecycle
   * row from `agent_change_history`, the revision the proposal was pinned to, and
   * the revision that is actually saved. The pure core helper turns them into the
   * badge and decides whether reopening is safe; nothing here guesses.
   */
  const reconcileRestoredPreview = useCallback(
    (message: {
      readonly agentChangeId?: string;
      readonly baseGraphVersion?: string | null;
      readonly hasProposalPayload: boolean;
    }): PersistedPreviewVerdict | null => {
      // While the timeline is still loading we do not yet know what happened to
      // this proposal, and a wrong badge is worse than none: "Not applied" on a
      // change the user DID apply reads as data loss. Say nothing until the
      // canonical record is in hand.
      if (agentChangesLoading) return null;
      const row = message.agentChangeId
        ? agentChanges.find((item) => item.agentChangeId === message.agentChangeId)
        : undefined;
      return reconcilePersistedPreview({
        ...(message.agentChangeId ? { agentChangeId: message.agentChangeId } : {}),
        changeStatus: row?.status ?? null,
        baseGraphVersion: message.baseGraphVersion ?? null,
        savedGraphVersion,
        hasProposalPayload: message.hasProposalPayload,
      });
    },
    [agentChanges, agentChangesLoading, savedGraphVersion],
  );

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
  // REACT-AGENT-GUIDED-BUILD-1 — the guided session keeps the window open past the
  // notice, and the connection signal + imperative refresh feed the guided card.
  const {
    verdict: agentReadiness,
    connection: connectionSignal,
    refreshConnections,
  } = useBuilderReadiness({
    workflowId: workflow.id,
    previewReviewActive,
    proposedDefinition: previewOverlay?.proposedDefinition ?? null,
    applyNoticeActive: !!applyNotice,
    guidedSessionActive: guidedSession.active,
    pendingNodes,
    pendingEdges,
    ...(requiredFieldsByType ? { requiredFieldsByType } : {}),
    workflowState: workflow.state,
    ...(localOnly ? { localOnly } : {}),
    ...(workflow.viewerCanRunEdit !== undefined ? { viewerCanRunEdit: workflow.viewerCanRunEdit } : {}),
  });

  /**
   * REACT-AGENT-PREAPPLY-SETUP-UX-1 — connection state for the providers the PREVIEW proposes.
   *
   * The pre-apply summary needs to say "Slack connection" is part of the setup ahead, and the live
   * draft cannot answer that: for a new-workflow sketch the draft is still empty. So the existing
   * connection brain is asked about a definition synthesised from the preview's own nodes — the
   * route uses a `draftOverride` only to decide WHICH providers to inspect, never who may inspect
   * them. Read-only, deterministic, no model call. Skipped entirely when no preview is open.
   */
  const previewConnectionDefinition = useMemo<WorkflowDefinition | null>(() => {
    const nodes = previewOverlay?.preview.nodes ?? [];
    if (nodes.length === 0) return null;
    return {
      nodes: nodes.map((n) => ({
        id: n.previewId,
        kind: n.role === "trigger" ? ("trigger" as const) : ("action" as const),
        provider: n.provider,
        type: n.type,
        config: {},
        position: { x: 0, y: 0 },
      })),
      edges: [],
    };
  }, [previewOverlay]);
  const { signal: previewConnection } = useConnectionReadiness({
    workflowId: workflow.id,
    definition: previewConnectionDefinition,
    enabled: !localOnly && !!accountId && previewConnectionDefinition !== null,
  });

  // REACT-AGENT-GUIDED-BUILD-1 — Configure-stage targets: the live draft's
  // nodes with missing required fields, from the SAME validator/grouping the
  // Check-workflow review uses. Recomputed as the user fills fields, so a
  // completed node drops out and the next becomes current automatically.
  const guidedSetupTargets = useMemo(
    () =>
      buildCheckReviewContext({
        pendingNodes,
        pendingEdges,
        ...(requiredFieldsByType ? { requiredFieldsByType } : {}),
        providerLabels,
      }).setupTargets,
    [pendingNodes, pendingEdges, requiredFieldsByType, providerLabels],
  );

  // REACT-AGENT-GUIDED-BUILD-1 — guided Test: persist a dirty draft first
  // (run-now executes the SAVED draft), then dispatch the SAME safe test-mode
  // run the header uses. Dispatch failures land in the run controls' safe
  // runError, which the guided card renders.
  const draftIsDirty = useGraphSlice((s) => s.isDirty);
  const handleGuidedTest = useCallback(async () => {
    const gs = useGraphSlice.getState();
    if (gs.isDirty) await gs.save();
    await builderRunControls.handleTestWorkflow();
    // builderRunControls captures dispatch errors into runError (safe copy).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderRunControls.handleTestWorkflow]);

  // REACT-AGENT-GUIDED-BUILD-1 — guided Activate: explicit user action only.
  // Save-if-dirty → the EXISTING activate route (readiness 422 + destructive
  // 409 + plan 403 all enforced server-side) → refresh the server-rendered
  // lifecycle state so workflow.state flips to "active" (guided stage →
  // complete). CONFIRMATION_REQUIRED is rethrown for the card's shared modal.
  const handleGuidedActivate = useCallback(
    async (confirmationText?: string) => {
      const gs = useGraphSlice.getState();
      if (gs.isDirty) await gs.save();
      await activateWorkflow(
        workflow.id,
        confirmationText !== undefined ? { confirmationText } : {},
      );
      router.refresh();
    },
    [workflow.id, router],
  );

  // REACT-AGENT-PREAPPLY-SETUP-UX-1 — ONE OAuth popup controller for the whole guided journey:
  // the Connect stage's provider cards and any connection-blocked Configure field share it, so a
  // single popup and a single attempt state back whichever surface the user acts from.
  const guidedConnect = useGuidedConnect({ onRefreshConnections: refreshConnections });

  /**
   * REACT-AGENT-PREAPPLY-SETUP-UX-1 — the Configure stage's node setup card.
   *
   * Same card the Check-workflow review renders, plus the two things only the guided journey knows:
   *   - the user's own request text, so a large static catalog (which Stripe event?) can offer a
   *     short list of likely matches instead of a wall of checkboxes. Display only — a suggestion
   *     is never preselected, and the match is a local string comparison, not a model call.
   *   - the rail's connect controller, so a field blocked by a missing connection offers "Connect
   *     <provider>" in place rather than sending the user off to the Apps page mid-journey.
   */
  const lastUserRequest = useMemo(() => {
    for (let i = agentConversation.messages.length - 1; i >= 0; i -= 1) {
      const m = agentConversation.messages[i]!;
      if (m.role === "user" && m.text.trim().length > 0) return m.text;
    }
    return undefined;
  }, [agentConversation.messages]);

  const renderGuidedNodeSetup = useCallback(
    (targets: readonly CheckWorkflowSetupTarget[]) =>
      renderCheckSetup(targets, {
        ...(lastUserRequest ? { suggestionQuery: lastUserRequest } : {}),
        onConnectProvider: guidedConnect.connect,
        connectingProvider:
          guidedConnect.attempt &&
          (guidedConnect.attempt.status === "launching" ||
            guidedConnect.attempt.status === "waiting")
            ? guidedConnect.attempt.provider
            : null,
      }),
    [renderCheckSetup, lastUserRequest, guidedConnect],
  );

  // REACT-AGENT-GUIDED-BUILD-1 — the guided card (stage projection + popup
  // connect + rail footer). Deterministic wiring only; no model call, no
  // AI-credit charge on any guided control.
  const { guidedFooter } = useGuidedBuild({
    sessionActive: guidedSession.active,
    onExitSession: guidedSession.exit,
    ...(localOnly ? { localOnly } : {}),
    previewReviewActive,
    workflowState: workflow.state,
    verdict: agentReadiness,
    connection: connectionSignal,
    connect: guidedConnect,
    providerLabels,
    onOpenIssues: handleOpenValidation,
    guidedSetupTargets,
    renderNodeSetup: renderGuidedNodeSetup,
    onTest: handleGuidedTest,
    runError: builderRunControls.runError,
    draftIsDirty,
    onActivate: handleGuidedActivate,
  });

  /**
   * BUILDER-ISSUES-RAIL-1 — the nodes React itself just added/edited, so the issues rail can pick
   * honest explanation copy. A gap on one of these can say the agent left it empty; a gap on a
   * hand-built or template step must not (see `validationIssueGuidance`). Derived from the agent's
   * own setup-issue read-model, so it is empty outside a review session.
   */
  const agentNodeIds = useMemo(
    () => new Set(agentSetupIssues.map((issue) => issue.nodeId)),
    [agentSetupIssues],
  );

  /**
   * BUILDER-ISSUES-RAIL-1 — an apply opens the issues rail, UNLESS the apply already took the user
   * somewhere more specific.
   *
   * The floating review tray used to be how a user learned "applied, but N things still need you".
   * With that list re-homed into the rail, the apply has to open the rail or the signal is lost.
   *
   * But the right drawer is single-slot (`useRightDrawer` enforces one panel at a time), and
   * HERMES-AGENT-AUTO-OPEN-FIRST-INCOMPLETE-AFTER-APPLY already opens the first incomplete node's
   * config panel — often revealing the exact field that needs a value. Opening the rail on top of
   * that would pull the user OFF the field they were just sent to, which is strictly worse than
   * the list they'd gain. So the rail yields whenever a node is open: the header issue-count pill
   * still reports the total and opens the rail on demand. This is the same conflict the old tray's
   * `sessionFocus` handled by opening collapsed — it just resolves in the drawer's favor now.
   *
   * Keyed on `reviewSessionToken`, which the preview hook bumps once per NEW session (a fresh
   * apply / restore / template notice), so ordinary issue churn while the user fixes fields never
   * re-opens a drawer they deliberately closed. A clean apply (no issues) opens nothing — the
   * toast is enough.
   */
  const reviewOpenedTokenRef = useRef<number | null>(null);
  useEffect(() => {
    if (reviewSessionToken === reviewOpenedTokenRef.current) return;
    reviewOpenedTokenRef.current = reviewSessionToken;
    if (agentSetupIssues.length === 0) return;
    if (useConfigSlice.getState().activeNodeId !== null) return;
    openDrawer("validation");
  }, [reviewSessionToken, agentSetupIssues, openDrawer]);

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
      // REACT-AGENT-CONVERSATION-PERSISTENCE-1 — the workflow was REPLACED, so any
      // guided session is describing a graph that no longer exists. End it (and
      // drop its stored hint) rather than letting it re-point at the new draft.
      invalidateGuidedSession();
      // Pull the server-recorded History row (checkpoint-linked → "Restore" available).
      await refreshAgentChanges();
      // Re-read the server-rendered lifecycle state (an ACTIVE workflow whose trigger changed was
      // deactivated server-side; workflow.state is a server prop, not graph-slice state).
      router.refresh();
      showApplyNotice(
        `Applied the “${templateName}” template to this workflow — review required fields, then reconnect and reactivate if needed. You can restore the previous version from History.`,
      );
    },
    [
      workflow.id,
      hydrate,
      closeNode,
      invalidateGuidedSession,
      refreshAgentChanges,
      router,
      showApplyNotice,
    ],
  );

  // CHECKLIST-ITEM-10's open-and-highlight for a clicked setup issue now lives in the issues rail
  // itself (`ValidationSummary.handleOpen` → `configSlice.revealNode`), which is the same
  // navigation-only path this held. Removed with the floating tray that was its only caller
  // (BUILDER-ISSUES-RAIL-1).

  // AGENT-CHANGE-HISTORY-1 (View diff) — the past change whose stored, redacted diff is shown read-only
  // in the right drawer. Set from the Agent changes timeline; cleared on drawer close.
  const [viewDiffItem, setViewDiffItem] = useState<AgentChangeHistoryItem | null>(null);

  // BUILDER-EMPTY-STATE-TEMPLATES-1 — the empty-canvas "Import from template"
  // entry point. Opens the SAME self-contained BuilderTemplatesModal the
  // header's Templates button uses (create-new / replace-current, with its own
  // confirmations); this is a second mount point, not a second implementation.
  // Never wired on the logged-out local-only builder.
  const [emptyStateTemplatesOpen, setEmptyStateTemplatesOpen] = useState(false);

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
  drawerVisibleRef.current = drawerVisible;

  /*
    BUILDER-RESPONSIVE-LAYOUT-1 — which surfaces are CURRENTLY sheets over the
    canvas, and therefore need the shell's scrim.

    The config sheet wins precedence when both are somehow open: it paints later
    in the DOM at the same z-index, so it is what the user is actually looking
    at, and dismissing the thing on top is what a click on the dimmer means.
  */
  const configSheetOpen =
    layout.config === "overlay" &&
    (viewDiffItem !== null || previewReviewActive || drawerVisible);
  const railSheetOpen =
    layout.rail === "overlay" && !documentViewActive && !leftRail.isCollapsed;
  const activeSheet = configSheetOpen ? "config" : railSheetOpen ? "rail" : null;
  const handleScrimDismiss = useCallback(() => {
    if (configSheetOpen) {
      if (viewDiffItem !== null) {
        setViewDiffItem(null);
        return;
      }
      if (previewReviewActive) {
        handleDiscardPreview();
        return;
      }
      handleDrawerClose();
      return;
    }
    railRef.current.collapse();
  }, [configSheetOpen, viewDiffItem, previewReviewActive, handleDiscardPreview, handleDrawerClose]);

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
          // BUILDER-HEADER-TABS-CENTER-1 — the section tabs render in the
          // header's CENTER region (replacing the old ID/runs meta strip), so
          // the header is one 48px row in BOTH Visual and Document modes.
          tabs={{ activeTab, onSelectTab: setActiveTab }}
          leftRail={{
            isCollapsed: leftRail.isCollapsed,
            // BUILDER-RESPONSIVE-LAYOUT-1 — the exclusion-aware toggle. On a
            // narrow screen this header button is the ONLY way back to a closed
            // rail sheet (there is no spine to click), so it must be the same
            // coordinated action the rail's own × uses.
            onToggle: handleLeftRailToggle,
          }}
          density={layout.header}
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
      overlay={
        activeSheet
          ? { active: true, onDismiss: handleScrimDismiss, label: activeSheet }
          : undefined
      }
      leftRail={documentViewActive ? undefined : (
        <BuilderLeftAgentRail
          isCollapsed={leftRail.isCollapsed}
          onToggle={handleLeftRailToggle}
          // BUILDER-RESPONSIVE-LAYOUT-1 — in-flow column ≥ 900px (narrower at the
          // medium tier so the canvas keeps priority), sheet below it.
          presentation={layout.rail}
          panelWidth={layout.railWidth}
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
            {...(nodeDisplayNames ? { nodeDisplayNames } : {})}
            previewPrefilledConfig={previewPrefilledConfig}
            previewConnection={previewConnection}
            onApplyPreview={handleApplyPreview}
            // REACT-AGENT-RESOLVER-RECOVERY-1 — name providers in option-recovery copy, and give
            // every unresolved preview field a working path into its real step editor.
            providerLabels={providerLabels}
            getCheckReviewContext={getCheckReviewContext}
            getCurrentGraphShape={getCurrentGraphShape}
            getCurrentDraft={getCurrentDraft}
            renderCheckSetup={renderCheckSetup}
            {...(documentComposerSeed ? { composerSeed: documentComposerSeed } : {})}
            onTemplateApplyToCurrent={handleTemplateApplyToCurrent}
            conversation={agentConversation}
            reconcileRestoredPreview={reconcileRestoredPreview}
            {...(guidedFooter ? { guidedFooter } : {})}
          />
          )}
        </BuilderLeftAgentRail>
      )}
      rightDrawer={
        viewDiffItem ? (
          // AGENT-CHANGE-HISTORY-1 (View diff) — read-only render of a PAST change's stored, redacted
          // diff. Highest drawer precedence (user-initiated from the Agent changes timeline); closing
          // (× / Esc) returns to whatever drawer was underneath.
          <AgentChangeDiffDrawer
            item={viewDiffItem}
            onClose={() => setViewDiffItem(null)}
            presentation={layout.config}
          />
        ) : previewReviewActive ? (
          // HERMES-AGENT-CONFIG-DIFF-REVIEW — while an EDIT preview is active the right drawer takes over
          // with the value-level "Review changes" rail (precedence over inspector/results/validation). The
          // canvas keeps the structural diff; this rail owns the field-level detail. Closing the drawer
          // (× / Esc) discards the preview — same as the canvas "Discard preview". The locked useRightDrawer
          // union is untouched (this is a local branch, not a 4th mode).
          <BuilderRightDrawer
            title="Review changes"
            onClose={handleDiscardPreview}
            presentation={layout.config}
          >
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
            presentation={layout.config}
          >
            {mode === "inspector" ? (
              localOnly ? <LocalConfigNote /> : <NodeInspectorPanel />
            ) : null}
            {mode === "results" ? (
              // HERMES-AGENT-REHOME-RUN-RESULTS-REPAIR — accountId scopes the governed repair route.
              <RunResultsPanel {...(accountId ? { accountId } : {})} />
            ) : null}
            {mode === "validation" ? (
              /* BUILDER-ISSUES-RAIL-1 — the single issues surface. The post-apply agent review
                 (its confirmation line, readiness verdict, and which nodes React itself added)
                 folds in here instead of raising a second floating list over the canvas. */
              <ValidationSummary
                onChooseTrigger={openTriggerPicker}
                requiredFieldsByType={requiredFieldsByType}
                reviewNotice={applyNotice}
                readiness={agentReadiness}
                agentNodeIds={agentNodeIds}
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
                  {...(nodeDisplayNames ? { nodeDisplayNames } : {})}
                  previewPrefilledConfig={previewPrefilledConfig}
                  previewConnection={previewConnection}
                  onApplyPreview={handleApplyPreview}
                  providerLabels={providerLabels}
                        getCheckReviewContext={getCheckReviewContext}
                  getCurrentGraphShape={getCurrentGraphShape}
                  getCurrentDraft={getCurrentDraft}
                  renderCheckSetup={renderCheckSetup}
                  onTemplateApplyToCurrent={handleTemplateApplyToCurrent}
                  conversation={agentConversation}
                  reconcileRestoredPreview={reconcileRestoredPreview}
                  hideComposer
                  {...(guidedFooter ? { guidedFooter } : {})}
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
          {...(localOnly ? {} : { onImportTemplate: () => setEmptyStateTemplatesOpen(true) })}
          onEdgePlusClick={memoizedEdgePlusClick}
          onAddAction={openActionPicker}
          canAddAction={canAddAction}
          addActionBlockedReason={addActionBlockedReason}
          onAppendAfterNode={handleAppendAfter}
          onArrange={handleArrange}
          requiredFieldsByType={requiredFieldsByType}
          summaryFieldsByType={summaryFieldsByType}
          resourceLabels={resourceLabels}
          // HERMES-AGENT-APPLY-CONFIG-HINTS — nodes the most recent apply added get the
          // short-lived "Added from preview" badge. Undefined when nothing was just applied.
          // HERMES-AGENT-PREVIEW-CANVAS-STATE-AND-FIT — non-null while a preview is active (a fresh
          // value per show) so the canvas fits the viewport once + hides the empty-state card.
          previewToken={previewOverlay ? previewShowCount : null}
          previewDiff={previewDiffGraph}
          // BUILDER-RESPONSIVE-LAYOUT-1 — the canvas measures nothing itself; it
          // is told the tier so the minimap can stand down on a phone-sized
          // canvas instead of covering the workflow it is meant to help navigate.
          layoutMode={layout.mode}
        />
        )}
        {/* BUILDER-VIEW-DEFAULT-1 — one-time view chooser for a just-created
            workflow (flag on, no saved default). Never for anonymous local-only
            drafts (no account to save a preference to). */}
        {showViewChooser && !localOnly ? (
          <BuilderViewChooser
            onChoose={handleChooseView}
            onDismiss={handleDismissChooser}
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
        {/* REACT-AGENT-VISUAL-THINKING-BUBBLE-1 — small canvas "React is thinking…" bubble while a
            guidance request is in flight. VISUAL mode only (Document mode has its own busy
            affordance); reads the SAME `loading` the rail uses (one request incl. its internal
            repair — no flicker), pointer-events-none, never part of the graph or persisted. */}
        {!documentViewActive ? (
          <VisualAgentThinkingBubble isThinking={agentConversation.loading} />
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
            {...(nodeDisplayNames ? { nodeDisplayNames } : {})}
          />
        ) : null}
        {/* HERMES-AGENT-APPLY-PREVIEW-PATCH / -CONFIG-HINTS — transient confirmation after an explicit
            apply. The nodes are now part of the local draft (dirty); the user still reviews required
            fields + saves.
            BUILDER-ISSUES-RAIL-1 — what still needs setup is NOT listed here any more. It is the
            issues rail's job (one issues surface, one presentation), and the apply opens that rail.
            This stays a one-line acknowledgement that cannot cover the canvas or a config field. */}
        {applyNotice ? (
          <BuilderApplyNotice notice={applyNotice} onDismiss={dismissApplyNotice} />
        ) : null}
        {/* BUILDER-EMPTY-STATE-TEMPLATES-1 — empty-state "Import from template"
            opens the same in-builder templates modal as the header button. */}
        {!localOnly && emptyStateTemplatesOpen ? (
          <BuilderTemplatesModal
            workflowId={workflow.id}
            isDirty={draftIsDirty}
            workflowState={workflow.state}
            onClose={() => setEmptyStateTemplatesOpen(false)}
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
