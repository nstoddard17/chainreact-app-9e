/**
 * 5.DUAL-BUILDER-1 CS-7B — Document visual harness (NOT a behavioural test).
 *
 * Renders the real Document Builder (through WorkflowBuilder, in Document view)
 * for each required visual state and writes the rendered `[data-document-surface]`
 * HTML to owner-review/html/*.html. A sibling Playwright script wraps each HTML
 * with the compiled Tailwind CSS + globals tokens and screenshots it, so the
 * implemented visual states can be captured and compared to the approved mocks
 * WITHOUT a database or auth (the full authenticated journey is separate).
 *
 * It is under tests/tools and is only run via an explicit testMatch, so it never
 * runs in the normal suite. It asserts only that each state produced markup.
 */
import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return { ...actual, updateWorkflow: (...a: unknown[]) => mockUpdateWorkflow(...a) };
});
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }) }));
jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return { ...actual, EdgeLabelRenderer: ({ children }: { children: unknown }) => children };
});
const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...a: unknown[]) => mockFetchOptionsSource(...a),
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

const OUT = join(process.cwd(), "owner-review", "html");

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

function wf(id: string, def: unknown): WorkflowDetail {
  return {
    id,
    name: "Welcome & route new leads",
    state: "draft",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: def as WorkflowDetail["draftDefinition"],
    deletedAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
}

const linearDef = {
  nodes: [
    { id: "t", kind: "trigger" as const, provider: "hubspot", type: "new_contact", config: {}, position: { x: 10, y: 20 } },
    { id: "a", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { text: "New lead: {{first name}} from {{company}}" }, position: { x: 30, y: 140 } },
    { id: "b", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { text: "Follow up in 2 days" }, position: { x: 30, y: 260 } },
  ],
  edges: [{ id: "e1", from: "t", to: "a" }, { id: "e2", from: "a", to: "b" }],
};

const branchDef = {
  nodes: [
    { id: "t", kind: "trigger" as const, provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "if1", kind: "action" as const, provider: "native", type: "if_then_condition", config: { input: "{{deal.amount}}", operator: "greater_than", value: "10000", onFalse: "branch" }, position: { x: 0, y: 160 } },
    { id: "y", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { text: "Big deal!" }, position: { x: -160, y: 320 } },
    { id: "n", kind: "action" as const, provider: "slack", type: "send_channel_message", config: {}, position: { x: 160, y: 320 } },
    { id: "s", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { text: "Tag them" }, position: { x: 0, y: 480 } },
  ],
  edges: [
    { id: "e1", from: "t", to: "if1" },
    { id: "e2", from: "if1", to: "y", label: "true" },
    { id: "e3", from: "if1", to: "n", label: "false" },
    { id: "e4", from: "y", to: "s" },
    { id: "e5", from: "n", to: "s" },
  ],
};

const sectionsDef = {
  ...linearDef,
  presentation: {
    version: 1 as const,
    sections: [{ id: "sec1", title: "Notify the team", nodeIds: ["a", "b"], collapsed: false }],
  },
};

function renderDoc(w: WorkflowDetail) {
  window.localStorage.setItem(__BUILDER_VIEW_PREF_BASE_KEY__, "document");
  return render(
    <WorkflowBuilder
      workflow={w}
      triggerProviders={providers}
      actionProviders={providers}
      requiredFieldsByType={requiredFieldsByType}
      summaryFieldsByType={summaryFieldsByType}
      documentBuilderEnabled
    />,
  );
}

function dump(name: string) {
  const el = document.querySelector('[data-document-surface]');
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.html`), el ? (el as HTMLElement).outerHTML : "<!-- no document surface -->", "utf8");
  expect(el).not.toBeNull();
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset().mockResolvedValue({ updatedAt: "2026-07-02T00:00:00Z" });
  mockFetchOptionsSource.mockReset().mockResolvedValue({ options: [{ value: "C1", label: "#general" }, { value: "C2", label: "#sales" }] });
  window.localStorage.clear();
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

describe("Document visual harness (writes owner-review/html/*.html)", () => {
  it("empty workflow", async () => {
    renderDoc(wf("wf-empty", { nodes: [], edges: [] }));
    await screen.findByTestId("document-empty-state");
    dump("01-empty");
  });

  it("linear workflow", async () => {
    renderDoc(wf("wf-linear", linearDef));
    await screen.findByTestId("document-view");
    await waitFor(() => expect(screen.getByTestId("document-title")).toBeInTheDocument());
    dump("02-linear");
  });

  it("guided stop open", async () => {
    renderDoc(wf("wf-linear2", linearDef));
    await screen.findByTestId("document-view");
    fireEvent.click(screen.getByTestId("document-blank-chip-a-channel"));
    await screen.findByTestId("document-guided-stop");
    dump("03-guided-stop");
  });

  it("branch workflow", async () => {
    renderDoc(wf("wf-branch", branchDef));
    await screen.findByTestId("document-view");
    await act(async () => { await Promise.resolve(); });
    dump("04-branch");
  });

  it("sections", async () => {
    renderDoc(wf("wf-sections", sectionsDef));
    await screen.findByTestId("document-view");
    dump("05-sections");
  });

  it("insertion menu open", async () => {
    renderDoc(wf("wf-linear3", linearDef));
    await screen.findByTestId("document-view");
    // Open the tail "+" menu on the last step (step b).
    const trigger = document.querySelector('[data-testid="document-add-after-b"]');
    if (trigger) fireEvent.click(trigger);
    await act(async () => { await Promise.resolve(); });
    dump("06-insertion-menu");
  });

  it("finish setup queue", async () => {
    renderDoc(wf("wf-linear4", linearDef));
    await screen.findByTestId("document-view");
    fireEvent.click(screen.getByTestId("document-finish-setup-button"));
    await screen.findByTestId("document-guided-stop");
    dump("07-finish-setup");
  });

  it("whole workflow map", async () => {
    renderDoc(wf("wf-linear5", linearDef));
    await screen.findByTestId("document-view");
    fireEvent.click(screen.getByTestId("document-open-map-button"));
    await act(async () => { await Promise.resolve(); });
    dump("08-map");
  });
});
