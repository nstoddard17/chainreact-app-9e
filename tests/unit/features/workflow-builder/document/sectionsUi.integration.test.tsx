/**
 * Manual sections — UI + persistence journey (CS-4).
 *
 * Renders the REAL WorkflowBuilder in Document view over the shared graphSlice.
 * Proves wrap/rename/collapse/ungroup drive the canonical presentation block
 * (marking dirty, never mutating nodes/edges), that Finish Setup reveals a field
 * inside a collapsed section, and that sections survive Visual edits + explicit
 * Save + reload. `updateWorkflow` is only ever called by explicit Save.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return { ...actual, updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args) };
});
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }) }));
jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return { ...actual, EdgeLabelRenderer: ({ children }: { children: unknown }) => children };
});
const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
  OptionsApiError: class extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));
const slackSendMessage = {
  key: "slack:send_channel_message",
  provider: "slack",
  type: "send_channel_message",
  displayName: "Send Channel Message",
  description: "Post a message.",
  category: "messaging",
  requiresIntegration: true,
  displayOrder: 10,
  fields: [
    { name: "channel", label: "Channel", type: "combobox", required: true, optionsSource: "slack:channels" },
    { name: "text", label: "Message", type: "textarea", required: true },
  ],
  outputs: [],
};
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: async () => [],
  listAiActions: () => Promise.resolve([]),
  listNativeTriggers: async () => [],
  listProviderActions: async (p: string) => (p === "slack" ? [slackSendMessage] : []),
  listProviderTriggers: async () => [],
  DiscoveryApiError: class extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import { __BUILDER_VIEW_PREF_BASE_KEY__ } from "@/features/workflow-builder/document/documentViewPref";
import type { WorkflowDetail } from "@/contracts/workflow";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";

const definition = {
  nodes: [
    { id: "t", kind: "trigger" as const, provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { channel: "C1" }, position: { x: 0, y: 100 } },
    { id: "b", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { channel: "C1", text: "hi" }, position: { x: 0, y: 200 } },
    { id: "c", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { channel: "C1", text: "hi" }, position: { x: 0, y: 300 } },
  ],
  edges: [
    { id: "e1", from: "t", to: "a" },
    { id: "e2", from: "a", to: "b" },
    { id: "e3", from: "b", to: "c" },
  ],
};
const workflow: WorkflowDetail = {
  id: "wf-sec", name: "Sec", state: "draft", disabledReason: null, disabledContext: null,
  activeRevisionId: null, draftDefinition: definition, deletedAt: null,
  createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z",
};
const requiredFieldsByType: RequiredFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", requiredFields: [] },
  "slack:send_channel_message": { displayName: "Send Channel Message", requiredFields: [{ name: "channel", label: "Channel" }, { name: "text", label: "Message" }] },
};
const summaryFieldsByType: NodeSummaryFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", fields: [] },
  "slack:send_channel_message": { displayName: "Send Channel Message", fields: [{ name: "channel", label: "Channel", type: "combobox", required: true, optionsSource: "slack:channels" }, { name: "text", label: "Message", type: "textarea", required: true }] },
};
const providers = [{ id: "hubspot", displayName: "HubSpot" }, { id: "slack", displayName: "Slack" }];

function renderWith(def: WorkflowDetail["draftDefinition"]) {
  window.localStorage.setItem(__BUILDER_VIEW_PREF_BASE_KEY__, "document");
  return render(
    <WorkflowBuilder
      workflow={{ ...workflow, draftDefinition: def }}
      triggerProviders={providers}
      actionProviders={providers}
      requiredFieldsByType={requiredFieldsByType}
      summaryFieldsByType={summaryFieldsByType}
      documentBuilderEnabled
    />,
  );
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockUpdateWorkflow.mockImplementation(async (_id: string, body: { draftDefinition: unknown }) => ({
    ...workflow,
    draftDefinition: body.draftDefinition,
    updatedAt: "2026-07-02T00:00:00Z",
  }));
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockResolvedValue({ options: [{ value: "C1", label: "#general" }] });
  window.localStorage.clear();
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

const g = () => useGraphSlice.getState();
const sectionId = () => g().pendingPresentation!.sections[0]!.id;

/**
 * DOC-STEP-CONTROLS-1 — grouping moved OUT of the hover-only "＋ Section" rail
 * affordance and INTO the step's always-visible overflow menu. The commands and
 * testids are the same; only the entry point changed.
 */
const stepMenuAction = (nodeId: string, actionTestId: string) => {
  fireEvent.click(screen.getByTestId(`document-step-menu-${nodeId}`));
  fireEvent.click(screen.getByTestId(actionTestId));
};
const groupStep = (nodeId: string) => {
  stepMenuAction(nodeId, `document-wrap-section-${nodeId}`);
  // A new group opens straight into naming; Escape keeps the default name and
  // returns the header to its normal (title-button) state.
  const id = sectionId();
  fireEvent.keyDown(screen.getByTestId(`document-section-title-input-${id}`), { key: "Escape" });
};

describe("section UI", () => {
  it("wrap a block → section created (dirty, nodes untouched); add adjacent block", () => {
    renderWith(definition);
    const nodesRef = g().pendingNodes;
    groupStep("a");
    expect(g().pendingPresentation?.sections[0]!.nodeIds).toEqual(["a"]);
    expect(g().isDirty).toBe(true);
    expect(g().pendingNodes).toBe(nodesRef); // topology untouched
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();

    // Adjacent loose block b can join the section.
    stepMenuAction("b", "document-add-to-section-b");
    expect(g().pendingPresentation?.sections[0]!.nodeIds).toEqual(["a", "b"]);
  });

  it("rename via inline title; Escape restores", () => {
    renderWith(definition);
    groupStep("a");
    const id = sectionId();
    fireEvent.click(screen.getByTestId(`document-section-title-${id}`));
    const input = screen.getByTestId(`document-section-title-input-${id}`);
    fireEvent.change(input, { target: { value: "Qualify & route" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(g().pendingPresentation?.sections[0]!.title).toBe("Qualify & route");

    // Escape restores the previous title.
    fireEvent.click(screen.getByTestId(`document-section-title-${id}`));
    const input2 = screen.getByTestId(`document-section-title-input-${id}`);
    fireEvent.change(input2, { target: { value: "throwaway" } });
    fireEvent.keyDown(input2, { key: "Escape" });
    expect(g().pendingPresentation?.sections[0]!.title).toBe("Qualify & route");
  });

  it("collapse shows a deterministic summary; ungroup keeps steps", () => {
    renderWith(definition);
    groupStep("a");
    const id = sectionId();
    fireEvent.click(screen.getByTestId(`document-section-collapse-${id}`));
    expect(g().pendingPresentation?.sections[0]!.collapsed).toBe(true);
    const summary = screen.getByTestId(`document-section-summary-${id}`);
    expect(summary.textContent).toContain("1 step");
    // section [a] has a missing "text" field → summary notes it.
    expect(summary.textContent).toContain("still needed");

    // Ungroup via the menu — nodes stay put.
    fireEvent.click(screen.getByTestId(`document-section-menu-${id}`));
    fireEvent.click(screen.getByTestId(`document-section-ungroup-${id}`));
    expect(g().pendingPresentation).toBeNull();
    expect(g().pendingNodes.map((n) => n.id)).toEqual(["t", "a", "b", "c"]);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("Finish Setup reveals a field inside a COLLAPSED section", () => {
    renderWith(definition);
    groupStep("a");
    const id = sectionId();
    fireEvent.click(screen.getByTestId(`document-section-collapse-${id}`));
    // Collapsed → the sentence for `a` is not shown.
    expect(screen.queryByTestId("document-sentence-a")).toBeNull();

    // Start Finish Setup → it opens a's text field, auto-revealing the section.
    fireEvent.click(screen.getByTestId("document-finish-setup-button"));
    return screen.findByTestId("document-guided-stop").then((stop) => {
      expect(stop).toHaveAttribute("data-node-id", "a");
      expect(screen.getByTestId("document-sentence-a")).toBeInTheDocument();
    });
  });

  it("rename + collapse survive a Visual ↔ Document builder switch", () => {
    renderWith(definition);
    groupStep("a");
    const id = sectionId();
    g().renameSection(id, "Kept");
    g().setSectionCollapsed(id, true);
    fireEvent.click(screen.getByTestId("builder-view-toggle-visual"));
    fireEvent.click(screen.getByTestId("builder-view-toggle-document"));
    expect(g().pendingPresentation?.sections[0]).toMatchObject({ title: "Kept", collapsed: true });
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

describe("section persistence journey", () => {
  it("wrap · rename · collapse · Visual edit · save · reload preserves everything; ungroup keeps steps", async () => {
    const view = renderWith(definition);

    // 2–4: wrap a, add b, rename, collapse.
    groupStep("a");
    const id = sectionId();
    stepMenuAction("b", "document-add-to-section-b");
    act(() => {
      g().renameSection(id, "Qualify & route");
      g().setSectionCollapsed(id, true);
    });
    expect(g().pendingPresentation!.sections[0]!.nodeIds).toEqual(["a", "b"]);

    // 7: switch to Visual, modify a node config.
    fireEvent.click(screen.getByTestId("builder-view-toggle-visual"));
    act(() => {
      g().updateNodeConfig("a", { channel: "C1", text: "filled in" });
    });
    // Presentation preserved through the config edit.
    expect(g().pendingPresentation!.sections[0]!.nodeIds).toEqual(["a", "b"]);

    // 8: explicit Save → payload carries presentation.
    fireEvent.click(screen.getByTestId("builder-header-save-button"));
    await waitFor(() => expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1));
    const saved = mockUpdateWorkflow.mock.calls[0]![1] as {
      draftDefinition: { presentation?: { sections: { title: string; nodeIds: string[] }[] } };
    };
    expect(saved.draftDefinition.presentation?.sections[0]).toMatchObject({
      title: "Qualify & route",
      nodeIds: ["a", "b"],
    });

    // 9–11: reload (fresh mount with the saved definition) → verify preserved.
    view.unmount();
    useGraphSlice.getState().reset();
    useConfigSlice.getState().reset();
    renderWith(saved.draftDefinition as WorkflowDetail["draftDefinition"]);
    const s = g().pendingPresentation!.sections[0]!;
    expect(s.title).toBe("Qualify & route");
    expect(s.nodeIds).toEqual(["a", "b"]);
    expect(s.collapsed).toBe(true);
    expect(g().pendingNodes.find((n) => n.id === "a")?.config.text).toBe("filled in");
    expect(g().pendingNodes.find((n) => n.id === "a")?.position).toEqual({ x: 0, y: 100 });

    // 12: ungroup → no executable step deleted or moved.
    const id2 = g().pendingPresentation!.sections[0]!.id;
    act(() => {
      g().ungroupSection(id2);
    });
    expect(g().pendingPresentation).toBeNull();
    expect(g().pendingNodes.map((n) => n.id)).toEqual(["t", "a", "b", "c"]);
  });
});
