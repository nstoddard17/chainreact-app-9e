"use client";

import { useCallback, useEffect, useRef } from "react";
import type { WorkflowDetail } from "@/contracts/workflow";
import { NodeList } from "./canvas/NodeList";
import { WorkflowCanvas } from "./canvas/WorkflowCanvas";
import { ConfigModalShell } from "./config-modal/ConfigModalShell";
import { BuilderHeader } from "./layout/BuilderHeader";
import { BuilderShell } from "./layout/BuilderShell";
import { AddNodeMenu, type ProviderOption } from "./panels/AddNodeMenu";
import { BuilderAiPanel } from "./panels/BuilderAiPanel";
import { RunNowPanel } from "./panels/RunNowPanel";
import { RunResultsPanel } from "./panels/RunResultsPanel";
import { useConfigSlice } from "./state/configSlice";
import { useGraphSlice } from "./state/graphSlice";
import { useRunSlice } from "./state/runSlice";
import { useLatestRunPolling } from "./hooks/useLatestRunPolling";

interface Props {
  workflow: WorkflowDetail;
  triggerProviders: readonly ProviderOption[];
  actionProviders: readonly ProviderOption[];
}

/**
 * Shell that hosts the Slice 1I.2 minimum builder, now composed inside the
 * BUILDER-UI-SHELL-1 layout shell. The new BuilderHeader owns Save +
 * status pill (lifted out of the previous footer row); every other panel
 * stays mounted exactly where it was. Panel relocations land across the
 * later BUILDER-UI-* slices (see docs/slices/phase-4/builder-ui-v1-port-plan.md).
 *
 * Hydration: on mount (and whenever the workflowId prop changes — e.g. user
 * navigates from one workflow to another via the in-app router), the slice
 * is hydrated from the server-fetched WorkflowDetail. On unmount the slice
 * resets so a stale graph never leaks into the next workflow open.
 *
 * Per workflow-state-store.md: the slice is the single source of truth.
 * Components read via selectors and dispatch via slice actions. No fetch
 * here; save() lives in the slice.
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

  // Slice 4.BUILDER-CANVAS-1 — bridge the canvas's empty-state CTA to
  // the existing AddNodeMenu "+ Add trigger" button without lifting
  // AddNodeMenu's local `open` state. The ref + callback get removed in
  // BUILDER-ADD-FLOW-1 when AddNodePanel replaces AddNodeMenu and the
  // canvas wires the panel open directly.
  const addTriggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const handleEmptyAddTrigger = useCallback(() => {
    addTriggerButtonRef.current?.click();
  }, []);

  return (
    <BuilderShell header={<BuilderHeader workflowName={workflow.name} />}>
      <div className="flex flex-col gap-4" aria-label="Workflow builder">
        <AddNodeMenu
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
          triggerButtonRef={addTriggerButtonRef}
        />
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <WorkflowCanvas
              providerLabels={providerLabels}
              onEmptyAddTrigger={handleEmptyAddTrigger}
            />
            <NodeList providerLabels={providerLabels} />
            <RunNowPanel />
            <RunResultsPanel />
            <BuilderAiPanel />
          </div>
          <ConfigModalShell />
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
