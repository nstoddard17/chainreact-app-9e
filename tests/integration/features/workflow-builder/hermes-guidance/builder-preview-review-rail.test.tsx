/**
 * WorkflowBuilder — right-rail "Review changes" config diff for an EDIT preview
 * (HERMES-AGENT-CONFIG-DIFF-REVIEW).
 *
 * Drives the real builder through the React Agent rail with an EDIT proposal (a guidance response that
 * carries a `proposedDefinition`). Proves:
 *   - the right drawer takes over with the value-level review rail while the preview is active (the canvas
 *     keeps its structural diff control bar);
 *   - the rail shows the field-level change (channel #support → #sales);
 *   - "Apply preview" still applies exactly as before (the local draft is replaced with the candidate,
 *     becomes dirty, and NOTHING is auto-saved);
 *   - "Discard" returns to the normal draft (rail gone, graph unchanged, not dirty).
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

const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...a: unknown[]) => mockFetchOptionsSource(...a),
}));

// CHECKPOINTS-1 — the builder mounts the checkpoints hook; mock its typed client so the rail is
// deterministic AND so we can assert that DISCARD never creates a "before agent change" checkpoint.
const mockListCheckpoints = jest.fn();
const mockCreateCheckpoint = jest.fn();
const mockRestoreCheckpoint = jest.fn();
jest.mock("@/lib/api/workflowCheckpoints", () => ({
  __esModule: true,
  listWorkflowCheckpoints: (...a: unknown[]) => mockListCheckpoints(...a),
  createWorkflowCheckpoint: (...a: unknown[]) => mockCreateCheckpoint(...a),
  restoreWorkflowCheckpoint: (...a: unknown[]) => mockRestoreCheckpoint(...a),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import type { WorkflowDetail } from "@/contracts/workflow";

const triggerProviders = [{ id: "native", displayName: "Built-in" }];
const actionProviders = [{ id: "slack", displayName: "Slack" }];

// Existing draft: a manual trigger + a Slack step posting to #support.
const draftNodes = [
  { id: "t1", kind: "trigger" as const, provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } },
  { id: "a1", kind: "action" as const, provider: "slack", type: "send_message", config: { channel: "#support", message: "New ticket" }, position: { x: 0, y: 160 } },
];
const draftEdges = [{ id: "e1", from: "t1", to: "a1" }];

// EDIT proposal: same nodes, but the Slack step now targets #sales.
const proposedDefinition = {
  nodes: [
    { id: "t1", kind: "trigger" as const, provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } },
    { id: "a1", kind: "action" as const, provider: "slack", type: "send_message", config: { channel: "#sales", message: "New ticket" }, position: { x: 0, y: 160 } },
  ],
  edges: [{ id: "e1", from: "t1", to: "a1" }],
};
const previewDraft = {
  version: 1,
  title: "Retarget channel",
  summary: "Send the Slack message to #sales instead of #support.",
  notice: "Preview only — your workflow has not changed.",
  notApplied: true,
  nodes: [
    { previewId: "t1", role: "trigger", provider: "native", type: "manual.run", label: "native:manual.run", purpose: "", notApplied: true },
    { previewId: "a1", role: "action", provider: "slack", type: "send_message", label: "slack:send_message", purpose: "", notApplied: true },
  ],
  edges: [{ previewId: "e1", fromPreviewId: "t1", toPreviewId: "a1", notApplied: true }],
};
const workflowPlan = {
  schemaVersion: 1,
  title: "Retarget channel",
  summary: "",
  notApplied: true,
  steps: [
    { ref: "t1", role: "trigger", provider: "native", type: "manual.run", purpose: "" },
    { ref: "a1", role: "action", provider: "slack", type: "send_message", purpose: "" },
  ],
};
const editResponse = {
  ok: true,
  guidanceText: "I'll send the Slack message to #sales. Review the preview, then Apply if it looks right.",
  source: "hermes-agent",
  workflowPlan,
  previewDraft,
  proposedDefinition,
};

function workflow(): WorkflowDetail {
  return {
    id: "wf-1", name: "Test", state: "draft", disabledReason: null, disabledContext: null,
    activeRevisionId: null, draftDefinition: { nodes: draftNodes, edges: draftEdges }, deletedAt: null,
    createdAt: "2026-05-17T00:00:00Z", updatedAt: "2026-05-17T00:00:00Z",
  } as WorkflowDetail;
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockFetchOptionsSource.mockReset();
  mockRequest.mockReset().mockResolvedValue(editResponse);
  mockListCheckpoints.mockReset().mockResolvedValue([]);
  mockCreateCheckpoint.mockReset().mockResolvedValue({
    id: "cp-new", workflowId: "wf-1", source: "react_agent", name: "Before React Agent change",
    prompt: null, summary: null, createdByUserId: "acct-1", createdAt: "2026-05-17T00:00:00Z",
  });
  mockRestoreCheckpoint.mockReset();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

function renderBuilder() {
  return render(
    <WorkflowBuilder workflow={workflow()} triggerProviders={triggerProviders} actionProviders={actionProviders} accountId="acct-1" guidanceEnabled />,
  );
}

async function proposeEdit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText(/Example:/i), "send to #sales instead");
  await user.click(screen.getByTestId("workflow-guidance-submit"));
}

describe("builder review rail (HERMES-AGENT-CONFIG-DIFF-REVIEW)", () => {
  it("switches the right drawer to 'Review changes' and shows the field-level config diff when a preview is active", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await proposeEdit(user);

    // The canvas keeps its structural diff control bar...
    await screen.findByTestId("builder-preview-control-bar");
    // ...and the right rail takes over with the value-level review panel.
    const panel = await screen.findByTestId("preview-review-panel");
    expect(panel).toHaveTextContent("Send the Slack message to #sales");
    const slackCard = screen.getByTestId("preview-review-node-a1");
    expect(slackCard).toHaveTextContent("#support");
    expect(slackCard).toHaveTextContent("#sales");
  });

  it("shows the deterministic 'Why this change?' rationale in the rail (request echo, changed node, preserved trigger)", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await proposeEdit(user);

    const why = await screen.findByTestId("preview-review-why");
    // 1. What the user asked — echoed verbatim from their prompt.
    expect(why).toHaveTextContent('You asked: "send to #sales instead"');
    // 2. What changed — the Slack step (labels only; the value lives in the config-diff section).
    expect(why).toHaveTextContent("Updated slack:send_message.");
    // 3. What was preserved — the manual trigger the request did not touch.
    expect(why).toHaveTextContent("Kept the native:manual.run trigger.");
  });

  it("surfaces a high-risk field reason for the retargeted channel (label-only, no value leak)", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await proposeEdit(user);

    const reasons = await screen.findByTestId("preview-review-field-reasons");
    // The Slack `channel` field is a recipient/destination — high-risk — so it gets a field reason.
    expect(screen.getByTestId("preview-review-field-reason-a1-channel")).toHaveTextContent(
      "controls where this sends",
    );
    // The reason is label-only: the raw channel values never appear in the field-reasons section.
    expect(reasons).not.toHaveTextContent("#support");
    expect(reasons).not.toHaveTextContent("#sales");
    // The cosmetic `message` body produces no field reason (no noise).
    expect(screen.queryByTestId("preview-review-field-reason-a1-message")).not.toBeInTheDocument();
  });

  it("Apply to draft from the review rail replaces the local draft with the candidate (dirty, nothing saved)", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await proposeEdit(user);
    await screen.findByTestId("preview-review-panel");

    // REACT-AGENT-APPLY-MODES-1 — the rail now exposes the apply-mode picker. The candidate
    // retargets a recipient (Slack channel), so "Apply to draft" requires an explicit confirm.
    await user.click(screen.getByTestId("agent-apply-mode-apply_to_draft"));
    await user.click(await screen.findByTestId("agent-apply-mode-confirm-accept"));

    await waitFor(() => {
      const slack = useGraphSlice.getState().pendingNodes.find((n) => n.id === "a1");
      expect(slack?.config.channel).toBe("#sales");
    });
    expect(useGraphSlice.getState().isDirty).toBe(true);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
    // Preview cleared after apply.
    expect(screen.queryByTestId("preview-review-panel")).not.toBeInTheDocument();
  });

  it("Discard from the review rail returns to the normal draft (unchanged, not dirty)", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await proposeEdit(user);
    await screen.findByTestId("preview-review-panel");

    await user.click(screen.getByTestId("agent-apply-mode-discard"));

    await waitFor(() => expect(screen.queryByTestId("preview-review-panel")).not.toBeInTheDocument());
    const slack = useGraphSlice.getState().pendingNodes.find((n) => n.id === "a1");
    expect(slack?.config.channel).toBe("#support"); // unchanged
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("Discard does NOT create a checkpoint (checkpoints are only for applied changes)", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await proposeEdit(user);
    await screen.findByTestId("preview-review-panel");

    await user.click(screen.getByTestId("agent-apply-mode-discard"));

    await waitFor(() => expect(screen.queryByTestId("preview-review-panel")).not.toBeInTheDocument());
    expect(mockCreateCheckpoint).not.toHaveBeenCalled();
  });
});
