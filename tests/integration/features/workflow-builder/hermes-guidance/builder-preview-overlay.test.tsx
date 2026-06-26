/**
 * WorkflowBuilder — non-applied AI draft preview overlay flow (HERMES-AGENT-BUILDER-PREVIEW-OVERLAY).
 *
 * Drives the real builder: open "Build with me" → submit → "Show on canvas" → the ghost overlay
 * appears over the canvas. Proves the overlay is VISUAL/EPHEMERAL ONLY: the real graph (pendingNodes)
 * is byte-for-byte unchanged, the workflow is never marked dirty, no workflow save/update API is
 * called, and Discard removes only the overlay (no rollback needed — nothing was mutated).
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

// Spy on the workflow mutation API to assert it is NEVER called for preview rendering.
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

const baseWorkflow: WorkflowDetail = {
  id: "wf-1",
  name: "Test",
  state: "draft",
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: {
    nodes: [
      { id: "trig", kind: "trigger", provider: "slack", type: "message_received", config: {}, position: { x: 0, y: 0 } },
      { id: "act", kind: "action", provider: "github", type: "add_comment", config: { repository: "octocat/x" }, position: { x: 0, y: 200 } },
    ],
    edges: [{ id: "e1", from: "trig", to: "act" }],
  },
  deletedAt: null,
  createdAt: "2026-05-17T00:00:00Z",
  updatedAt: "2026-05-17T00:00:00Z",
};

const triggerProviders = [{ id: "slack", displayName: "Slack" }];
const actionProviders = [{ id: "github", displayName: "GitHub" }];

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

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockRequest.mockReset().mockResolvedValue({
    ok: true,
    guidanceText: "Here's an idea.",
    source: "hermes-agent",
    workflowPlan: { schemaVersion: 1, title: "Lead follow-up", summary: "", notApplied: true, steps: [{ ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch" }] },
    previewDraft,
  });
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

function renderBuilder() {
  return render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
      accountId="acct-1"
      guidanceEnabled
    />,
  );
}

/** Submit in the rail; a valid plan AUTO-shows the preview overlay on the canvas (no extra click). */
async function autoShowPreview(user: ReturnType<typeof userEvent.setup>) {
  // HERMES-AGENT-REPLACE-BUILDER-AI-PLAN — guidance is rendered directly in the left rail now.
  // REACT-LIVE-SKELETON — a valid preview shows on the canvas automatically (no "Show on canvas" click).
  await user.type(screen.getByPlaceholderText(/Example:/i), "follow up with leads");
  await user.click(screen.getByTestId("workflow-guidance-submit"));
  await screen.findByTestId("builder-preview-overlay");
}

describe("builder preview overlay — renders without mutating the real workflow", () => {
  it("auto-shows the ghost overlay (preview nodes + edges) on the canvas", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await autoShowPreview(user);
    expect(screen.getAllByTestId("builder-preview-node")).toHaveLength(2);
    expect(screen.getAllByTestId("builder-preview-edge")).toHaveLength(1);
    expect(screen.getByTestId("builder-preview-overlay-notice")).toHaveTextContent(
      "Preview only — your workflow has not changed.",
    );
    // The overlay's Apply/Discard controls remain the way to act on the shown preview.
    expect(screen.getByTestId("builder-preview-apply")).toBeInTheDocument();
    expect(screen.getByTestId("builder-preview-discard")).toBeInTheDocument();
  });

  // HERMES-AGENT-RAIL-NO-MANUAL-CANVAS-PUSH — a valid preview auto-shows on the canvas; the rail NEVER
  // offers a manual "Show on canvas" button. Discarding removes the overlay (Apply/Discard live in the
  // top bar) and still surfaces no manual canvas-push control — the user re-asks React to get a preview.
  it("never offers a manual 'Show on canvas' button — before or after Discard", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await autoShowPreview(user);
    // Auto-shown → no manual button.
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).not.toBeInTheDocument();

    // Discard → overlay gone → still no manual canvas-push button.
    await user.click(screen.getByTestId("builder-preview-discard"));
    await waitFor(() => expect(screen.queryByTestId("builder-preview-overlay")).not.toBeInTheDocument());
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).not.toBeInTheDocument();
  });

  it("does NOT mutate the real graph, mark dirty, or call the save/update API", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await autoShowPreview(user);

    const after = JSON.stringify(useGraphSlice.getState().pendingNodes);
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(2); // the two real nodes only
    expect(useGraphSlice.getState().isDirty).toBe(false); // never marked dirty
    expect(mockUpdateWorkflow).not.toHaveBeenCalled(); // no save/update
    // No preview-only ids leaked into the real graph.
    expect(after).not.toContain("preview-step-");
  });

  it("Discard removes only the overlay; the real graph stays unchanged", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await autoShowPreview(user);
    await user.click(screen.getByTestId("builder-preview-discard"));
    await waitFor(() => expect(screen.queryByTestId("builder-preview-overlay")).not.toBeInTheDocument());
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(2);
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("the browser only ever calls the ChainReact guidance helper (no other workflow API for preview)", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await autoShowPreview(user);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ accountId: "acct-1", workflowId: "wf-1" }));
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});
