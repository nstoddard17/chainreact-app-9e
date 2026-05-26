/**
 * Tests for features/workflow-builder/panels/NodeInspectorPanel.
 *
 * Thin wrapper (Slice 4.BUILDER-INSPECTOR-1) around ConfigModalShell.
 * The interesting behavior (Save / Cancel / field rendering / metadata
 * lookup) is covered by ConfigModalShell.test.tsx + the provider-specific
 * config tests. Here we only verify the wrapper:
 *   - data-testid for parent (drawer) integration.
 *   - ConfigModalShell mounts when activeNodeId is set.
 *   - ConfigModalShell stays null when no active node (existing
 *     shell contract — wrapper does not render an empty form).
 */
const mockListNativeActions = jest.fn(async () => []);
const mockListNativeTriggers = jest.fn(async () => []);
const mockListProviderActions = jest.fn(async (_p: string) => []);
const mockListProviderTriggers = jest.fn(async (_p: string) => []);
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: (p: string) => mockListProviderActions(p),
  listProviderTriggers: (p: string) => mockListProviderTriggers(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { act, render, screen } from "@testing-library/react";
import { NodeInspectorPanel } from "@/features/workflow-builder/panels/NodeInspectorPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";

beforeEach(() => {
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockResolvedValue([]);
  mockListProviderActions.mockResolvedValue([]);
  mockListProviderTriggers.mockResolvedValue([]);
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

describe("NodeInspectorPanel", () => {
  it("renders the data-testid wrapper (used by the drawer integration)", () => {
    render(<NodeInspectorPanel />);
    expect(screen.getByTestId("node-inspector-panel")).toBeInTheDocument();
  });

  it("does NOT render ConfigModalShell content when no node is active (shell returns null)", () => {
    render(<NodeInspectorPanel />);
    // ConfigModalShell renders a `role='complementary' aria-label='Node configuration'`
    // landmark when active. With no activeNodeId, it should not render.
    expect(
      screen.queryByRole("complementary", { name: /node configuration/i }),
    ).toBeNull();
  });

  it("renders ConfigModalShell content once a node is hydrated + opened in configSlice", () => {
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        {
          id: "trig",
          kind: "trigger",
          provider: "slack",
          type: "",
          config: {},
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    render(<NodeInspectorPanel />);
    act(() => {
      useConfigSlice.getState().openNode({ nodeId: "trig", initialValues: {} });
    });
    expect(
      screen.getByRole("complementary", { name: /node configuration/i }),
    ).toBeInTheDocument();
  });
});
