/**
 * CS-4b — NodeCredentialOwnerSection: badge + pending copy + manager reassign
 * affordance, driven by mocked credential-owner metadata. No leak: display names
 * only. Mocks the client lib so the real hook runs.
 */
import { render, screen, waitFor } from "@testing-library/react";
import {
  BuilderTeamProvider,
  type BuilderTeamContextValue,
} from "@/features/workflow-builder/context/builderTeamContext";
import { NodeCredentialOwnerSection } from "@/features/workflow-builder/config-modal/NodeCredentialOwnerSection";

const mockFetchOwners = jest.fn();
jest.mock("@/lib/api/credentialOwners", () => ({
  fetchNodeCredentialOwners: (...a: unknown[]) => mockFetchOwners(...a),
  fetchEligibleTargets: jest.fn(),
  requestCredentialReassignment: jest.fn(),
}));

const team = (overrides: Partial<BuilderTeamContextValue> = {}): BuilderTeamContextValue => ({
  isTeamWorkflow: true,
  isViewerCreator: false,
  creatorDisplayName: "Casey Owner",
  workflowAccountName: "Acme",
  activeAccountName: "Acme",
  accountMismatch: false,
  ...overrides,
});

function meta(nodes: unknown[], canManage = true) {
  return { workflowId: "wf-1", canManage, nodes };
}

function renderSection(
  opts: { provider?: string; nodeId?: string; ctx?: BuilderTeamContextValue | null; workflowId?: string | null } = {},
) {
  render(
    <BuilderTeamProvider value={opts.ctx ?? team()}>
      <NodeCredentialOwnerSection
        workflowId={opts.workflowId ?? "wf-1"}
        nodeId={opts.nodeId ?? "node-gmail"}
        provider={opts.provider ?? "gmail"}
      />
    </BuilderTeamProvider>,
  );
}

beforeEach(() => {
  mockFetchOwners.mockReset();
  mockFetchOwners.mockResolvedValue(meta([]));
});

describe("NodeCredentialOwnerSection", () => {
  it("accepted override → badge names the assigned member (display name only)", async () => {
    mockFetchOwners.mockResolvedValue(
      meta([{ nodeId: "node-gmail", provider: "gmail", status: "accepted", ownerDisplayName: "Dana Reyes" }]),
    );
    renderSection();
    await waitFor(() =>
      expect(screen.getByTestId("credential-badge-owner")).toHaveTextContent(
        /Runs under Dana Reyes's connection/i,
      ),
    );
    expect(screen.getByTestId("credential-badge-owner").textContent).not.toMatch(/@/);
  });

  it("pending request → renders the pending-approval line", async () => {
    mockFetchOwners.mockResolvedValue(
      meta([{ nodeId: "node-gmail", provider: "gmail", status: "pending", ownerDisplayName: "Dana Reyes" }]),
    );
    renderSection();
    await waitFor(() =>
      expect(screen.getByTestId("credential-reassign-pending")).toHaveTextContent(
        /Reassignment pending Dana Reyes's approval/i,
      ),
    );
    // No reassign control while pending.
    expect(screen.queryByTestId("credential-reassign-open")).toBeNull();
  });

  it("no override + canManage + personal provider → shows the Reassign control", async () => {
    mockFetchOwners.mockResolvedValue(meta([], true));
    renderSection();
    await waitFor(() => expect(screen.getByTestId("credential-reassign-open")).toBeInTheDocument());
    // Creator badge still renders (no override).
    expect(screen.getByTestId("credential-badge-owner")).toHaveTextContent(/connection/i);
  });

  it("no override but NOT a manager → no Reassign control", async () => {
    mockFetchOwners.mockResolvedValue(meta([], false));
    renderSection();
    await waitFor(() => expect(mockFetchOwners).toHaveBeenCalled());
    expect(screen.queryByTestId("credential-reassign-open")).toBeNull();
  });

  it("account/service provider → shared badge, never a Reassign control", async () => {
    mockFetchOwners.mockResolvedValue(meta([], true));
    renderSection({ provider: "slack", nodeId: "node-slack" });
    await waitFor(() => expect(screen.getByTestId("credential-badge-shared")).toBeInTheDocument());
    expect(screen.queryByTestId("credential-reassign-open")).toBeNull();
  });

  it("non-team workflow → no metadata fetch, null badge", async () => {
    renderSection({ ctx: team({ isTeamWorkflow: false }) });
    // enabled=false → the hook never fetches.
    await new Promise((r) => setTimeout(r, 0));
    expect(mockFetchOwners).not.toHaveBeenCalled();
    expect(screen.queryByTestId("credential-badge-owner")).toBeNull();
  });
});
