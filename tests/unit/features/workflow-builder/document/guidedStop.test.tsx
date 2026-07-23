/**
 * Guided Stop + dual-builder round-trip (5.DUAL-BUILDER-1 / CS-2).
 *
 * Proves the Document's first real edits run entirely through the EXISTING
 * configuration system: the real field renderers, the shared configSlice
 * draft, the inspector's exact commit path, shared dirty/undo, and the
 * existing save call — with nothing persisted until the workflow Save.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
  };
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return {
    ...actual,
    EdgeLabelRenderer: ({ children }: { children: unknown }) => children,
  };
});

// Async option resolution goes through the REAL useOptionsSource → this route
// helper; mocking it here proves the Guided Stop uses the existing resolver.
const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
  OptionsApiError: class OptionsApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

const slackSendMessage = {
  key: "slack:send_channel_message",
  provider: "slack",
  type: "send_channel_message",
  displayName: "Send Channel Message",
  description: "Post a message to a Slack channel.",
  category: "messaging",
  requiresIntegration: true,
  displayOrder: 10,
  fields: [
    {
      name: "channel",
      label: "Channel",
      type: "combobox",
      required: true,
      optionsSource: "slack:channels",
    },
    { name: "text", label: "Message", type: "textarea", required: true },
    { name: "botToken", label: "Bot token", type: "text", required: false, sensitivity: "secret" },
  ],
  outputs: [],
};

jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: async () => [],
  listNativeTriggers: async () => [],
  listProviderActions: async (provider: string) =>
    provider === "slack" ? [slackSendMessage] : [],
  listProviderTriggers: async () => [],
  DiscoveryApiError: class DiscoveryApiError extends Error {
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
    {
      id: "t",
      kind: "trigger" as const,
      provider: "hubspot",
      type: "new_contact",
      config: {},
      position: { x: 10, y: 20 },
    },
    {
      id: "a",
      kind: "action" as const,
      provider: "slack",
      type: "send_channel_message",
      config: { text: "Hello team" },
      position: { x: 30, y: 140 },
    },
  ],
  edges: [{ id: "e1", from: "t", to: "a" }],
};

const workflow: WorkflowDetail = {
  id: "wf-cs2",
  name: "CS2",
  state: "draft",
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: definition,
  deletedAt: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

const requiredFieldsByType: RequiredFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", requiredFields: [] },
  "slack:send_channel_message": {
    displayName: "Send Channel Message",
    requiredFields: [
      { name: "channel", label: "Channel" },
      { name: "text", label: "Message" },
    ],
  },
};

const summaryFieldsByType: NodeSummaryFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", fields: [] },
  "slack:send_channel_message": {
    displayName: "Send Channel Message",
    fields: [
      { name: "channel", label: "Channel", type: "combobox", required: true, optionsSource: "slack:channels" },
      { name: "text", label: "Message", type: "textarea", required: true },
    ],
  },
};

const providers = [
  { id: "hubspot", displayName: "HubSpot" },
  { id: "slack", displayName: "Slack" },
];

function renderInDocument() {
  window.localStorage.setItem(__BUILDER_VIEW_PREF_BASE_KEY__, "document");
  const utils = render(
    <WorkflowBuilder
      workflow={workflow}
      triggerProviders={providers}
      actionProviders={providers}
      requiredFieldsByType={requiredFieldsByType}
      summaryFieldsByType={summaryFieldsByType}
      documentBuilderEnabled
    />,
  );
  return utils;
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockUpdateWorkflow.mockResolvedValue({ ...workflow, updatedAt: "2026-07-02T00:00:00Z" });
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockResolvedValue({
    options: [
      { value: "C1", label: "#general" },
      { value: "C2", label: "#sales" },
    ],
  });
  window.localStorage.clear();
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

describe("Guided Stop — opening", () => {
  it("clicking a configured chip opens that field with its current value", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-value-chip-a-Message"));

    const stop = await screen.findByTestId("document-guided-stop");
    expect(stop).toHaveAttribute("data-field-name", "text");
    // The REAL textarea renderer, carrying the current value.
    const textarea = await within(stop).findByDisplayValue("Hello team");
    expect(textarea.tagName).toBe("TEXTAREA");
    // Shared draft was initialized through configSlice (not a private store).
    expect(useConfigSlice.getState().activeNodeId).toBe("a");
    expect(useConfigSlice.getState().drafts["a"]?.values.text).toBe("Hello team");
  });

  it("clicking an unresolved required chip opens that field empty, via the real async resolver", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-blank-chip-a-channel"));

    const stop = await screen.findByTestId("document-guided-stop");
    expect(stop).toHaveAttribute("data-field-name", "channel");
    // The select renderer resolved options through the EXISTING options route
    // helper — no parallel fetch path in the Document.
    await waitFor(() => expect(mockFetchOptionsSource).toHaveBeenCalled());
    expect(mockFetchOptionsSource.mock.calls[0]?.[0]).toBe("slack:channels");
  });

  it("does NOT open the inspector drawer for a Guided-Stop selection", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-value-chip-a-Message"));
    await screen.findByTestId("document-guided-stop");
    expect(screen.queryByTestId("builder-right-drawer")).toBeNull();
  });

  it("a secret field is never editable inline — it hands off to step settings", async () => {
    // Seed a secret value so a chip exists for it.
    act(() => {
      useGraphSlice.getState().hydrate("wf-cs2", {
        ...definition,
        nodes: definition.nodes.map((n) =>
          n.id === "a" ? { ...n, config: { ...n.config, botToken: "xoxb-secret" } } : n,
        ),
      });
    });
    renderInDocument();
    // The summary metadata deliberately omits secret fields, so no chip renders
    // for it — the sensitive value never reaches prose at all.
    expect(screen.queryByTestId("document-value-chip-a-Bot token")).toBeNull();
    expect(screen.getByTestId("document-view").textContent).not.toMatch(/xoxb-secret/);
  });
});

describe("Guided Stop — commit / cancel", () => {
  it("Done commits through the shared path and updates both surfaces without saving", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-value-chip-a-Message"));
    const stop = await screen.findByTestId("document-guided-stop");
    const textarea = await within(stop).findByDisplayValue("Hello team");

    fireEvent.change(textarea, { target: { value: "Updated copy" } });
    fireEvent.click(screen.getByTestId("guided-stop-done"));

    // Canonical graph mutated through updateNodeConfig; workflow dirty.
    await waitFor(() =>
      expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "a")?.config.text).toBe(
        "Updated copy",
      ),
    );
    expect(useGraphSlice.getState().isDirty).toBe(true);
    // Document re-projected immediately.
    expect(screen.getByTestId("document-value-chip-a-Message").textContent).toContain(
      "Updated copy",
    );
    // Nothing persisted.
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
    // Stop closed.
    expect(screen.queryByTestId("document-guided-stop")).toBeNull();
  });

  it("Cancel abandons the input, restores the draft, and leaves the graph untouched", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-value-chip-a-Message"));
    const stop = await screen.findByTestId("document-guided-stop");
    const textarea = await within(stop).findByDisplayValue("Hello team");

    const nodesBefore = useGraphSlice.getState().pendingNodes;
    fireEvent.change(textarea, { target: { value: "throwaway" } });
    fireEvent.click(screen.getByTestId("guided-stop-cancel"));

    await waitFor(() => expect(screen.queryByTestId("document-guided-stop")).toBeNull());
    expect(useGraphSlice.getState().pendingNodes).toBe(nodesBefore);
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(useConfigSlice.getState().drafts["a"]?.values.text).toBe("Hello team");
    expect(screen.getByTestId("document-value-chip-a-Message").textContent).toContain(
      "Hello team",
    );
  });

  it("Escape abandons the same way as Cancel", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-value-chip-a-Message"));
    const stop = await screen.findByTestId("document-guided-stop");
    const textarea = await within(stop).findByDisplayValue("Hello team");
    fireEvent.change(textarea, { target: { value: "nope" } });

    fireEvent.keyDown(stop, { key: "Escape" });

    await waitFor(() => expect(screen.queryByTestId("document-guided-stop")).toBeNull());
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(useConfigSlice.getState().drafts["a"]?.values.text).toBe("Hello team");
  });

  // 5.DUAL-BUILDER-1 CS-7 — focus returns to the originating phrase/chip after
  // the Guided Stop closes, so keyboard + screen-reader users land back where
  // they were (never the page root).
  it("Cancel returns focus to the originating chip", async () => {
    renderInDocument();
    const chip = screen.getByTestId("document-value-chip-a-Message");
    chip.focus();
    fireEvent.click(chip);
    const stop = await screen.findByTestId("document-guided-stop");
    await within(stop).findByDisplayValue("Hello team");

    fireEvent.click(screen.getByTestId("guided-stop-cancel"));
    await waitFor(() => expect(screen.queryByTestId("document-guided-stop")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId("document-value-chip-a-Message")),
    );
  });

  it("Escape returns focus to the originating chip", async () => {
    renderInDocument();
    const chip = screen.getByTestId("document-value-chip-a-Message");
    chip.focus();
    fireEvent.click(chip);
    const stop = await screen.findByTestId("document-guided-stop");

    fireEvent.keyDown(stop, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("document-guided-stop")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId("document-value-chip-a-Message")),
    );
  });

  it("undo spans both surfaces and closes/keeps the stop consistent", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-value-chip-a-Message"));
    const stop = await screen.findByTestId("document-guided-stop");
    fireEvent.change(await within(stop).findByDisplayValue("Hello team"), {
      target: { value: "v2" },
    });
    fireEvent.click(screen.getByTestId("guided-stop-done"));
    await waitFor(() =>
      expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "a")?.config.text).toBe(
        "v2",
      ),
    );

    act(() => {
      const { undoWithConfigSync } = jest.requireActual(
        "@/features/workflow-builder/state/historyNav",
      );
      undoWithConfigSync();
    });

    expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "a")?.config.text).toBe(
      "Hello team",
    );
    expect(screen.getByTestId("document-value-chip-a-Message").textContent).toContain(
      "Hello team",
    );
  });
});

describe("Guided Stop — inspector interop", () => {
  it("Configure step opens the existing inspector on the same node and sees Guided Stop edits", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-value-chip-a-Message"));
    const stop = await screen.findByTestId("document-guided-stop");
    fireEvent.change(await within(stop).findByDisplayValue("Hello team"), {
      target: { value: "from-stop" },
    });
    fireEvent.click(screen.getByTestId("guided-stop-done"));
    await waitFor(() => expect(screen.queryByTestId("document-guided-stop")).toBeNull());

    fireEvent.click(screen.getByTestId("document-configure-step-a"));

    // The real inspector drawer opens on the same node with the committed value.
    const drawer = await screen.findByTestId("builder-right-drawer");
    expect(useConfigSlice.getState().activeNodeId).toBe("a");
    await within(drawer).findByDisplayValue("from-stop");
  });

  it("an inspector edit re-projects into the Document", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-configure-step-a"));
    await screen.findByTestId("builder-right-drawer");

    act(() => {
      useConfigSlice.getState().updateField({ nodeId: "a", name: "text", value: "from-inspector" });
    });
    act(() => {
      const { commitNodeConfigDraft } = jest.requireActual(
        "@/features/workflow-builder/state/commitConfigDraft",
      );
      commitNodeConfigDraft("a");
    });

    expect(screen.getByTestId("document-value-chip-a-Message").textContent).toContain(
      "from-inspector",
    );
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

describe("Document round-trip: edit + add, then save through the existing path", () => {
  it("edits a value, adds a step at the tail, and saves the canonical draft once", async () => {
    renderInDocument();

    // 1) Edit one value through the Guided Stop.
    fireEvent.click(screen.getByTestId("document-value-chip-a-Message"));
    const stop = await screen.findByTestId("document-guided-stop");
    fireEvent.change(await within(stop).findByDisplayValue("Hello team"), {
      target: { value: "Round trip" },
    });
    fireEvent.click(screen.getByTestId("guided-stop-done"));
    await waitFor(() => expect(screen.queryByTestId("document-guided-stop")).toBeNull());

    // 2) Add one normal action at the linear tail: CS-6 "+" opens the Step /
    // Branch / Section / Ask React menu; "Step" opens the shared picker.
    fireEvent.click(screen.getByTestId("document-add-after-a"));
    fireEvent.click(await screen.findByTestId("document-add-after-a-step"));
    const picker = await screen.findByTestId("add-node-panel");
    fireEvent.click(await within(picker).findByText("Slack"));
    fireEvent.click(await within(picker).findByText("Send Channel Message"));

    await waitFor(() => expect(useGraphSlice.getState().pendingNodes).toHaveLength(3));
    const graph = useGraphSlice.getState();
    const added = graph.pendingNodes[2]!;
    // Wired A → New, positions of existing nodes untouched, new one non-overlapping.
    expect(graph.pendingEdges.some((e) => e.from === "a" && e.to === added.id)).toBe(true);
    expect(graph.pendingNodes.find((n) => n.id === "t")?.position).toEqual({ x: 10, y: 20 });
    expect(graph.pendingNodes.find((n) => n.id === "a")?.position).toEqual({ x: 30, y: 140 });
    expect(added.position).not.toEqual({ x: 30, y: 140 });

    // 3) Save through the EXISTING header Save → updateWorkflow path.
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("builder-header-save-button"));

    await waitFor(() => expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1));
    const [savedId, payload] = mockUpdateWorkflow.mock.calls[0]!;
    expect(savedId).toBe("wf-cs2");
    const savedDefinition = (payload as { draftDefinition: typeof definition }).draftDefinition;
    // Canonical shape: same nodes/edges/labels/positions the Visual Builder would send.
    expect(savedDefinition.nodes).toHaveLength(3);
    expect(savedDefinition.nodes.find((n) => n.id === "a")?.config.text).toBe("Round trip");
    expect(savedDefinition.edges.some((e) => e.from === "a" && e.to === added.id)).toBe(true);
    expect(Object.keys(savedDefinition)).toEqual(["nodes", "edges"]);
  });

  it("insert-between rewires A → New → B and preserves the rest of the graph", async () => {
    renderInDocument();

    fireEvent.click(screen.getByTestId("document-insert-after-t"));
    fireEvent.click(await screen.findByTestId("document-insert-after-t-step"));
    const picker = await screen.findByTestId("add-node-panel");
    fireEvent.click(await within(picker).findByText("Slack"));
    fireEvent.click(await within(picker).findByText("Send Channel Message"));

    await waitFor(() => expect(useGraphSlice.getState().pendingNodes).toHaveLength(3));
    const { pendingNodes, pendingEdges } = useGraphSlice.getState();
    const inserted = pendingNodes.find((n) => n.id !== "t" && n.id !== "a")!;
    expect(pendingEdges.some((e) => e.from === "t" && e.to === inserted.id)).toBe(true);
    expect(pendingEdges.some((e) => e.from === inserted.id && e.to === "a")).toBe(true);
    expect(pendingEdges.some((e) => e.from === "t" && e.to === "a")).toBe(false);
    // Existing configs/ids survive.
    expect(pendingNodes.find((n) => n.id === "a")?.config.text).toBe("Hello team");
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});
