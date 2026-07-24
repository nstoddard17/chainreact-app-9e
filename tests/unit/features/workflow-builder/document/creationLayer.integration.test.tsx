/**
 * Document creation layer — integration (5.DUAL-BUILDER-1 / CS-6).
 *
 * Drives the REAL builder: the empty-state (Draft with React + Build manually),
 * the persistent Ask React bar, the Step/Branch/Section/Ask React insertion
 * menu (no Loop; Router only where placement is valid), and safe top-level
 * multi-selection. Every gesture flows through the SHARED graphSlice/config
 * paths and the ONE existing agent conversation — no second workflow, AI route,
 * or save path. Save stays explicit.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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

const slackAction = {
  key: "slack:send_channel_message", provider: "slack", type: "send_channel_message",
  displayName: "Send Channel Message", description: "Post a message.", category: "messaging",
  requiresIntegration: true, displayOrder: 10,
  fields: [{ name: "text", label: "Message", type: "textarea", required: true }], outputs: [],
};
const ifThenMeta = {
  key: "native:if_then_condition", provider: "native", type: "if_then_condition",
  displayName: "If/Then Condition", description: "Split the workflow.", category: "logic",
  requiresIntegration: false, displayOrder: 1, fields: [], outputs: [],
};
const hubspotTrigger = {
  key: "hubspot:new_contact", provider: "hubspot", type: "new_contact",
  displayName: "New Contact", description: "A new contact is created.", category: "crm",
  requiresIntegration: true, displayOrder: 1, fields: [], outputs: [],
};

jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: async () => [ifThenMeta],
  listAiActions: () => Promise.resolve([]),
  listNativeTriggers: async () => [],
  listProviderActions: async (provider: string) => (provider === "slack" ? [slackAction] : []),
  listProviderTriggers: async (provider: string) => (provider === "hubspot" ? [hubspotTrigger] : []),
  DiscoveryApiError: class DiscoveryApiError extends Error { code = "UNKNOWN"; status = 500; },
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

const blank = { nodes: [], edges: [] };
const linear = {
  nodes: [
    { id: "t", kind: "trigger" as const, provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { text: "A" }, position: { x: 0, y: 120 } },
    { id: "b", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { text: "B" }, position: { x: 0, y: 240 } },
  ],
  edges: [
    { id: "e-ta", from: "t", to: "a" },
    { id: "e-ab", from: "a", to: "b" },
  ],
};

const workflow: WorkflowDetail = {
  id: "wf-cs6", name: "CS6", state: "draft", disabledReason: null, disabledContext: null,
  activeRevisionId: null, draftDefinition: blank, deletedAt: null,
  createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z",
};

const requiredFieldsByType: RequiredFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", requiredFields: [] },
  "native:if_then_condition": { displayName: "If/Then Condition", requiredFields: [] },
  "slack:send_channel_message": { displayName: "Send Channel Message", requiredFields: [{ name: "text", label: "Message" }] },
};
const summaryFieldsByType: NodeSummaryFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", fields: [] },
  "native:if_then_condition": { displayName: "If/Then Condition", fields: [] },
  "slack:send_channel_message": { displayName: "Send Channel Message", fields: [{ name: "text", label: "Message", type: "textarea", required: true }] },
};
const providers = [{ id: "hubspot", displayName: "HubSpot" }, { id: "slack", displayName: "Slack" }];

function renderBuilder(draftDefinition: WorkflowDetail["draftDefinition"]) {
  window.localStorage.setItem(__BUILDER_VIEW_PREF_BASE_KEY__, "document");
  return render(
    <WorkflowBuilder
      workflow={{ ...workflow, draftDefinition }}
      triggerProviders={providers}
      actionProviders={providers}
      requiredFieldsByType={requiredFieldsByType}
      summaryFieldsByType={summaryFieldsByType}
      canUseAdvancedBranching
      accountId="acct-1"
      guidanceEnabled
      documentBuilderEnabled
    />,
  );
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockUpdateWorkflow.mockResolvedValue({ ...workflow, updatedAt: "2026-07-02T00:00:00Z" });
  window.localStorage.clear();
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

describe("empty-state creation", () => {
  it("offers Draft with React and Build manually, and there is exactly one agent conversation", () => {
    renderBuilder(blank);
    expect(screen.getByTestId("document-empty-state")).toBeInTheDocument();
    expect(screen.getByText("What should this workflow do?")).toBeInTheDocument();
    expect(screen.getByTestId("document-draft-composer")).toBeInTheDocument();
    expect(screen.getByTestId("document-start-with-trigger")).toBeInTheDocument();
    // DOC-RAIL-LAYOUT-1 — Document mode starts with the Agent rail collapsed
    // (and a never-expanded rail mounts no panel at all), so the Document's
    // own composer is the one visible AI entry. Expanding surfaces the ONE
    // agent state — the left rail — never a second Document conversation.
    expect(screen.getByTestId("builder-left-agent-rail")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    expect(screen.queryAllByTestId("builder-guidance-rail")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("builder-left-agent-rail-expand"));
    expect(screen.getAllByTestId("builder-guidance-rail")).toHaveLength(1);
  });

  it("submitting Draft with React does NOT mutate the graph (proposal is not auto-applied)", () => {
    renderBuilder(blank);
    fireEvent.change(screen.getByTestId("document-draft-composer"), {
      target: { value: "When a new lead arrives, notify sales." },
    });
    fireEvent.click(screen.getByTestId("document-draft-submit"));
    // Seeds the agent only — graph is untouched, not dirty, nothing saved.
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("Build manually → Start with a trigger opens the existing TriggerPicker and adds INTO the same workflow", async () => {
    renderBuilder(blank);
    fireEvent.click(screen.getByTestId("document-start-with-trigger"));
    const picker = await screen.findByTestId("add-node-panel");
    fireEvent.click(await within(picker).findByText("HubSpot"));
    fireEvent.click(await within(picker).findByText("New Contact"));

    await waitFor(() => expect(useGraphSlice.getState().pendingNodes).toHaveLength(1));
    const node = useGraphSlice.getState().pendingNodes[0]!;
    expect(node.kind).toBe("trigger");
    expect(useGraphSlice.getState().isDirty).toBe(true);
    // Same workflow id — no new workflow record was created.
    expect(useGraphSlice.getState().workflowId).toBe("wf-cs6");
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

describe("persistent Ask React bar", () => {
  it("appears on a non-empty Document and submitting seeds without mutating the graph", () => {
    renderBuilder(linear);
    const input = screen.getByTestId("document-ask-react-input");
    expect(input).toBeInTheDocument();
    const before = useGraphSlice.getState().pendingNodes;
    fireEvent.change(input, { target: { value: "Add a follow-up email" } });
    fireEvent.click(screen.getByTestId("document-ask-react-submit"));
    expect(useGraphSlice.getState().pendingNodes).toBe(before);
    expect(useGraphSlice.getState().isDirty).toBe(false);
    // Still ONE agent conversation.
    expect(screen.getAllByTestId("builder-guidance-rail")).toHaveLength(1);
  });
});

describe("insertion menu", () => {
  it("offers Step / Branch / Ask React, NO Loop and NO Section at the tail", () => {
    renderBuilder(linear);
    fireEvent.click(screen.getByTestId("document-add-after-b"));
    const menu = screen.getByTestId("document-add-after-b-menu");
    expect(within(menu).getByTestId("document-add-after-b-step")).toBeInTheDocument();
    expect(within(menu).getByTestId("document-add-after-b-branch")).toBeInTheDocument();
    expect(within(menu).getByTestId("document-add-after-b-askreact")).toBeInTheDocument();
    expect(within(menu).queryByText(/Loop/)).toBeNull();
    // DOC-STEP-CONTROLS-1 — grouping is not an insertion action; it moved to
    // the per-step overflow menu.
    expect(within(menu).queryByTestId("document-add-after-b-section")).toBeNull();
    expect(within(menu).queryByText(/Section/)).toBeNull();
  });

  it("offers Router at a true tail but NOT between two nodes (locked rule)", () => {
    renderBuilder(linear);
    // Tail (after 'b') → Router available.
    fireEvent.click(screen.getByTestId("document-add-after-b"));
    fireEvent.click(screen.getByTestId("document-add-after-b-branch"));
    expect(screen.getByTestId("document-add-after-b-router")).toBeInTheDocument();

    // Between (after 'a', before 'b') → Router omitted with an explanation.
    fireEvent.click(screen.getByTestId("document-insert-after-a"));
    fireEvent.click(screen.getByTestId("document-insert-after-a-branch"));
    expect(screen.queryByTestId("document-insert-after-a-router")).toBeNull();
    expect(screen.getByTestId("document-insert-after-a-router-unavailable")).toBeInTheDocument();
  });

  it("Branch → If/Then creates a fork through the canonical command", async () => {
    renderBuilder(linear);
    fireEvent.click(screen.getByTestId("document-add-after-b"));
    fireEvent.click(screen.getByTestId("document-add-after-b-branch"));
    fireEvent.click(screen.getByTestId("document-add-after-b-ifthen"));
    await waitFor(() => {
      expect(useGraphSlice.getState().pendingNodes.some((n) => n.type === "if_then_condition")).toBe(true);
    });
    expect(useGraphSlice.getState().isDirty).toBe(true);
  });
});

describe("top-level multi-selection", () => {
  // DOC-STEP-CONTROLS-1 — selection is toggled from the step's overflow menu,
  // not from an unlabeled control on the marker rail.
  const selectStep = (nodeId: string) => {
    fireEvent.click(screen.getByTestId(`document-step-menu-${nodeId}`));
    fireEvent.click(screen.getByTestId(`document-select-${nodeId}`));
  };

  it("selecting a step shows the toolbar; Duplicate copies it through the canonical path", async () => {
    renderBuilder(linear);
    selectStep("a");
    expect(screen.getByTestId("document-selection-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("document-selection-count")).toHaveTextContent("1 selected");

    fireEvent.click(screen.getByTestId("document-selection-duplicate"));
    await waitFor(() => expect(useGraphSlice.getState().pendingNodes).toHaveLength(4));
    expect(useGraphSlice.getState().isDirty).toBe(true);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("groups a contiguous top-level selection", async () => {
    renderBuilder(linear);
    selectStep("a");
    selectStep("b");
    expect(screen.getByTestId("document-selection-count")).toHaveTextContent("2 selected");
    fireEvent.click(screen.getByTestId("document-selection-wrap"));
    await waitFor(() => {
      expect(useGraphSlice.getState().pendingPresentation?.sections.length).toBe(1);
    });
  });
});
