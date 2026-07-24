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

const mockRequestGuidance = jest.fn();
jest.mock("@/lib/api/ai/guidance", () => ({
  __esModule: true,
  requestWorkflowGuidance: (...a: unknown[]) => mockRequestGuidance(...a),
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

/** DOC-REACT-AGENT-2 — long enough that a referenced sentence sits low in the viewport. */
const longDef = {
  nodes: [
    { id: "t", kind: "trigger" as const, provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    ...Array.from({ length: 11 }, (_, i) => ({
      id: `s${i + 1}`,
      kind: "action" as const,
      provider: "slack",
      type: "send_channel_message",
      config: { channel: "C1", text: `Step ${i + 1} — notify the team about this lead` },
      position: { x: 0, y: 120 * (i + 1) },
    })),
  ],
  edges: [
    { id: "e-t", from: "t", to: "s1" },
    ...Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, from: `s${i + 1}`, to: `s${i + 2}` })),
  ],
};

function renderDocWithAgent(w: WorkflowDetail) {
  window.localStorage.setItem(__BUILDER_VIEW_PREF_BASE_KEY__, "document");
  return render(
    <WorkflowBuilder
      workflow={w}
      triggerProviders={providers}
      actionProviders={providers}
      requiredFieldsByType={requiredFieldsByType}
      summaryFieldsByType={summaryFieldsByType}
      accountId="acct-review"
      guidanceEnabled
      documentBuilderEnabled
    />,
  );
}

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
  mockRequestGuidance.mockReset();
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

/**
 * DOC-REACT-AGENT-2 — the bottom React Agent workspace states, for the browser
 * acceptance pass. Rendered from the REAL builder with only the AI network
 * boundary mocked, then measured in Chromium (dock height cap, internal scroll,
 * clipping, and whether a referenced sentence ends up under the dock).
 */
describe("Document agent workspace states (DOC-REACT-AGENT-2)", () => {
  it("agent dock collapsed over a long workflow", async () => {
    renderDocWithAgent(wf("wf-agent-1", longDef));
    await screen.findByTestId("document-view");
    await screen.findByTestId("document-agent-workspace");
    dump("09-agent-collapsed");
  });

  it("agent dock expanded with a long response", async () => {
    const long = Array.from(
      { length: 14 },
      (_, i) => `Point ${i + 1}: this paragraph explains part of the change in enough detail that the transcript has to scroll inside its own region rather than growing the page.`,
    ).join("\n\n");
    mockRequestGuidance.mockResolvedValue({
      ok: true,
      guidanceText: long,
      workflowPlan: null,
      previewDraft: null,
    });
    renderDocWithAgent(wf("wf-agent-2", longDef));
    await screen.findByTestId("document-view");
    fireEvent.change(screen.getByTestId("document-ask-react-input"), {
      target: { value: "Explain this workflow" },
    });
    fireEvent.click(screen.getByTestId("document-ask-react-submit"));
    await screen.findByText(/Point 14/);
    dump("10-agent-long-response");
  });

  it("agent dock expanded with a multi-step proposal", async () => {
    const proposedDefinition = {
      nodes: longDef.nodes.map((n) =>
        n.id === "s2" || n.id === "s9"
          ? { ...n, config: { ...(n.config as Record<string, unknown>), text: "updated copy" } }
          : n,
      ),
      edges: longDef.edges,
    };
    mockRequestGuidance.mockResolvedValue({
      ok: true,
      guidanceText: "I will update two of the Slack messages.",
      source: "hermes-agent",
      workflowPlan: {
        schemaVersion: 1,
        title: "Proposed change",
        summary: "",
        notApplied: true as const,
        steps: [
          { ref: "t", role: "trigger" as const, provider: "hubspot", type: "new_contact", purpose: "" },
          { ref: "s2", role: "action" as const, provider: "slack", type: "send_channel_message", purpose: "" },
        ],
      },
      previewDraft: {
        title: "Proposed change",
        summary: "Update two steps",
        nodes: [
          { previewId: "t", role: "trigger", provider: "hubspot", type: "new_contact", label: "hubspot:new_contact", purpose: "", notApplied: true },
          { previewId: "s2", role: "action", provider: "slack", type: "send_channel_message", label: "slack:send_channel_message", purpose: "", notApplied: true },
        ],
        edges: [{ previewId: "e1", fromPreviewId: "t", toPreviewId: "s2", notApplied: true }],
        notApplied: true,
      },
      proposedDefinition,
    });
    renderDocWithAgent(wf("wf-agent-3", longDef));
    await screen.findByTestId("document-view");
    fireEvent.change(screen.getByTestId("document-ask-react-input"), {
      target: { value: "shorten steps 2 and 9" },
    });
    fireEvent.click(screen.getByTestId("document-ask-react-submit"));
    await screen.findByTestId("document-agent-changes");
    dump("11-agent-proposal");
  });
});
