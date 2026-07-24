/**
 * ANON-BUILDER-1 — local-only (logged-out) builder.
 *
 * Verifies the anonymous build contract:
 *   - the carried-over prompt is seeded into the React Agent rail,
 *   - the live (paid, account-scoped) guidance rail is NOT mounted,
 *   - the "building locally" banner + sign-up CTAs render,
 *   - the header's save/run/activate cluster is replaced by a sign-up CTA
 *     (none of the server-calling controls mount),
 *   - local graph editing works with NO save/create API call.
 */
import { act, render, screen, waitFor } from "@testing-library/react";

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
  };
});

const mockRouterRefresh = jest.fn();
const mockRouterPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh, push: mockRouterPush, prefetch: jest.fn() }),
}));

// ReactFlow's EdgeLabelRenderer needs a real canvas; passthrough for jsdom.
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
  listAiActions: () => Promise.resolve([]),
  listNativeTriggers: async () => [],
  listProviderActions: async () => [],
  listProviderTriggers: async () => [],
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

// REACT-LIVE-SKELETON-3 — the anon rail auto-plans via the limited anonymous AI endpoint when a
// prompt is present. Mock the helper so these tests don't hit the network; default = unavailable.
const mockAnonGuidance = jest.fn();
jest.mock("@/lib/api/ai/anonymousGuidance", () => ({
  requestAnonymousGuidance: (...a: unknown[]) => mockAnonGuidance(...a),
}));

import { AnonymousBuilder } from "@/features/workflow-builder/AnonymousBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";

const triggerProviders = [{ id: "slack", displayName: "Slack" }];
const actionProviders = [{ id: "slack", displayName: "Slack" }];

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockRouterRefresh.mockReset();
  mockRouterPush.mockReset();
  window.localStorage.clear();
  mockAnonGuidance.mockReset().mockResolvedValue(null);
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

function renderAnon() {
  return render(
    <AnonymousBuilder
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
    />,
  );
}

describe("AnonymousBuilder (local-only)", () => {
  it("auto-plans the carried-over prompt in the React Agent rail (prompt becomes the first turn)", async () => {
    window.localStorage.setItem(
      "chainreact:anon-builder-draft",
      JSON.stringify({
        version: 1,
        prompt: "Notify #wins on a 5-star review",
        nodes: [],
        edges: [],
      }),
    );
    renderAnon();
    // REACT-LIVE-SKELETON-3 — the carried-over prompt is auto-sent as the first chat turn.
    const userTurn = await screen.findByTestId("anonymous-agent-rail-user");
    expect(userTurn).toHaveTextContent("Notify #wins on a 5-star review");
    await waitFor(() => expect(mockAnonGuidance).toHaveBeenCalledWith({ goalText: "Notify #wins on a 5-star review" }));
    // The live, account-scoped guidance rail must NOT mount for an anon visitor.
    expect(screen.queryByTestId("builder-guidance-rail")).not.toBeInTheDocument();
    // AI gate carries returnTo + the ai reason.
    expect(screen.getByTestId("anonymous-agent-rail-signup")).toHaveAttribute(
      "href",
      "/auth/sign-up?returnTo=%2Fstart%2Fcontinue&reason=ai",
    );
  });

  it("shows the local-only banner and gates save/run/activate behind contextual sign-up", () => {
    renderAnon();
    expect(screen.getByTestId("local-build-banner")).toBeInTheDocument();
    // Distinct gated links carry the correct contextual reason + return path.
    expect(screen.getByTestId("builder-header-local-save")).toHaveAttribute(
      "href",
      "/auth/sign-up?returnTo=%2Fstart%2Fcontinue&reason=save",
    );
    expect(screen.getByTestId("builder-header-local-activate")).toHaveAttribute(
      "href",
      "/auth/sign-up?returnTo=%2Fstart%2Fcontinue&reason=activate",
    );
    expect(screen.getByTestId("builder-header-local-test")).toHaveAttribute(
      "href",
      "/auth/sign-up?returnTo=%2Fstart%2Fcontinue&reason=run",
    );
    // None of the server-calling controls mount.
    expect(screen.queryByTestId("builder-header-save-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("builder-header-templates-button")).not.toBeInTheDocument();
  });

  it("persists local graph edits to localStorage (skeleton survives auth)", async () => {
    renderAnon();
    act(() => {
      useGraphSlice.getState().addTrigger({ provider: "slack", type: "slack.message.channel" });
    });
    await waitFor(() => {
      const raw = window.localStorage.getItem("chainreact:anon-builder-draft");
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw as string);
      expect(parsed.nodes).toHaveLength(1);
      expect(parsed.nodes[0].provider).toBe("slack");
    });
  });

  it("does NOT call the save/update API on load", () => {
    renderAnon();
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("supports local graph editing with no save API call", async () => {
    renderAnon();
    // Simulate a local edit through the in-memory graph slice (the same path the
    // canvas pickers drive). No network is involved.
    act(() => {
      useGraphSlice.getState().addTrigger({ provider: "slack", type: "slack.message.channel" });
    });
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(1);
    expect(useGraphSlice.getState().isDirty).toBe(true);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("shows a sign-up note instead of the config form when a node is selected", async () => {
    renderAnon();
    act(() => {
      const node = useGraphSlice
        .getState()
        .addTrigger({ provider: "slack", type: "slack.message.channel" });
      useConfigSlice.getState().openNode({ nodeId: node.id, initialValues: node.config });
    });
    expect(await screen.findByTestId("local-config-note")).toBeInTheDocument();
    expect(screen.getByTestId("local-config-note-signup")).toHaveAttribute(
      "href",
      "/auth/sign-up?returnTo=%2Fstart%2Fcontinue&reason=connect",
    );
    // local-config-note occupies the inspector slot in place of the real
    // (credential-fetching) config form, so no `/api/options` / OAuth fetch fires.
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});
