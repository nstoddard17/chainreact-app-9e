/**
 * 5.ONBOARD-1 Batch 2 / 5.ONBOARD-2 — dashboard integration: the checklist is
 * still MOUNTED by the dashboard, replaces (not duplicates) the no-workflows
 * empty state while visible, hands back to the empty state on dismissal, and
 * never breaks the dashboard when absent.
 *
 * 5.ONBOARD-2: the checklist is a FIXED bottom-right widget, so it reserves no
 * layout space. These tests deliberately assert PRESENCE + empty-state
 * suppression only — never inline document order against the page's flow.
 */
const mockList = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    listWorkflows: (...a: unknown[]) => mockList(...a),
  };
});

const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

jest.mock("@/features/marketing/MarketingBrandLogo", () => ({
  MarketingBrandLogo: () => <span data-testid="brand-logo" />,
}));

const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock("@/lib/api/onboarding", () => ({
  getOnboardingChecklist: (...a: unknown[]) => mockGet(...a),
  postOnboardingPresentation: (...a: unknown[]) => mockPost(...a),
  postOnboardingEvent: jest.fn(),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowsDashboard } from "@/features/workflows/WorkflowsDashboard";
import type { OnboardingChecklistDTO } from "@/contracts/onboarding";
import type { WorkflowListItem } from "@/contracts/workflow";

function checklistDto(): OnboardingChecklistDTO {
  return {
    completed: false,
    completedAt: null,
    presentation: {
      dismissed: false,
      minimized: false,
      videoWatched: false,
      celebrationPending: false,
    },
    steps: [
      { key: "create", status: "current" },
      { key: "connect", status: "pending" },
      { key: "configure", status: "pending" },
      { key: "test", status: "pending", testable: false },
      { key: "activate", status: "pending" },
    ],
    completedStepCount: 0,
    totalStepCount: 5,
  };
}

function listItem(id: string, name: string): WorkflowListItem {
  return {
    id,
    name,
    state: "draft",
    disabledReason: null,
    disabledContext: null,
    deletedAt: null,
    folderId: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    providers: [],
    triggerCount: 0,
    actionCount: 0,
    runStats: {
      total: 0,
      succeeded: 0,
      successRate: 0,
      lastRunAt: null,
      lastRunStatus: null,
    },
  } as WorkflowListItem;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({
    ok: true,
    presentation: {
      dismissed: true,
      minimized: false,
      videoWatched: false,
      celebrationPending: false,
    },
    selectedWorkflowId: null,
  });
});

describe("WorkflowsDashboard × onboarding checklist", () => {
  it("renders the checklist and SUPPRESSES the duplicate empty state", () => {
    render(
      <WorkflowsDashboard initialWorkflows={[]} initialOnboarding={checklistDto()} />,
    );
    expect(screen.getByTestId("onboarding-checklist")).toBeInTheDocument();
    // The rest of the dashboard still renders normally alongside it.
    expect(screen.getByText("Total automations")).toBeInTheDocument();
    expect(screen.queryByTestId("workflows-empty-no-workflows")).toBeNull();
  });

  it("no onboarding (flag off / failed derivation) → classic empty state, dashboard fully functional", () => {
    render(<WorkflowsDashboard initialWorkflows={[]} initialOnboarding={null} />);
    expect(screen.queryByTestId("onboarding-checklist")).toBeNull();
    expect(screen.getByTestId("workflows-empty-no-workflows")).toBeInTheDocument();
  });

  it("dismissing the checklist hands the slot back to the empty state", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard initialWorkflows={[]} initialOnboarding={checklistDto()} />,
    );
    await user.click(screen.getByTestId("onboarding-dismiss"));
    await waitFor(() =>
      expect(screen.getByTestId("workflows-empty-no-workflows")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("onboarding-checklist")).toBeNull();
  });

  it("with existing workflows the checklist and the workflow list coexist", () => {
    render(
      <WorkflowsDashboard
        initialWorkflows={[listItem("wf-1", "Lead intake")]}
        initialOnboarding={{
          ...checklistDto(),
          steps: [
            { key: "create", status: "complete" },
            {
              key: "connect",
              status: "current",
              ctaWorkflowId: "wf-1",
              ctaWorkflowName: "Lead intake",
            },
            { key: "configure", status: "pending" },
            {
              key: "test",
              status: "pending",
              testable: true,
              ctaWorkflowId: "wf-1",
              ctaWorkflowName: "Lead intake",
            },
            { key: "activate", status: "pending" },
          ],
          completedStepCount: 1,
        }}
      />,
    );
    expect(screen.getByTestId("onboarding-checklist")).toBeInTheDocument();
    // The workflow list still renders alongside the fixed widget.
    expect(screen.getAllByText("Lead intake").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("workflows-empty-no-workflows")).toBeNull();
  });
});
