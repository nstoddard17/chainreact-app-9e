/**
 * Integration — flag-gated Document view inside WorkflowBuilder
 * (5.DUAL-BUILDER-1 / CS-1).
 *
 * Proves the CS-1 acceptance criteria: flag off = today's builder untouched;
 * flag on = Visual/Document toggle over the SAME graphSlice draft; switching
 * never saves/hydrates/resets/mutates; the Document re-projects store changes
 * immediately; invalid prefs fail safe; complex-region handoff returns to
 * Visual without mutation.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
  };
});

const mockRouterRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh, push: jest.fn() }),
}));

// ReactFlow's EdgeLabelRenderer portal can't initialize in jsdom — passthrough,
// everything else real (same setup as WorkflowBuilder.test.tsx).
jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return {
    ...actual,
    EdgeLabelRenderer: ({ children }: { children: unknown }) => children,
  };
});

jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: async () => [],
  listNativeTriggers: async () => [],
  listProviderActions: async () => [],
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
import { __BUILDER_VIEW_PREF_BASE_KEY__ } from "@/features/workflow-builder/document/documentViewPref";
import type { WorkflowDetail } from "@/contracts/workflow";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";

const linearDefinition = {
  nodes: [
    {
      id: "t",
      kind: "trigger" as const,
      provider: "hubspot",
      type: "new_contact",
      config: {},
      position: { x: 12, y: 34 },
    },
    {
      id: "a",
      kind: "action" as const,
      provider: "slack",
      type: "send_channel_message",
      config: {},
      position: { x: 56, y: 78 },
    },
  ],
  edges: [{ id: "e1", from: "t", to: "a" }],
};

const fanOutDefinition = {
  nodes: [
    ...linearDefinition.nodes,
    {
      id: "b",
      kind: "action" as const,
      provider: "slack",
      type: "send_channel_message",
      config: {},
      position: { x: 0, y: 200 },
    },
    {
      id: "c",
      kind: "action" as const,
      provider: "slack",
      type: "send_channel_message",
      config: {},
      position: { x: 300, y: 200 },
    },
  ],
  edges: [
    { id: "e1", from: "t", to: "a" },
    { id: "e2", from: "a", to: "b" },
    { id: "e3", from: "a", to: "c" },
  ],
};

function workflowWith(definition: WorkflowDetail["draftDefinition"]): WorkflowDetail {
  return {
    id: "wf-doc-1",
    name: "Doc test",
    state: "draft",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: definition,
    deletedAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
}

const requiredFieldsByType: RequiredFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", requiredFields: [] },
  "slack:send_channel_message": {
    displayName: "Send Channel Message",
    requiredFields: [{ name: "text", label: "Message" }],
  },
};

const summaryFieldsByType: NodeSummaryFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", fields: [] },
  "slack:send_channel_message": {
    displayName: "Send Channel Message",
    fields: [{ name: "text", label: "Message", type: "textarea", required: true }],
  },
};

const providers = [
  { id: "hubspot", displayName: "HubSpot" },
  { id: "slack", displayName: "Slack" },
];

function renderBuilder(opts: {
  documentBuilderEnabled?: boolean;
  definition?: WorkflowDetail["draftDefinition"];
}) {
  return render(
    <WorkflowBuilder
      workflow={workflowWith(opts.definition ?? linearDefinition)}
      triggerProviders={providers}
      actionProviders={providers}
      requiredFieldsByType={requiredFieldsByType}
      summaryFieldsByType={summaryFieldsByType}
      {...(opts.documentBuilderEnabled !== undefined
        ? { documentBuilderEnabled: opts.documentBuilderEnabled }
        : {})}
    />,
  );
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  window.localStorage.clear();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

describe("Document view — flag off", () => {
  it("renders today's builder with no toggle and no Document surface", () => {
    renderBuilder({});
    expect(screen.queryByTestId("builder-view-toggle")).toBeNull();
    expect(screen.queryByTestId("document-view")).toBeNull();
    // The canvas surface is mounted as always.
    expect(screen.getByTestId("builder-center-workspace")).toBeInTheDocument();
  });

  it("explicit false behaves like absent", () => {
    renderBuilder({ documentBuilderEnabled: false });
    expect(screen.queryByTestId("builder-view-toggle")).toBeNull();
    expect(screen.queryByTestId("document-view")).toBeNull();
  });

  it("ignores a stored document preference while the flag is off", () => {
    window.localStorage.setItem(__BUILDER_VIEW_PREF_BASE_KEY__, "document");
    renderBuilder({});
    expect(screen.queryByTestId("document-view")).toBeNull();
  });
});

describe("Document view — flag on", () => {
  it("shows the toggle, defaults to Visual, and switches to the Document", () => {
    renderBuilder({ documentBuilderEnabled: true });
    const toggle = screen.getByTestId("builder-view-toggle");
    expect(toggle).toBeInTheDocument();
    expect(screen.getByTestId("builder-view-toggle-visual")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByTestId("document-view")).toBeNull();

    fireEvent.click(screen.getByTestId("builder-view-toggle-document"));
    expect(screen.getByTestId("document-view")).toBeInTheDocument();
    expect(screen.getByTestId("document-sentence-t")).toBeInTheDocument();
    expect(screen.getByTestId("document-sentence-a")).toBeInTheDocument();
    // Read-only: blank chip renders as plain text, not a control.
    expect(screen.getByTestId("document-blank-chip-a-text")).toBeInTheDocument();
    // Preference persisted (device-wide + per-workflow).
    expect(window.localStorage.getItem(__BUILDER_VIEW_PREF_BASE_KEY__)).toBe("document");
  });

  it("honors a stored document preference on mount", () => {
    window.localStorage.setItem(__BUILDER_VIEW_PREF_BASE_KEY__, "document");
    renderBuilder({ documentBuilderEnabled: true });
    expect(screen.getByTestId("document-view")).toBeInTheDocument();
  });

  it("falls back to Visual for invalid stored preferences", () => {
    window.localStorage.setItem(__BUILDER_VIEW_PREF_BASE_KEY__, "bogus");
    renderBuilder({ documentBuilderEnabled: true });
    expect(screen.queryByTestId("document-view")).toBeNull();
    expect(screen.getByTestId("builder-view-toggle-visual")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("switching Visual → Document → Visual preserves ALL pending state untouched", () => {
    renderBuilder({ documentBuilderEnabled: true });

    // Make real local edits first: a graph edit (dirty + undo history) and an
    // open config draft.
    act(() => {
      useGraphSlice.getState().updateNodeConfig("a", { text: "hello" });
      const node = useGraphSlice.getState().pendingNodes.find((n) => n.id === "a")!;
      useConfigSlice.getState().openNode({ nodeId: "a", initialValues: node.config });
      useConfigSlice.getState().updateField({ nodeId: "a", name: "text", value: "draft-edit" });
    });

    const before = useGraphSlice.getState();
    const nodesRef = before.pendingNodes;
    const edgesRef = before.pendingEdges;
    expect(before.isDirty).toBe(true);
    const pastLen = before.past.length;

    fireEvent.click(screen.getByTestId("builder-view-toggle-document"));
    expect(screen.getByTestId("document-view")).toBeInTheDocument();

    // Rendering the Document mutated NOTHING: same references, same dirty,
    // same history, same config draft, same positions.
    const during = useGraphSlice.getState();
    expect(during.pendingNodes).toBe(nodesRef);
    expect(during.pendingEdges).toBe(edgesRef);
    expect(during.isDirty).toBe(true);
    expect(during.past.length).toBe(pastLen);
    expect(useConfigSlice.getState().drafts["a"]?.values.text).toBe("draft-edit");

    fireEvent.click(screen.getByTestId("builder-view-toggle-visual"));
    expect(screen.queryByTestId("document-view")).toBeNull();
    const after = useGraphSlice.getState();
    expect(after.pendingNodes).toBe(nodesRef);
    expect(after.pendingEdges).toBe(edgesRef);
    expect(after.isDirty).toBe(true);
    expect(after.past.length).toBe(pastLen);
    expect(after.pendingNodes.find((n) => n.id === "a")?.position).toEqual({ x: 56, y: 78 });
    expect(useConfigSlice.getState().drafts["a"]?.values.text).toBe("draft-edit");
    // Nothing saved, no server call, no re-hydrate.
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("re-projects graphSlice changes immediately and never marks the graph dirty by rendering", () => {
    renderBuilder({ documentBuilderEnabled: true });
    fireEvent.click(screen.getByTestId("builder-view-toggle-document"));

    // Rendering alone: clean.
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(screen.getByTestId("document-blank-chip-a-text")).toBeInTheDocument();

    // A store change (same action the canvas config panel commits through)
    // appears in the Document with no save/refresh.
    act(() => {
      useGraphSlice.getState().updateNodeConfig("a", { text: "New lead!" });
    });
    expect(screen.queryByTestId("document-blank-chip-a-text")).toBeNull();
    expect(screen.getByTestId("document-value-chip-a-Message")).toBeInTheDocument();
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("complex-region handoff returns to Visual, reveals the node, and mutates nothing", () => {
    renderBuilder({ documentBuilderEnabled: true, definition: fanOutDefinition });
    fireEvent.click(screen.getByTestId("builder-view-toggle-document"));

    const region = screen.getByTestId("document-complex-region");
    expect(region).toHaveAttribute("data-reason", "parallel_fan_out");

    const nodesRef = useGraphSlice.getState().pendingNodes;
    fireEvent.click(screen.getByTestId("document-open-in-visual-b"));

    // Back on the Visual surface; the region's anchor node is revealed via the
    // EXISTING focus API; nothing changed in the graph.
    expect(screen.queryByTestId("document-view")).toBeNull();
    expect(useConfigSlice.getState().activeNodeId).toBe("b");
    expect(useGraphSlice.getState().pendingNodes).toBe(nodesRef);
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});
