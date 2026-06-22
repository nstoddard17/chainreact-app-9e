/**
 * @jest-environment node
 *
 * BUILDER-TOPBAR-UNDO-REDO — undo/redo orchestrators that keep an OPEN config panel in sync with the
 * restored draft graph. Proves: undo/redo run the graph-history step; an open active-node config draft
 * is re-synced (full replace) to the restored config; the panel closes when the active node was removed
 * by the history navigation; nothing touches the save route.
 */
const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return { ...actual, updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args) };
});

import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { undoWithConfigSync, redoWithConfigSync } from "@/features/workflow-builder/state/historyNav";
import type { WorkflowDefinition } from "@/contracts/workflow";

const DEF: WorkflowDefinition = {
  nodes: [{ id: "t1", kind: "trigger", provider: "slack", type: "message_received", config: {}, position: { x: 0, y: 0 } }],
  edges: [],
};

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

describe("historyNav — undo/redo with open-config-panel sync", () => {
  it("undo restores the node config AND the open config panel reflects it (full replace)", () => {
    useGraphSlice.getState().hydrate("wf-1", DEF);
    // Open the config panel for t1 (draft mirrors current config), then make an undoable graph edit.
    useConfigSlice.getState().openNode({ nodeId: "t1", initialValues: {} });
    useGraphSlice.getState().updateNodeConfig("t1", { channel: "C1" });
    // Simulate the rail keeping the open draft in sync with the edit (as the live update path does).
    useConfigSlice.getState().applyExternalConfig({ nodeId: "t1", values: { channel: "C1" } });
    expect(useConfigSlice.getState().drafts.t1!.values).toEqual({ channel: "C1" });

    undoWithConfigSync();

    // Graph reverted…
    expect(useGraphSlice.getState().pendingNodes[0]!.config).toEqual({});
    // …and the OPEN panel draft re-synced to the restored (empty) config — no stale value.
    expect(useConfigSlice.getState().drafts.t1!.values).toEqual({});
    expect(useConfigSlice.getState().drafts.t1!.isDirty).toBe(false);

    redoWithConfigSync();
    expect(useGraphSlice.getState().pendingNodes[0]!.config).toEqual({ channel: "C1" });
    expect(useConfigSlice.getState().drafts.t1!.values).toEqual({ channel: "C1" });
  });

  it("closes the config panel when undo removes the active node", () => {
    useGraphSlice.getState().hydrate("wf-1", DEF);
    const action = useGraphSlice.getState().addAction({ provider: "slack", type: "send_message" });
    useConfigSlice.getState().openNode({ nodeId: action.id, initialValues: {} });
    expect(useConfigSlice.getState().activeNodeId).toBe(action.id);

    undoWithConfigSync(); // removes the just-added action

    expect(useGraphSlice.getState().pendingNodes.some((n) => n.id === action.id)).toBe(false);
    expect(useConfigSlice.getState().activeNodeId).toBeNull(); // panel closed
  });

  it("is a no-op for the panel when no node is active", () => {
    useGraphSlice.getState().hydrate("wf-1", DEF);
    useGraphSlice.getState().updateNodeConfig("t1", { channel: "C1" });
    undoWithConfigSync(); // no active node → just the graph step
    expect(useGraphSlice.getState().pendingNodes[0]!.config).toEqual({});
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
  });

  it("never calls the workflow save route", () => {
    useGraphSlice.getState().hydrate("wf-1", DEF);
    useGraphSlice.getState().updateNodeConfig("t1", { channel: "C1" });
    undoWithConfigSync();
    redoWithConfigSync();
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});
