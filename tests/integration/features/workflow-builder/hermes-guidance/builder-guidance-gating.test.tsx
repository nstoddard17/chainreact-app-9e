/**
 * WorkflowBuilder — builder left-rail Hermes guidance gating
 * (HERMES-AGENT-REPLACE-BUILDER-AI-PLAN, supersedes the floating-entry gating).
 *
 * The left rail is now the single primary builder AI entry. Proves the server-flag gating: the live
 * guidance panel renders in the rail ONLY when `guidanceEnabled` (the server-evaluated
 * isHermesAgentEnabled(), default OFF) AND a resolved `accountId` are both present. Either gate absent
 * → a safe "unavailable" note instead of the panel (no dead box, no call to a disabled route). Renders
 * the full builder; the guidance helper is mocked so no network is touched.
 */
const mockRouterRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh, push: jest.fn() }),
}));

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

const mockRequest = jest.fn();
jest.mock("@/lib/api/ai/guidance", () => ({
  requestWorkflowGuidance: (...a: unknown[]) => mockRequest(...a),
}));

import { render, screen } from "@testing-library/react";
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
  draftDefinition: { nodes: [], edges: [] },
  deletedAt: null,
  createdAt: "2026-05-17T00:00:00Z",
  updatedAt: "2026-05-17T00:00:00Z",
};

const triggerProviders = [{ id: "slack", displayName: "Slack" }];
const actionProviders = [{ id: "github", displayName: "GitHub" }];

beforeEach(() => {
  mockRequest.mockReset();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

describe("WorkflowBuilder — rail guidance gating", () => {
  it("renders the guidance panel in the rail when guidance is enabled AND accountId is resolved", () => {
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
        accountId="acct-1"
        guidanceEnabled
      />,
    );
    // The single AI entry lives in the left rail now — no separate floating "Build with me" pill.
    expect(screen.getByTestId("builder-guidance-rail")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-guidance-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("builder-guidance-rail-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("builder-guidance-entry")).not.toBeInTheDocument();
  });

  it("shows the safe unavailable note (not the panel) when guidance is disabled (flag OFF)", () => {
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
        accountId="acct-1"
        guidanceEnabled={false}
      />,
    );
    expect(screen.queryByTestId("workflow-guidance-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("builder-guidance-rail-unavailable")).toBeInTheDocument();
  });

  it("shows the unavailable note when accountId is absent even if enabled", () => {
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
        guidanceEnabled
      />,
    );
    expect(screen.queryByTestId("workflow-guidance-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("builder-guidance-rail-unavailable")).toBeInTheDocument();
  });

  it("shows the unavailable note by default (no guidance props — isolated/back-compat render)", () => {
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    expect(screen.queryByTestId("workflow-guidance-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("builder-guidance-rail-unavailable")).toBeInTheDocument();
  });
});
