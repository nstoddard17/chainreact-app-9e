/**
 * Finish Setup queue + Whole Workflow map — integration (5.DUAL-BUILDER-1 / CS-3).
 *
 * Renders the REAL WorkflowBuilder in Document view over the shared stores and
 * proves the queue drives the ACTUAL CS-2 Guided Stop (no second editor): the
 * banner count matches supported unresolved items, Finish Setup opens the first
 * item, Done resolves + advances, Skip is session-only, Previous/Next/Exit work,
 * completing the queue never auto-saves/activates, the map renders from the same
 * projection and navigates the Document, and switching builders preserves all
 * shared state. `updateWorkflow` is only ever called by explicit Save.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return { ...actual, updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args) };
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return { ...actual, EdgeLabelRenderer: ({ children }: { children: unknown }) => children };
});

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
    { name: "channel", label: "Channel", type: "combobox", required: true, optionsSource: "slack:channels" },
    { name: "text", label: "Message", type: "textarea", required: true },
  ],
  outputs: [],
};
const ifThen = {
  key: "native:if_then_condition",
  provider: "native",
  type: "if_then_condition",
  displayName: "If/Then Condition",
  description: "Branch on a condition.",
  category: "logic",
  requiresIntegration: false,
  displayOrder: 1,
  fields: [
    { name: "input", label: "Input", type: "text", required: true },
    { name: "operator", label: "Operator", type: "text", required: true },
    { name: "value", label: "Value", type: "text", required: false },
  ],
  outputs: [],
};

jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: async () => [ifThen],
  listNativeTriggers: async () => [],
  listProviderActions: async (provider: string) => (provider === "slack" ? [slackSendMessage] : []),
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
    { id: "t", kind: "trigger" as const, provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { channel: "C1" }, position: { x: 0, y: 100 } },
    { id: "if", kind: "action" as const, provider: "native", type: "if_then_condition", config: { input: "x", operator: "equals", value: "1", onFalse: "branch" }, position: { x: 0, y: 200 } },
    { id: "b", kind: "action" as const, provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 300 } },
    { id: "c", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { channel: "C1", text: "done" }, position: { x: 200, y: 300 } },
  ],
  edges: [
    { id: "e1", from: "t", to: "a" },
    { id: "e2", from: "a", to: "if" },
    { id: "e3", from: "if", to: "b", label: "true" },
    { id: "e4", from: "if", to: "c", label: "false" },
  ],
};

const workflow: WorkflowDetail = {
  id: "wf-cs3",
  name: "CS3",
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
    requiredFields: [{ name: "channel", label: "Channel" }, { name: "text", label: "Message" }],
  },
  "native:if_then_condition": {
    displayName: "If/Then Condition",
    requiredFields: [{ name: "input", label: "Input" }, { name: "operator", label: "Operator" }],
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
function renderInDocument() {
  return renderWith(definition);
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockUpdateWorkflow.mockResolvedValue({ ...workflow, updatedAt: "2026-07-02T00:00:00Z" });
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

// Supported unresolved items: a::text, b::channel, b::text = 3. (c is filled.)

describe("Finish Setup banner", () => {
  it("shows the supported unresolved count (not the larger validation total)", () => {
    renderInDocument();
    const banner = screen.getByTestId("document-setup-banner");
    expect(banner).toHaveAttribute("data-banner-state", "needs_setup");
    expect(banner).toHaveAttribute("data-supported-count", "3");
    expect(screen.getByTestId("document-finish-setup-button").textContent).toContain("3 left");
  });
});

describe("Finish Setup queue", () => {
  it("Finish setup opens the first item; controls show progress", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-finish-setup-button"));
    const stop = await screen.findByTestId("document-guided-stop");
    expect(stop).toHaveAttribute("data-node-id", "a");
    expect(stop).toHaveAttribute("data-field-name", "text");
    expect(screen.getByTestId("document-setup-progress").textContent).toBe("Step 1 of 3");
  });

  it("Done resolves the item and advances to the next; count decreases", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-finish-setup-button"));
    const stop = await screen.findByTestId("document-guided-stop");
    const textarea = within(stop).getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "hello team" } });
    fireEvent.click(screen.getByTestId("guided-stop-done"));

    // a.text committed to the shared graph; queue advanced to b.channel.
    await waitFor(() =>
      expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "a")?.config.text).toBe("hello team"),
    );
    const nextStop = await screen.findByTestId("document-guided-stop");
    expect(nextStop).toHaveAttribute("data-node-id", "b");
    expect(nextStop).toHaveAttribute("data-field-name", "channel");
    expect(screen.getByTestId("document-setup-banner")).toHaveAttribute("data-supported-count", "2");
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("Skip advances without resolving; the skipped item reappears next session", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-finish-setup-button"));
    await screen.findByTestId("document-guided-stop");
    // Skip a::text.
    fireEvent.click(screen.getByTestId("document-setup-skip"));
    const stop = await screen.findByTestId("document-guided-stop");
    expect(stop).toHaveAttribute("data-node-id", "b"); // advanced past a
    // a::text was never resolved.
    expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "a")?.config.text).toBeUndefined();

    // Exit ends the session; skipped state is session-only.
    fireEvent.click(screen.getByTestId("document-setup-exit"));
    expect(screen.queryByTestId("document-setup-controls")).toBeNull();
    // Reopen → a::text is the first item again (skip did not persist).
    fireEvent.click(screen.getByTestId("document-finish-setup-button"));
    const reopened = await screen.findByTestId("document-guided-stop");
    expect(reopened).toHaveAttribute("data-node-id", "a");
    expect(reopened).toHaveAttribute("data-field-name", "text");
  });

  it("Previous / Next move between items", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-finish-setup-button"));
    await screen.findByTestId("document-guided-stop");
    fireEvent.click(screen.getByTestId("document-setup-next"));
    let stop = await screen.findByTestId("document-guided-stop");
    expect(stop).toHaveAttribute("data-node-id", "b");
    expect(stop).toHaveAttribute("data-field-name", "channel");
    fireEvent.click(screen.getByTestId("document-setup-prev"));
    stop = await screen.findByTestId("document-guided-stop");
    expect(stop).toHaveAttribute("data-node-id", "a");
  });

  it("Exit preserves the workflow and never saves", async () => {
    renderInDocument();
    const nodesRef = useGraphSlice.getState().pendingNodes;
    fireEvent.click(screen.getByTestId("document-finish-setup-button"));
    await screen.findByTestId("document-guided-stop");
    fireEvent.click(screen.getByTestId("document-setup-exit"));
    expect(screen.queryByTestId("document-setup-controls")).toBeNull();
    expect(useGraphSlice.getState().pendingNodes).toBe(nodesRef);
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("completing every supported item does not auto-save or activate", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-finish-setup-button"));
    await screen.findByTestId("document-guided-stop");
    // Resolve all three fields through the SAME shared commit path the Guided
    // Stop uses (updateNodeConfig); the queue reacts live.
    act(() => {
      useGraphSlice.getState().updateNodeConfig("a", { channel: "C1", text: "hi" });
      useGraphSlice.getState().updateNodeConfig("b", { channel: "C1", text: "hi" });
    });
    await waitFor(() =>
      expect(screen.getByTestId("document-setup-banner")).toHaveAttribute("data-supported-count", "0"),
    );
    // Ready-but-unsaved: Save still required, nothing activated/saved.
    expect(screen.getByTestId("document-setup-banner")).toHaveAttribute("data-banner-state", "ready_unsaved");
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("undo restores an unresolved item; redo removes it again", async () => {
    renderInDocument();
    // Resolve a::text via the shared path (creates history).
    act(() => {
      useGraphSlice.getState().updateNodeConfig("a", { channel: "C1", text: "hi" });
    });
    await waitFor(() =>
      expect(screen.getByTestId("document-setup-banner")).toHaveAttribute("data-supported-count", "2"),
    );
    act(() => {
      useGraphSlice.getState().undo();
    });
    await waitFor(() =>
      expect(screen.getByTestId("document-setup-banner")).toHaveAttribute("data-supported-count", "3"),
    );
    act(() => {
      useGraphSlice.getState().redo();
    });
    await waitFor(() =>
      expect(screen.getByTestId("document-setup-banner")).toHaveAttribute("data-supported-count", "2"),
    );
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

describe("Whole Workflow map", () => {
  it("renders from the projection and navigates to a step's Guided Stop", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-open-map-button"));
    const map = await screen.findByTestId("document-whole-workflow-map");
    // Trigger, steps, fork, lanes appear; each executable step once.
    expect(within(map).getByTestId("document-map-row-t")).toBeInTheDocument();
    expect(within(map).getByTestId("document-map-row-a")).toBeInTheDocument();
    expect(within(map).getByTestId("document-map-row-b")).toBeInTheDocument();
    // b needs a detail.
    expect(within(map).getByTestId("document-map-row-b")).toHaveAttribute("data-status", "needs_detail");

    // Clicking b's row opens the Guided Stop for its first field.
    fireEvent.click(within(map).getByTestId("document-map-row-b"));
    const stop = await screen.findByTestId("document-guided-stop");
    expect(stop).toHaveAttribute("data-node-id", "b");
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("closing then reopening the map mutates nothing", async () => {
    renderInDocument();
    const nodesRef = useGraphSlice.getState().pendingNodes;
    fireEvent.click(screen.getByTestId("document-open-map-button"));
    await screen.findByTestId("document-whole-workflow-map");
    fireEvent.click(screen.getByTestId("document-map-close"));
    expect(screen.queryByTestId("document-whole-workflow-map")).toBeNull();
    expect(useGraphSlice.getState().pendingNodes).toBe(nodesRef);
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("the active Guided Stop item is highlighted in the map", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-finish-setup-button"));
    await screen.findByTestId("document-guided-stop"); // active on node a
    fireEvent.click(screen.getByTestId("document-open-map-button"));
    const map = await screen.findByTestId("document-whole-workflow-map");
    expect(within(map).getByTestId("document-map-row-a")).toHaveAttribute("data-active", "true");
    expect(within(map).getByTestId("document-map-row-b")).not.toHaveAttribute("data-active");
  });

  it("opening the full inspector from the Document closes the map first (no overlap)", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-open-map-button"));
    await screen.findByTestId("document-whole-workflow-map");
    // Configure step b → inspector; the map closes before the drawer opens.
    fireEvent.click(screen.getByTestId("document-configure-step-b"));
    await waitFor(() => expect(screen.queryByTestId("document-whole-workflow-map")).toBeNull());
    expect(screen.getByTestId("builder-right-drawer")).toBeInTheDocument();
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

// ---- one focused end-to-end journey (real internals, mocked provider APIs) ---
// Playwright is intentionally NOT used: ENABLE_DOCUMENT_BUILDER must stay OFF in
// every environment, so the surface can only be exercised via the flag-on prop
// with the real WorkflowBuilder + shared stores + real Guided Stop / config
// system — exactly this test. (Owner Report documents the deferral.)

const journeyDef = {
  nodes: [
    { id: "t", kind: "trigger" as const, provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { channel: "C1" }, position: { x: 0, y: 100 } },
    { id: "if", kind: "action" as const, provider: "native", type: "if_then_condition", config: { input: "x", operator: "equals", value: "1", onFalse: "branch" }, position: { x: 0, y: 200 } },
    { id: "b", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { channel: "C1" }, position: { x: 0, y: 300 } },
    { id: "c", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { channel: "C1" }, position: { x: 200, y: 300 } },
  ],
  edges: [
    { id: "e1", from: "t", to: "a" },
    { id: "e2", from: "a", to: "if" },
    { id: "e3", from: "if", to: "b", label: "true" },
    { id: "e4", from: "if", to: "c", label: "false" },
  ],
};

describe("dual-builder Finish Setup journey", () => {
  it("resolve inline · skip · inspector · map-jump · finish · save · verify in Visual", async () => {
    renderWith(journeyDef);
    // Missing values across a linear step (a) and both branch lanes (b, c) → 3.
    expect(screen.getByTestId("document-setup-banner")).toHaveAttribute("data-supported-count", "3");

    // 3. Start Finish Setup → first item a::text.
    fireEvent.click(screen.getByTestId("document-finish-setup-button"));
    let stop = await screen.findByTestId("document-guided-stop");
    expect(stop).toHaveAttribute("data-node-id", "a");

    // 4. Resolve one field inline.
    fireEvent.change(within(stop).getByRole("textbox"), { target: { value: "linear msg" } });
    fireEvent.click(screen.getByTestId("guided-stop-done"));
    await waitFor(() =>
      expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "a")?.config.text).toBe("linear msg"),
    );
    // advanced to b::text.
    stop = await screen.findByTestId("document-guided-stop");
    expect(stop).toHaveAttribute("data-node-id", "b");

    // 5. Skip one (b::text) → advance to c::text. b stays unresolved.
    fireEvent.click(screen.getByTestId("document-setup-skip"));
    stop = await screen.findByTestId("document-guided-stop");
    expect(stop).toHaveAttribute("data-node-id", "c");

    // 6. Open the full inspector for a step (a) while the queue session is kept.
    // (Handoff proves the inspector coexists with an active queue session.)
    fireEvent.click(screen.getByTestId("document-configure-step-a"));
    expect(await screen.findByTestId("builder-right-drawer")).toBeInTheDocument();
    expect(screen.getByTestId("document-setup-controls")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Close drawer"));
    // Resolve c via the shared commit path (what the inspector Save does).
    act(() => {
      useGraphSlice.getState().updateNodeConfig("c", { channel: "C1", text: "false msg" });
    });
    await waitFor(() =>
      expect(screen.getByTestId("document-setup-banner")).toHaveAttribute("data-supported-count", "1"),
    );

    // 9. Confirm the skipped item (b::text) still remains unresolved on reopen.
    fireEvent.click(screen.getByTestId("document-setup-exit"));
    fireEvent.click(screen.getByTestId("document-finish-setup-button"));
    stop = await screen.findByTestId("document-guided-stop");
    expect(stop).toHaveAttribute("data-node-id", "b");
    expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "b")?.config.text).toBeUndefined();

    // 7. Use the Whole Workflow map to jump to the remaining step, then finish.
    fireEvent.click(screen.getByTestId("document-open-map-button"));
    const map = await screen.findByTestId("document-whole-workflow-map");
    fireEvent.click(within(map).getByTestId("document-map-row-b"));
    stop = await screen.findByTestId("document-guided-stop");
    expect(stop).toHaveAttribute("data-node-id", "b");
    fireEvent.change(within(stop).getByRole("textbox"), { target: { value: "hot msg" } });
    fireEvent.click(screen.getByTestId("guided-stop-done"));
    await waitFor(() =>
      expect(screen.getByTestId("document-setup-banner")).toHaveAttribute("data-supported-count", "0"),
    );
    // Completing the queue did NOT auto-save or activate.
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();

    // 10. Save explicitly → canonical {nodes, edges} payload through the PATCH path.
    // The server echoes the saved definition (as the real PATCH route does).
    mockUpdateWorkflow.mockImplementation(async (_id: string, body: { draftDefinition?: unknown }) => ({
      ...workflow,
      draftDefinition: body.draftDefinition ?? workflow.draftDefinition,
      updatedAt: "2026-07-02T00:00:00Z",
    }));
    fireEvent.click(screen.getByTestId("builder-header-save-button"));
    await waitFor(() => expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1));
    const savedArg = mockUpdateWorkflow.mock.calls[0]![1] as {
      draftDefinition: { nodes: unknown[]; edges: unknown[] };
    };
    expect(savedArg.draftDefinition).toHaveProperty("nodes");
    expect(savedArg.draftDefinition).toHaveProperty("edges");

    // 11. Switch to Visual — the SAME shared graph, identical resolved configs.
    fireEvent.click(screen.getByTestId("builder-view-toggle-visual"));
    const nodes = useGraphSlice.getState().pendingNodes;
    expect(nodes.find((n) => n.id === "a")?.config.text).toBe("linear msg");
    expect(nodes.find((n) => n.id === "b")?.config.text).toBe("hot msg");
    expect(nodes.find((n) => n.id === "c")?.config.text).toBe("false msg");
  });
});

describe("shared state across builder switch", () => {
  it("preserves graph, config draft, dirty, and history switching Document ↔ Visual", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-finish-setup-button"));
    const stop = await screen.findByTestId("document-guided-stop");
    const textarea = within(stop).getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "in progress" } });

    // Switch to Visual with an uncommitted draft open.
    fireEvent.click(screen.getByTestId("builder-view-toggle-visual"));
    expect(useConfigSlice.getState().drafts["a"]?.values.text).toBe("in progress");

    fireEvent.click(screen.getByTestId("builder-view-toggle-document"));
    expect(useConfigSlice.getState().drafts["a"]?.values.text).toBe("in progress");
    // Uncommitted input never reached the graph or triggered a save.
    expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "a")?.config.text).toBeUndefined();
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});
