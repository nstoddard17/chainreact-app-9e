/**
 * REACT-LIVE-SKELETON-2 — anonymous `/start` free deterministic skeleton, end to end.
 *
 * Proves: a logged-out visitor's carried-over prompt auto-shows a skeleton overlay on the canvas
 * (via the free no-auth endpoint, no paid AI / no provider / no DB); Apply turns it into LOCAL draft
 * nodes only (no save/update API); and the unsupported case keeps them in the builder with a sign-up
 * CTA.
 */
const mockRouterRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh, push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return { ...actual, EdgeLabelRenderer: ({ children }: { children: unknown }) => children };
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

const mockUpdateWorkflow = jest.fn();
const mockCreateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...a: unknown[]) => mockUpdateWorkflow(...a),
    createWorkflow: (...a: unknown[]) => mockCreateWorkflow(...a),
  };
});

const mockSkeleton = jest.fn();
jest.mock("@/lib/api/ai/anonSkeleton", () => ({
  requestAnonSkeleton: (...a: unknown[]) => mockSkeleton(...a),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnonymousBuilder } from "@/features/workflow-builder/AnonymousBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";

const triggerProviders = [{ id: "slack", displayName: "Slack" }];
const actionProviders = [{ id: "slack", displayName: "Slack" }];

const PLAN = {
  schemaVersion: 1,
  title: "Manual run → Slack message",
  summary: "When you run this manually, send a Slack message.",
  notApplied: true,
  steps: [
    { ref: "s0", role: "trigger", provider: "native", type: "manual.run", purpose: "Run manually." },
    { ref: "s1", role: "action", provider: "slack", type: "send_channel_message", purpose: "Send a message." },
  ],
};
const PREVIEW = {
  version: 1,
  title: "Manual run → Slack message",
  summary: "",
  notice: "Preview only — your workflow has not changed.",
  notApplied: true as const,
  nodes: [
    { previewId: "preview-step-1", role: "trigger" as const, provider: "native", type: "manual.run", label: "native:manual.run", purpose: "", notApplied: true as const },
    { previewId: "preview-step-2", role: "action" as const, provider: "slack", type: "send_channel_message", label: "slack:send_channel_message", purpose: "", notApplied: true as const },
  ],
  edges: [{ previewId: "preview-edge-1", fromPreviewId: "preview-step-1", toPreviewId: "preview-step-2", notApplied: true as const }],
};

function seedPrompt(prompt: string) {
  window.localStorage.setItem(
    "chainreact:anon-builder-draft",
    JSON.stringify({ version: 1, prompt, nodes: [], edges: [] }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  mockUpdateWorkflow.mockReset();
  mockCreateWorkflow.mockReset();
  mockSkeleton.mockReset().mockResolvedValue(null);
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

function renderAnon() {
  return render(<AnonymousBuilder triggerProviders={triggerProviders} actionProviders={actionProviders} />);
}

describe("anonymous /start — free deterministic live skeleton", () => {
  it("auto-shows the skeleton overlay on the canvas (no paid AI, no DB) and Apply adds local-only nodes", async () => {
    const user = userEvent.setup();
    mockSkeleton.mockResolvedValue({ plan: PLAN, preview: PREVIEW });
    seedPrompt("when I run this manually, send a Slack message to a channel");
    renderAnon();

    // The skeleton overlay appears automatically — the visitor never clicked "Show on canvas".
    await screen.findByTestId("builder-preview-overlay");
    // Used the free deterministic endpoint helper; no paid AI / no workflow create/update.
    expect(mockSkeleton).toHaveBeenCalledWith({ goalText: "when I run this manually, send a Slack message to a channel" });
    expect(mockCreateWorkflow).not.toHaveBeenCalled();
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
    // Showing != applying — nothing in the local draft yet.
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);

    // Explicit Apply → LOCAL draft nodes only; still no DB write.
    await user.click(await screen.findByTestId("builder-preview-apply"));
    await waitFor(() => expect(useGraphSlice.getState().pendingNodes).toHaveLength(2));
    expect(useGraphSlice.getState().pendingNodes.map((n) => `${n.provider}:${n.type}`)).toEqual([
      "native:manual.run",
      "slack:send_channel_message",
    ]);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
    expect(mockCreateWorkflow).not.toHaveBeenCalled();
  });

  it("keeps the visitor in the builder with a sign-up CTA when no deterministic shape is inferable", async () => {
    mockSkeleton.mockResolvedValue({ plan: null, preview: null });
    seedPrompt("orchestrate my entire business end to end");
    renderAnon();
    await screen.findByTestId("anonymous-agent-rail-no-shape");
    expect(screen.queryByTestId("builder-preview-overlay")).toBeNull();
    expect(screen.getByTestId("anonymous-agent-rail-signup")).toHaveAttribute(
      "href",
      "/auth/sign-up?returnTo=%2Fstart%2Fcontinue&reason=ai",
    );
    // Save still gates to sign-up (no real save controls mount in local-only mode).
    expect(screen.queryByTestId("builder-header-save-button")).toBeNull();
    expect(screen.getByTestId("builder-header-local-save")).toBeInTheDocument();
  });
});
