"use client";

import { useCallback, useEffect, useRef } from "react";
import type { WorkflowDetail } from "@/contracts/workflow";
import { NodeList } from "./canvas/NodeList";
import { WorkflowCanvas } from "./canvas/WorkflowCanvas";
import { BuilderHeader } from "./layout/BuilderHeader";
import { BuilderRightDrawer } from "./layout/BuilderRightDrawer";
import { BuilderShell } from "./layout/BuilderShell";
import { AddNodeMenu, type ProviderOption } from "./panels/AddNodeMenu";
import { BuilderAiPanel } from "./panels/BuilderAiPanel";
import { NodeInspectorPanel } from "./panels/NodeInspectorPanel";
import { RunNowPanel } from "./panels/RunNowPanel";
import { RunResultsPanel } from "./panels/RunResultsPanel";
import { useConfigSlice } from "./state/configSlice";
import { useGraphSlice } from "./state/graphSlice";
import { useRunSlice } from "./state/runSlice";
import { useLatestRunPolling } from "./hooks/useLatestRunPolling";
import { useRightDrawer } from "./hooks/useRightDrawer";

interface Props {
  workflow: WorkflowDetail;
  triggerProviders: readonly ProviderOption[];
  actionProviders: readonly ProviderOption[];
}

/**
 * Workflow builder root. Composes the BuilderShell + BuilderHeader from
 * BUILDER-UI-SHELL-1, the polished canvas + node card + empty state from
 * BUILDER-CANVAS-1, and now (BUILDER-INSPECTOR-1) the right-side drawer
 * that hosts the node configuration inspector.
 *
 * Drawer sync model (BUILDER-INSPECTOR-1):
 *   - `useRightDrawer` owns one local `mode: "inspector" | "ai" | "results"
 *     | "validation" | null` field. Today only `inspector` is wired.
 *   - The inspector mode follows `configSlice.activeNodeId`: opening a
 *     node from the canvas / NodeList sets activeNodeId → an effect here
 *     opens the drawer in inspector mode. Closing the drawer drops
 *     activeNodeId so canvas selection and drawer stay in lock-step.
 *   - This is the only place that bridges configSlice ↔ drawer state.
 *     ConfigModalShell itself is unchanged.
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

  // Re-hydrate on workflow change (or initial mount). Also clear the
  // config + run slices so stale per-node drafts and stale latest-run
  // pointers from a previous workflow never leak into the newly-loaded
  // one. (Slice 3.8 added the runSlice reset to the same cleanup window
  // graphSlice + configSlice already share.)
  useEffect(() => {
    hydrate(workflow.id, workflow.draftDefinition);
    resetConfigSlice();
    resetRunSlice();
    return () => {
      reset();
      resetConfigSlice();
      resetRunSlice();
    };
  }, [
    workflow.id,
    workflow.draftDefinition,
    hydrate,
    reset,
    resetConfigSlice,
    resetRunSlice,
  ]);

  // Slice 3.8 — owns the 1s polling interval for the latest run. The
  // hook self-cleans on workflow change / unmount / terminal status.
  useLatestRunPolling();

  const providerLabels = buildProviderLabelMap(triggerProviders, actionProviders);
  const providerIcons = buildProviderIconMap(triggerProviders, actionProviders);

  // Slice 4.BUILDER-CANVAS-1 — bridge the canvas's empty-state CTA to
  // the existing AddNodeMenu "+ Add trigger" button without lifting
  // AddNodeMenu's local `open` state. The ref + callback get removed in
  // BUILDER-ADD-FLOW-1 when AddNodePanel replaces AddNodeMenu and the
  // canvas wires the panel open directly.
  const addTriggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const handleEmptyAddTrigger = useCallback(() => {
    addTriggerButtonRef.current?.click();
  }, []);

  // Slice 4.BUILDER-INSPECTOR-1 — right drawer state machine.
  const { mode, openDrawer, closeDrawer } = useRightDrawer();

  // Sync drawer's inspector mode with configSlice.activeNodeId. Selecting
  // a node anywhere (canvas, NodeList) → drawer opens in inspector mode.
  // ConfigModalShell's own Cancel button calls closeNode() — the effect
  // below sees activeNodeId go to null and closes the drawer.
  useEffect(() => {
    if (activeNodeId !== null) {
      if (mode !== "inspector") openDrawer("inspector");
    } else {
      if (mode === "inspector") closeDrawer();
    }
  }, [activeNodeId, mode, openDrawer, closeDrawer]);

  // Drawer × / Esc handler: closing the inspector also drops the active
  // node so the canvas selection stays in lock-step with what the drawer
  // shows. Non-inspector modes (AI / Results / Validation) won't touch
  // configSlice when they land in later slices.
  const handleDrawerClose = useCallback(() => {
    if (mode === "inspector") closeNode();
    closeDrawer();
  }, [mode, closeNode, closeDrawer]);

  return (
    <BuilderShell header={<BuilderHeader workflowName={workflow.name} />}>
      <div className="flex flex-col gap-4" aria-label="Workflow builder">
        <AddNodeMenu
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
          triggerButtonRef={addTriggerButtonRef}
        />
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <WorkflowCanvas
              providerLabels={providerLabels}
              providerIcons={providerIcons}
              onEmptyAddTrigger={handleEmptyAddTrigger}
            />
            <NodeList providerLabels={providerLabels} />
            <RunNowPanel />
            <RunResultsPanel />
            <BuilderAiPanel />
          </div>
          {mode === "inspector" && activeNodeId !== null ? (
            <BuilderRightDrawer
              title="Node configuration"
              onClose={handleDrawerClose}
            >
              <NodeInspectorPanel />
            </BuilderRightDrawer>
          ) : null}
        </div>
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
