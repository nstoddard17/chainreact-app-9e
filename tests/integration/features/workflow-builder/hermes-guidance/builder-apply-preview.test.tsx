/**
 * WorkflowBuilder — explicit "Apply preview" additive patch flow (HERMES-AGENT-APPLY-PREVIEW-PATCH).
 *
 * Drives the real builder: open "Build with me" → submit → "Show on canvas" → "Apply preview".
 * Proves apply is an explicit, user-initiated, ADDITIVE LOCAL-draft edit: blank graphs receive the
 * proposed nodes/edges; existing graphs keep everything and only gain the proposed pieces (a proposed
 * trigger is skipped — no replace); the workflow becomes dirty via the normal mechanism; NOTHING is
 * auto-saved/activated/run; no separate workflow is created; new nodes have EMPTY config (nothing
 * inferred); the overlay clears and a safe confirmation shows; the browser calls only the guidance
 * helper.
 */
const mockRouterRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh, push: jest.fn() }),
}));

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

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return { ...actual, updateWorkflow: (...a: unknown[]) => mockUpdateWorkflow(...a) };
});

const mockRequest = jest.fn();
jest.mock("@/lib/api/ai/guidance", () => ({
  requestWorkflowGuidance: (...a: unknown[]) => mockRequest(...a),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import type { WorkflowDetail } from "@/contracts/workflow";

const triggerProviders = [{ id: "slack", displayName: "Slack" }];
const actionProviders = [{ id: "github", displayName: "GitHub" }];

const workflowPlan = {
  schemaVersion: 1,
  title: "Lead follow-up",
  summary: "Watch then notify.",
  notApplied: true,
  steps: [
    { ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch" },
    { ref: "s1", role: "action", provider: "slack", type: "send_message", purpose: "notify" },
  ],
};
const previewDraft = {
  version: 1,
  title: "Lead follow-up",
  summary: "Watch then notify.",
  notice: "Preview only — your workflow has not changed.",
  notApplied: true,
  nodes: [
    { previewId: "preview-step-1", role: "trigger", provider: "gmail", type: "new_email", label: "gmail:new_email", purpose: "watch", notApplied: true },
    { previewId: "preview-step-2", role: "action", provider: "slack", type: "send_message", label: "slack:send_message", purpose: "notify", notApplied: true },
  ],
  edges: [{ previewId: "preview-edge-1", fromPreviewId: "preview-step-1", toPreviewId: "preview-step-2", notApplied: true }],
};

function workflow(nodes: WorkflowDetail["draftDefinition"]["nodes"], edges: WorkflowDetail["draftDefinition"]["edges"]): WorkflowDetail {
  return {
    id: "wf-1", name: "Test", state: "draft", disabledReason: null, disabledContext: null,
    activeRevisionId: null, draftDefinition: { nodes, edges }, deletedAt: null,
    createdAt: "2026-05-17T00:00:00Z", updatedAt: "2026-05-17T00:00:00Z",
  };
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockRequest.mockReset().mockResolvedValue({ ok: true, guidanceText: "Here's an idea.", source: "hermes-agent", workflowPlan, previewDraft });
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

function renderBuilder(wf: WorkflowDetail) {
  return render(
    <WorkflowBuilder workflow={wf} triggerProviders={triggerProviders} actionProviders={actionProviders} accountId="acct-1" guidanceEnabled />,
  );
}

async function applyPreview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("builder-guidance-toggle"));
  await user.type(screen.getByPlaceholderText(/Example:/i), "follow up with leads");
  await user.click(screen.getByTestId("workflow-guidance-submit"));
  await user.click(await screen.findByTestId("workflow-guidance-show-on-canvas"));
  await user.click(await screen.findByTestId("builder-preview-apply"));
}

describe("builder apply-preview — blank workflow", () => {
  it("adds the proposed trigger+action+edge to the local draft (empty config), dirty, no save", async () => {
    const user = userEvent.setup();
    renderBuilder(workflow([], []));
    await applyPreview(user);

    const s = useGraphSlice.getState();
    expect(s.pendingNodes).toHaveLength(2);
    expect(s.pendingNodes.map((n) => `${n.provider}:${n.type}`)).toEqual(["gmail:new_email", "slack:send_message"]);
    expect(s.pendingEdges).toHaveLength(1);
    expect(s.pendingNodes.every((n) => Object.keys(n.config).length === 0)).toBe(true); // nothing inferred
    expect(s.isDirty).toBe(true); // dirty via the normal mechanism
    expect(mockUpdateWorkflow).not.toHaveBeenCalled(); // no auto-save
  });

  it("clears the overlay and shows the safe confirmation after apply", async () => {
    const user = userEvent.setup();
    renderBuilder(workflow([], []));
    await applyPreview(user);
    await waitFor(() => expect(screen.queryByTestId("builder-preview-overlay")).not.toBeInTheDocument());
    expect(screen.getByTestId("builder-apply-notice")).toHaveTextContent(
      "Preview applied to draft — review required fields before activating.",
    );
  });

  it("calls ONLY the guidance helper (no save/update, no second network call)", async () => {
    const user = userEvent.setup();
    renderBuilder(workflow([], []));
    await applyPreview(user);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

describe("builder apply-preview — existing workflow", () => {
  const existingNodes = [
    { id: "trig", kind: "trigger" as const, provider: "slack", type: "message_received", config: { foo: "bar" }, position: { x: 0, y: 0 } },
    { id: "act", kind: "action" as const, provider: "github", type: "add_comment", config: { repository: "octocat/x" }, position: { x: 0, y: 200 } },
  ];
  const existingEdges = [{ id: "e1", from: "trig", to: "act" }];

  it("keeps ALL existing nodes/edges/config and only ADDS the proposed action (trigger skipped — no replace)", async () => {
    const user = userEvent.setup();
    renderBuilder(workflow(existingNodes, existingEdges));
    await applyPreview(user);

    const s = useGraphSlice.getState();
    // Existing pieces untouched.
    expect(s.pendingNodes.find((n) => n.id === "trig")).toMatchObject({ provider: "slack", type: "message_received", config: { foo: "bar" } });
    expect(s.pendingNodes.find((n) => n.id === "act")).toMatchObject({ config: { repository: "octocat/x" } });
    expect(s.pendingEdges.some((e) => e.id === "e1")).toBe(true);
    // Proposed trigger skipped (already have one); only the action was added.
    expect(s.pendingNodes).toHaveLength(3);
    expect(s.pendingNodes.filter((n) => n.kind === "trigger")).toHaveLength(1);
    expect(s.pendingNodes.some((n) => n.provider === "slack" && n.type === "send_message")).toBe(true);
    expect(s.isDirty).toBe(true);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});
