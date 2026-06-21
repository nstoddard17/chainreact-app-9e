/**
 * WorkflowBuilder — builder "Build with me" guidance entry gating
 * (HERMES-AGENT-GUIDANCE-UI-BUILDER).
 *
 * Proves the server-flag gating: the advisory entry mounts ONLY when `guidanceEnabled` (the
 * server-evaluated isHermesAgentEnabled(), default OFF) AND a resolved `accountId` are both present —
 * mirroring the dashboard's `isHermesAgentEnabled() && <WorkflowGuidancePanel>` pattern. Either gate
 * absent → no entry (no dead box). Renders the full builder; the guidance helper is mocked so no
 * network is touched.
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

describe("WorkflowBuilder — guidance entry gating", () => {
  it("renders the entry when guidance is enabled AND accountId is resolved", () => {
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
        accountId="acct-1"
        guidanceEnabled
      />,
    );
    expect(screen.getByTestId("builder-guidance-entry")).toBeInTheDocument();
  });

  it("hides the entry when guidance is disabled (flag OFF)", () => {
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
        accountId="acct-1"
        guidanceEnabled={false}
      />,
    );
    expect(screen.queryByTestId("builder-guidance-entry")).not.toBeInTheDocument();
  });

  it("hides the entry when accountId is absent even if enabled", () => {
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
        guidanceEnabled
      />,
    );
    expect(screen.queryByTestId("builder-guidance-entry")).not.toBeInTheDocument();
  });

  it("hides the entry by default (no guidance props — isolated/back-compat render)", () => {
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    expect(screen.queryByTestId("builder-guidance-entry")).not.toBeInTheDocument();
  });
});
