/**
 * Collaboration checklist UI tests (5.ONBOARD-4).
 *
 * Covers required proofs: 14 (two expanded onboarding cards never overlap) and
 * 15 (all CTAs remain navigation-only), plus per-track rendering and the
 * no-flash guarantee.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CollaborationChecklistDTO } from "@/contracts/collaborationOnboarding";
import type { OnboardingChecklistDTO } from "@/contracts/onboarding";

jest.mock("@/features/marketing/MarketingBrandLogo", () => ({
  MarketingBrandLogo: () => <span data-testid="brand-logo" />,
}));

const mockPostCollab = jest.fn();
jest.mock("@/lib/api/collaborationOnboarding", () => ({
  postCollaborationPresentation: (...a: unknown[]) => mockPostCollab(...a),
}));

const mockPostOnboarding = jest.fn();
const mockPostEvent = jest.fn();
jest.mock("@/lib/api/onboarding", () => ({
  postOnboardingPresentation: (...a: unknown[]) => mockPostOnboarding(...a),
  postOnboardingEvent: (...a: unknown[]) => mockPostEvent(...a),
}));

jest.mock("@/lib/api/workflows", () => ({
  createWorkflow: jest.fn(),
  WorkflowApiError: class extends Error {},
}));

import { CollaborationChecklist } from "@/features/onboarding/collaboration/CollaborationChecklist";
import { OnboardingWidget } from "@/features/onboarding/OnboardingWidget";

function collabDto(
  overrides: Partial<CollaborationChecklistDTO> = {},
): CollaborationChecklistDTO {
  return {
    track: "team_member",
    completed: false,
    completedAt: null,
    presentation: { dismissed: false, minimized: false, celebrationPending: false },
    steps: [
      { key: "explore_workspace", status: "current" },
      { key: "open_shared_workflow", status: "pending" },
      { key: "use_shared_workflow", status: "pending" },
      { key: "explore_directory", status: "pending" },
    ],
    completedStepCount: 0,
    totalStepCount: 4,
    ...overrides,
  };
}

function workflowDto(
  overrides: Partial<OnboardingChecklistDTO> = {},
): OnboardingChecklistDTO {
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
      { key: "test", status: "pending" },
      { key: "activate", status: "pending" },
    ],
    completedStepCount: 0,
    totalStepCount: 5,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPostCollab.mockResolvedValue({
    ok: true,
    track: "team_member",
    presentation: { dismissed: false, minimized: false, celebrationPending: false },
  });
});

describe("per-track rendering", () => {
  it("renders the member track with no invite or teammate-join step", () => {
    render(<CollaborationChecklist initial={collabDto()} />);
    expect(screen.getByTestId("collab-checklist-card")).toHaveAttribute(
      "data-track",
      "team_member",
    );
    expect(screen.queryByTestId("collab-step-invite_teammate")).toBeNull();
    expect(screen.queryByTestId("collab-step-teammate_joined")).toBeNull();
    expect(screen.getByTestId("collab-step-explore_workspace")).toBeInTheDocument();
  });

  it("renders the owner track with the invite and join steps", () => {
    render(
      <CollaborationChecklist
        initial={collabDto({
          track: "team_owner",
          steps: [
            { key: "invite_teammate", status: "current" },
            { key: "teammate_joined", status: "pending" },
            { key: "connect_shared_app", status: "pending" },
            { key: "create_shared_workflow", status: "pending" },
          ],
        })}
      />,
    );
    expect(screen.getByTestId("collab-checklist-card")).toHaveAttribute(
      "data-track",
      "team_owner",
    );
    expect(screen.getByTestId("collab-step-invite_teammate")).toBeInTheDocument();
    expect(screen.getByTestId("collab-step-teammate_joined")).toBeInTheDocument();
  });

  it("renders nothing when dismissed", () => {
    render(
      <CollaborationChecklist
        initial={collabDto({
          presentation: { dismissed: true, minimized: false, celebrationPending: false },
        })}
      />,
    );
    expect(screen.queryByTestId("collab-checklist")).toBeNull();
  });

  it("renders nothing for a SILENTLY completed track (no celebration)", () => {
    render(
      <CollaborationChecklist
        initial={collabDto({
          completed: true,
          completedAt: "2026-07-19T00:00:00Z",
          presentation: { dismissed: false, minimized: false, celebrationPending: false },
        })}
      />,
    );
    expect(screen.queryByTestId("collab-checklist")).toBeNull();
    expect(screen.queryByTestId("collab-success-card")).toBeNull();
  });
});

describe("proof 15 — every CTA is navigation-only", () => {
  it("renders the current step's CTA as a plain link to an app page", () => {
    render(<CollaborationChecklist initial={collabDto()} />);
    const cta = screen.getByTestId("collab-step-explore_workspace-cta");
    expect(cta.tagName).toBe("A");
    expect(cta).toHaveAttribute("href", "/workflows");
  });

  it("uses only real, non-mutating destinations across every step of every track", () => {
    const ALLOWED = ["/team", "/apps", "/workflows"];
    const tracks: CollaborationChecklistDTO[] = [
      collabDto({
        track: "team_owner",
        steps: [
          { key: "invite_teammate", status: "current" },
          { key: "teammate_joined", status: "pending" },
          { key: "connect_shared_app", status: "pending" },
          { key: "create_shared_workflow", status: "pending" },
        ],
      }),
      collabDto({
        track: "team_admin",
        steps: [
          { key: "invite_teammate", status: "current" },
          { key: "connect_shared_app", status: "pending" },
          { key: "create_shared_workflow", status: "pending" },
          { key: "review_team", status: "pending" },
        ],
      }),
      collabDto(),
    ];
    for (const dto of tracks) {
      for (const step of dto.steps) {
        const { unmount } = render(
          <CollaborationChecklist
            initial={{
              ...dto,
              steps: dto.steps.map((s) => ({
                ...s,
                status: s.key === step.key ? "current" : "pending",
              })),
            }}
          />,
        );
        const cta = screen.getByTestId(`collab-step-${step.key}-cta`);
        const href = cta.getAttribute("href")!;
        expect(ALLOWED).toContain(href);
        // No action verbs, no API paths, no mutating query params.
        expect(href).not.toMatch(/\/api\//);
        expect(href).not.toMatch(/invite|connect|run|activate|role|billing|checkout/);
        unmount();
      }
    }
  });

  it("does not fire any mutation when a CTA is clicked", async () => {
    const user = userEvent.setup();
    render(<CollaborationChecklist initial={collabDto()} />);
    await user.click(screen.getByTestId("collab-step-explore_workspace-cta"));
    expect(mockPostCollab).not.toHaveBeenCalled();
  });

  it("offers no 'mark done' affordance", () => {
    render(<CollaborationChecklist initial={collabDto()} />);
    expect(screen.queryByText(/mark done/i)).toBeNull();
    expect(screen.queryByText(/mark complete/i)).toBeNull();
  });

  it("renders nothing on mount — no write on read", () => {
    render(<CollaborationChecklist initial={collabDto()} />);
    expect(mockPostCollab).not.toHaveBeenCalled();
  });
});

describe("proof 14 — two expanded onboarding cards never overlap", () => {
  it("mounts ONLY the collaboration checklist when it is visible", () => {
    render(
      <OnboardingWidget workflow={workflowDto()} collaboration={collabDto()} />,
    );
    expect(screen.getByTestId("collab-checklist")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-checklist")).toBeNull();
    expect(screen.queryByTestId("onboarding-checklist-card")).toBeNull();
  });

  it("falls through to the workflow checklist once collaboration is dismissed", () => {
    render(
      <OnboardingWidget
        workflow={workflowDto()}
        collaboration={collabDto({
          presentation: {
            dismissed: true,
            minimized: false,
            celebrationPending: false,
          },
        })}
      />,
    );
    expect(screen.queryByTestId("collab-checklist")).toBeNull();
    expect(screen.getByTestId("onboarding-checklist")).toBeInTheDocument();
  });

  it("falls through once collaboration is silently completed", () => {
    render(
      <OnboardingWidget
        workflow={workflowDto()}
        collaboration={collabDto({
          completed: true,
          completedAt: "2026-07-19T00:00:00Z",
        })}
      />,
    );
    expect(screen.queryByTestId("collab-checklist")).toBeNull();
    expect(screen.getByTestId("onboarding-checklist")).toBeInTheDocument();
  });

  it("shows the workflow checklist unchanged on a personal account", () => {
    render(<OnboardingWidget workflow={workflowDto()} collaboration={null} />);
    expect(screen.queryByTestId("collab-checklist")).toBeNull();
    expect(screen.getByTestId("onboarding-checklist")).toBeInTheDocument();
  });

  it("never renders two floating positioners at once, in any combination", () => {
    const combos: Array<[OnboardingChecklistDTO | null, CollaborationChecklistDTO | null]> =
      [
        [workflowDto(), collabDto()],
        [workflowDto(), null],
        [null, collabDto()],
        [
          workflowDto(),
          collabDto({
            presentation: {
              dismissed: true,
              minimized: false,
              celebrationPending: false,
            },
          }),
        ],
        [
          workflowDto(),
          collabDto({
            presentation: {
              dismissed: false,
              minimized: true,
              celebrationPending: false,
            },
          }),
        ],
      ];
    for (const [workflow, collaboration] of combos) {
      const { container, unmount } = render(
        <OnboardingWidget workflow={workflow} collaboration={collaboration} />,
      );
      // Both checklists use the same fixed bottom-right positioner; at most one
      // may ever be in the tree.
      const positioners = container.querySelectorAll(
        '[data-testid="collab-checklist"], [data-testid="onboarding-checklist"]',
      );
      expect(positioners.length).toBeLessThanOrEqual(1);
      unmount();
    }
  });

  it("keeps the collaboration card in the same corner and stacking layer", () => {
    render(<CollaborationChecklist initial={collabDto()} />);
    const positioner = screen.getByTestId("collab-checklist");
    expect(positioner.className).toContain("fixed");
    expect(positioner.className).toContain("z-40");
    expect(positioner.className).toContain("sm:right-6");
  });
});

describe("presentation actions", () => {
  it("sends a bare verb with no track when minimizing", async () => {
    const user = userEvent.setup();
    render(<CollaborationChecklist initial={collabDto()} />);
    await user.click(screen.getByTestId("collab-minimize"));
    expect(mockPostCollab).toHaveBeenCalledWith({ action: "minimize" });
    // The client never names a track — the server derives it.
    expect(mockPostCollab.mock.calls[0][0]).not.toHaveProperty("track");
  });

  it("restores the previous state and warns when a mutation fails", async () => {
    const user = userEvent.setup();
    mockPostCollab.mockRejectedValue(new Error("boom"));
    render(<CollaborationChecklist initial={collabDto()} />);
    await user.click(screen.getByTestId("collab-dismiss"));
    expect(await screen.findByTestId("collab-action-error")).toBeInTheDocument();
    // Still visible — the optimistic dismissal was rolled back.
    expect(screen.getByTestId("collab-checklist-card")).toBeInTheDocument();
  });
});
