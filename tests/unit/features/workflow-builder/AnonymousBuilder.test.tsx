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
  listNativeTriggers: async () => [],
  listProviderActions: async () => [],
  listProviderTriggers: async () => [],
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
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
  window.sessionStorage.clear();
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
  it("seeds the carried-over prompt into the React Agent rail", async () => {
    window.sessionStorage.setItem(
      "chainreact:anon-builder-prompt",
      "Notify #wins on a 5-star review",
    );
    renderAnon();
    const promptBox = await screen.findByTestId("anonymous-agent-rail-prompt");
    await waitFor(() =>
      expect(promptBox).toHaveValue("Notify #wins on a 5-star review"),
    );
    // The live, account-scoped guidance rail must NOT mount for an anon visitor.
    expect(screen.queryByTestId("builder-guidance-rail")).not.toBeInTheDocument();
    expect(screen.getByTestId("anonymous-agent-rail-signup")).toHaveAttribute(
      "href",
      "/auth/sign-up",
    );
  });

  it("shows the local-only banner and gates save/run/activate behind sign-up", () => {
    renderAnon();
    expect(screen.getByTestId("local-build-banner")).toBeInTheDocument();
    // Single sign-up CTA replaces the whole action cluster.
    expect(screen.getByTestId("builder-header-local-signup")).toHaveAttribute(
      "href",
      "/auth/sign-up",
    );
    // None of the server-calling controls mount.
    expect(screen.queryByTestId("builder-header-save-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("builder-header-templates-button")).not.toBeInTheDocument();
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
      "/auth/sign-up",
    );
    // local-config-note occupies the inspector slot in place of the real
    // (credential-fetching) config form, so no `/api/options` / OAuth fetch fires.
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});
