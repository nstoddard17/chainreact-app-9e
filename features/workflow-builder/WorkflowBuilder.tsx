"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";
import { WorkflowCanvas } from "./canvas/WorkflowCanvas";
import { BuilderHeader } from "./layout/BuilderHeader";
import { BuilderLeftAgentRail } from "./layout/BuilderLeftAgentRail";
import { BuilderRightDrawer } from "./layout/BuilderRightDrawer";
import { BuilderShell } from "./layout/BuilderShell";
import {
  AddNodePanel,
  type AddNodePanelMode,
  type ProviderOption,
} from "./panels/AddNodePanel";
import { BuilderAiPanel } from "./panels/BuilderAiPanel";
import { NodeInspectorPanel } from "./panels/NodeInspectorPanel";
import { RunResultsPanel } from "./panels/RunResultsPanel";
import { useConfigSlice } from "./state/configSlice";
import { useGraphSlice } from "./state/graphSlice";
import { useRunSlice } from "./state/runSlice";
import { useLatestRunPolling } from "./hooks/useLatestRunPolling";
import { useLeftAgentRail } from "./hooks/useLeftAgentRail";
import { useRightDrawer } from "./hooks/useRightDrawer";
import { insertActionAtEdge } from "./utils/insertActionAtEdge";
import { ValidationSummary } from "./validation/ValidationSummary";

interface Props {
  workflow: WorkflowDetail;
  triggerProviders: readonly ProviderOption[];
  actionProviders: readonly ProviderOption[];
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
 * Slice 4.BUILDER-LEFT-AGENT-1 — the React Agent (BuilderAiPanel)
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
}: Props) {
  const hydrate = useGraphSlice((s) => s.hydrate);
  const reset = useGraphSlice((s) => s.reset);
  const resetConfigSlice = useConfigSlice((s) => s.reset);
  const resetRunSlice = useRunSlice((s) => s.reset);
  const activeNodeId = useConfigSlice((s) => s.activeNodeId);
  const closeNode = useConfigSlice((s) => s.closeNode);
  const runId = useRunSlice((s) => s.runId);

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
    return () => {
      reset();
      resetConfigSlice();
      resetRunSlice();
    };
  }, [workflow.id, reset, resetConfigSlice, resetRunSlice]);

  // Slice 3.8 — owns the 1s polling interval for the latest run.
  useLatestRunPolling();

  const providerLabels = buildProviderLabelMap(triggerProviders, actionProviders);
  const providerIcons = buildProviderIconMap(triggerProviders, actionProviders);

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
  const openTriggerPicker = useCallback(() => {
    setAddPanelMode({ kind: "trigger" });
  }, []);
  const openActionPicker = useCallback(() => {
    setAddPanelMode({ kind: "action" });
  }, []);
  const closeAddPanel = useCallback(() => {
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
      if (!insertContext) {
        slice.addActionFromMeta(meta);
        return;
      }
      insertActionAtEdge(insertContext.edgeId, meta);
    },
    [],
  );

  const hasTrigger = useGraphSlice((s) =>
    s.pendingNodes.some((n) => n.kind === "trigger"),
  );
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
    <BuilderShell
      header={
        <BuilderHeader
          workflowName={workflow.name}
          workflowId={workflow.id}
          leftRail={{
            isCollapsed: leftRail.isCollapsed,
            onToggle: leftRail.toggle,
          }}
          validation={{ onOpen: handleOpenValidation }}
          lifecycle={{ workflowId: workflow.id, state: workflow.state }}
        />
      }
      leftRail={
        <BuilderLeftAgentRail
          isCollapsed={leftRail.isCollapsed}
          onCollapse={leftRail.collapse}
        >
          <BuilderAiPanel />
        </BuilderLeftAgentRail>
      }
      rightDrawer={
        drawerVisible ? (
          <BuilderRightDrawer
            title={drawerTitle}
            onClose={handleDrawerClose}
          >
            {mode === "inspector" ? <NodeInspectorPanel /> : null}
            {mode === "results" ? <RunResultsPanel /> : null}
            {mode === "validation" ? <ValidationSummary /> : null}
          </BuilderRightDrawer>
        ) : null
      }
    >
      <div
        className="flex min-h-0 flex-1 flex-col"
        aria-label="Workflow builder"
        data-testid="builder-center-workspace"
      >
        <WorkflowCanvas
          providerLabels={providerLabels}
          providerIcons={providerIcons}
          onEmptyAddTrigger={openTriggerPicker}
          onEdgePlusClick={memoizedEdgePlusClick}
          onAddAction={openActionPicker}
          canAddAction={hasTrigger}
          triggerTagText={triggerTagText}
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
      </div>
    </BuilderShell>
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
