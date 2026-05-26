"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";
import { NodeList } from "./canvas/NodeList";
import { WorkflowCanvas } from "./canvas/WorkflowCanvas";
import { BuilderHeader } from "./layout/BuilderHeader";
import { BuilderRightDrawer } from "./layout/BuilderRightDrawer";
import { BuilderShell } from "./layout/BuilderShell";
import {
  AddNodePanel,
  type AddNodePanelMode,
  type ProviderOption,
} from "./panels/AddNodePanel";
import { BuilderAiPanel } from "./panels/BuilderAiPanel";
import { NodeInspectorPanel } from "./panels/NodeInspectorPanel";
import { RunNowPanel } from "./panels/RunNowPanel";
import { RunResultsPanel } from "./panels/RunResultsPanel";
import { useConfigSlice } from "./state/configSlice";
import { useGraphSlice } from "./state/graphSlice";
import { useRunSlice } from "./state/runSlice";
import { useLatestRunPolling } from "./hooks/useLatestRunPolling";
import { useRightDrawer } from "./hooks/useRightDrawer";
import { insertActionAtEdge } from "./utils/insertActionAtEdge";

interface Props {
  workflow: WorkflowDetail;
  triggerProviders: readonly ProviderOption[];
  actionProviders: readonly ProviderOption[];
}

/**
 * Workflow builder root.
 *
 * Slice 4.BUILDER-ADD-FLOW-1 replaces the inline AddNodeMenu toggle UI
 * with a modal AddNodePanel. Entry points:
 *   - The empty-canvas CTA opens it in `trigger` mode.
 *   - A canvas-adjacent "+ Add action" button opens it in `action` mode
 *     once the workflow has a trigger.
 *   - The custom WorkflowEdge's plus-button opens it in `insertAction`
 *     mode with the clicked edge's id.
 *
 * Mid-chain insertion composition (kept here, not in AddNodePanel /
 * graphSlice, so the slice contract stays stable):
 *   1. `addActionFromMeta(meta)` adds the node and auto-creates an
 *      edge from the *current* last node to the new node.
 *   2. That auto-edge is wrong for mid-chain insertion. We find and
 *      remove it.
 *   3. Remove the user-clicked edge (the A→B edge).
 *   4. Connect A→new and new→B so the chain becomes A→new→B.
 *   5. Position the new node at the midpoint of A and B for nicer UX.
 *
 * Other Builder UI surfaces unchanged:
 *   - BUILDER-UI-SHELL-1 BuilderShell + BuilderHeader still own the
 *     page chrome + Save shortcut.
 *   - BUILDER-CANVAS-1 polished canvas + WorkflowNodeCard +
 *     EmptyCanvasState still render. The temporary `triggerButtonRef`
 *     bridge from CANVAS-1 is gone — the empty-state CTA now directly
 *     opens AddNodePanel.
 *   - BUILDER-INSPECTOR-1 right drawer + provider icons still wire as
 *     before.
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

  const handlePickTrigger = useCallback(
    (meta: TriggerMeta) => {
      useGraphSlice.getState().addTriggerFromMeta(meta);
    },
    [],
  );
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

  // Read pendingNodes to decide whether the "+ Add action" affordance
  // is enabled (requires a trigger). Subscribed via selector so a slice
  // change re-renders the button correctly.
  const hasTrigger = useGraphSlice((s) =>
    s.pendingNodes.some((n) => n.kind === "trigger"),
  );

  // Edge plus-click is a stable callback so canvas memoization doesn't
  // thrash. Memoizing on `handleEdgePlusClick` keeps the
  // `workflowEdgesToFlowEdges` memo cache stable across renders that
  // don't touch this callback.
  const memoizedEdgePlusClick = useMemo(
    () => handleEdgePlusClick,
    [handleEdgePlusClick],
  );

  return (
    <BuilderShell header={<BuilderHeader workflowName={workflow.name} />}>
      <div className="flex flex-col gap-4" aria-label="Workflow builder">
        <div className="flex items-center justify-end gap-2" aria-label="Canvas actions">
          <button
            type="button"
            onClick={openActionPicker}
            disabled={!hasTrigger}
            title={!hasTrigger ? "Add a trigger before adding actions." : undefined}
            className="rounded border border-input px-3 py-1.5 text-sm disabled:opacity-60"
          >
            + Add action
          </button>
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <WorkflowCanvas
              providerLabels={providerLabels}
              providerIcons={providerIcons}
              onEmptyAddTrigger={openTriggerPicker}
              onEdgePlusClick={memoizedEdgePlusClick}
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

