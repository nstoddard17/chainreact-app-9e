/**
 * 5.ONBOARD-1 Batch 2 — onboarding checklist UI states, driven by fixtures
 * shaped exactly like the real `OnboardingChecklistDTO`. Covers every imported
 * design state adapted to real behavior: untouched / in-progress / blocked /
 * failed-test / waiting-for-first-run / minimized / dismissed / success /
 * silent-suppression / error restore, plus CTA destinations and a11y semantics.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  OnboardingChecklistDTO,
  OnboardingStepDTO,
} from "@/contracts/onboarding";
import { OnboardingChecklist } from "@/features/onboarding/OnboardingChecklist";

jest.mock("@/features/marketing/MarketingBrandLogo", () => ({
  MarketingBrandLogo: () => <span data-testid="brand-logo" />,
}));

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock("@/lib/api/onboarding", () => ({
  getOnboardingChecklist: (...a: unknown[]) => mockGet(...a),
  postOnboardingPresentation: (...a: unknown[]) => mockPost(...a),
  postOnboardingEvent: jest.fn(),
}));

const mockCreateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => ({
  createWorkflow: (...a: unknown[]) => mockCreateWorkflow(...a),
  WorkflowApiError: class extends Error {},
}));

function steps(overrides: Partial<Record<string, Partial<OnboardingStepDTO>>> = {}) {
  const base: OnboardingStepDTO[] = [
    { key: "create", status: "complete" },
    { key: "connect", status: "current" },
    { key: "configure", status: "pending" },
    { key: "test", status: "pending", testable: true },
    { key: "activate", status: "pending" },
  ];
  return base.map((s) => ({ ...s, ...(overrides[s.key] ?? {}) })) as OnboardingStepDTO[];
}

function dto(overrides: Partial<OnboardingChecklistDTO> = {}): OnboardingChecklistDTO {
  return {
    enabled: true,
    completed: false,
    completedAt: null,
    presentation: {
      dismissed: false,
      minimized: false,
      videoWatched: false,
      celebrationPending: false,
    },
    selectedWorkflow: { id: "wf-1", name: "Lead intake", state: "draft", testable: true },
    workflowOptions: [{ id: "wf-1", name: "Lead intake" }],
    steps: steps(),
    completedStepCount: 1,
    totalStepCount: 5,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({
    ok: true,
    presentation: {
      dismissed: false,
      minimized: false,
      videoWatched: false,
      celebrationPending: false,
    },
    selectedWorkflowId: "wf-1",
  });
});

describe("OnboardingChecklist — visibility", () => {
  it("renders nothing when initial is null (derivation failed) and the page stays usable", () => {
    const { container } = render(<OnboardingChecklist initial={null} />);
    expect(container.querySelector("[data-testid=onboarding-checklist]")).toBeNull();
  });

  it("renders nothing when the flag is off (enabled:false)", () => {
    render(<OnboardingChecklist initial={{ enabled: false }} />);
    expect(screen.queryByTestId("onboarding-checklist")).toBeNull();
  });

  it("renders nothing when dismissed, and reports visibility=false", () => {
    const onVisibilityChange = jest.fn();
    render(
      <OnboardingChecklist
        initial={dto({
          presentation: {
            dismissed: true,
            minimized: false,
            videoWatched: false,
            celebrationPending: false,
          },
        })}
        onVisibilityChange={onVisibilityChange}
      />,
    );
    expect(screen.queryByTestId("onboarding-checklist")).toBeNull();
    expect(onVisibilityChange).toHaveBeenCalledWith(false);
  });

  it("EXISTING-USER SUPPRESSION: completed with celebration already acknowledged renders nothing", () => {
    render(
      <OnboardingChecklist
        initial={dto({
          completed: true,
          completedAt: "2026-07-01T00:00:00Z",
          completionWorkflow: { id: "wf-9", name: "Old workflow" },
          presentation: {
            dismissed: false,
            minimized: false,
            videoWatched: false,
            celebrationPending: false,
          },
        })}
      />,
    );
    expect(screen.queryByTestId("onboarding-success-card")).toBeNull();
    expect(screen.queryByTestId("onboarding-checklist-card")).toBeNull();
  });
});

describe("OnboardingChecklist — expanded card", () => {
  it("untouched state: region + ordered steps, create current with the chooser CTA", () => {
    render(
      <OnboardingChecklist
        initial={dto({
          steps: steps({
            create: { status: "current" },
            connect: { status: "pending" },
          }),
          completedStepCount: 0,
          selectedWorkflow: null,
          workflowOptions: [],
        })}
      />,
    );
    expect(screen.getByRole("region", { name: "Getting started" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Setup steps" })).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-step-create")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByTestId("onboarding-create-cta")).toBeInTheDocument();
    expect(
      screen.getByText("Complete these steps to put your first automation to work."),
    ).toBeInTheDocument();
  });

  it("in-progress: done step struck through with Done tag, progress label and bar reflect counts", () => {
    render(<OnboardingChecklist initial={dto()} />);
    expect(screen.getByTestId("onboarding-step-create")).toHaveAttribute(
      "data-status",
      "complete",
    );
    expect(screen.getByTestId("onboarding-step-create-check")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-progress-label")).toHaveTextContent(
      "1 of 5 steps done",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  });

  it("connect CTA deep-links to the first not-ready provider's highlight", () => {
    render(
      <OnboardingChecklist
        initial={dto({
          steps: steps({
            connect: {
              status: "current",
              providers: [
                {
                  provider: "slack",
                  name: "Slack",
                  ready: false,
                  reconnectNeeded: false,
                  canConnect: true,
                  adminRequired: false,
                },
              ],
            },
          }),
        })}
      />,
    );
    expect(screen.getByTestId("onboarding-step-connect-cta")).toHaveAttribute(
      "href",
      "/apps?highlight=slack",
    );
    expect(screen.getByTestId("onboarding-provider-slack")).toBeInTheDocument();
  });

  it.each([
    ["configure", "setup"],
    ["test", "test"],
    ["activate", "activate"],
  ])("%s CTA opens the builder with focus=%s", (key, focus) => {
    const overrides: Record<string, Partial<OnboardingStepDTO>> = {
      connect: { status: "complete" },
      configure: { status: "complete" },
      test: { status: "complete" },
      activate: { status: "pending" },
    };
    overrides[key] = { ...(overrides[key] ?? {}), status: "current", testable: true };
    render(<OnboardingChecklist initial={dto({ steps: steps(overrides) })} />);
    expect(screen.getByTestId(`onboarding-step-${key}-cta`)).toHaveAttribute(
      "href",
      `/workflows/wf-1?focus=${focus}`,
    );
  });

  it("PERMISSION-BLOCKED: member sees admin-required copy and no dead CTA", () => {
    render(
      <OnboardingChecklist
        initial={dto({
          steps: steps({
            connect: {
              status: "blocked",
              blockedReason: "admin_required",
              providers: [
                {
                  provider: "stripe",
                  name: "Stripe",
                  ready: false,
                  reconnectNeeded: false,
                  canConnect: false,
                  adminRequired: true,
                },
              ],
            },
          }),
        })}
      />,
    );
    expect(
      screen.getByText("A workspace owner or admin needs to connect Stripe."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-step-connect-blocked")).toHaveTextContent(
      "Admin needed",
    );
    expect(screen.queryByTestId("onboarding-step-connect-cta")).toBeNull();
  });

  it("RECONNECT-REQUIRED: blocked chip + reconnect copy + Apps CTA", () => {
    render(
      <OnboardingChecklist
        initial={dto({
          steps: steps({
            connect: {
              status: "blocked",
              blockedReason: "reconnect_required",
              providers: [
                {
                  provider: "slack",
                  name: "Slack",
                  ready: false,
                  reconnectNeeded: true,
                  canConnect: true,
                  adminRequired: false,
                },
              ],
            },
          }),
        })}
      />,
    );
    expect(
      screen.getByText("Slack needs to be reconnected before this workflow can run."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-step-connect-cta")).toHaveTextContent(
      "Open Apps to reconnect",
    );
  });

  it("FAILED TEST stays incomplete with the failure copy", () => {
    render(
      <OnboardingChecklist
        initial={dto({
          steps: steps({
            connect: { status: "complete" },
            configure: { status: "complete" },
            test: { status: "current", testable: true, lastRunFailed: true },
          }),
          completedStepCount: 3,
        })}
      />,
    );
    const testStep = screen.getByTestId("onboarding-step-test");
    expect(testStep).toHaveAttribute("data-status", "current");
    expect(
      screen.getByText("The last run failed — open the results to see why, then try again."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-step-test-check")).toBeNull();
  });

  it("AUTOMATED TRIGGER waiting state: honest copy, no CTA, step not faked complete", () => {
    render(
      <OnboardingChecklist
        initial={dto({
          steps: steps({
            connect: { status: "complete" },
            configure: { status: "complete" },
            test: { status: "current", testable: false, waitingForFirstRun: true },
            activate: { status: "complete" },
          }),
          completedStepCount: 4,
        })}
      />,
    );
    expect(
      screen.getByText(
        "Waiting for the first successful run — we'll check this off automatically.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-step-test-cta")).toBeNull();
    expect(screen.queryByTestId("onboarding-step-test-check")).toBeNull();
  });
});

describe("OnboardingChecklist — presentation actions", () => {
  it("minimize posts and renders the design's pill with ring + progress", async () => {
    const user = userEvent.setup();
    render(<OnboardingChecklist initial={dto()} />);
    await user.click(screen.getByTestId("onboarding-minimize"));
    expect(mockPost).toHaveBeenCalledWith({ action: "minimize" });
    expect(await screen.findByTestId("onboarding-minimized-bar")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-minimized-progress")).toHaveTextContent(
      "1 of 5 complete",
    );
  });

  it("expand from the pill posts and restores the card", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingChecklist
        initial={dto({
          presentation: {
            dismissed: false,
            minimized: true,
            videoWatched: false,
            celebrationPending: false,
          },
        })}
      />,
    );
    await user.click(screen.getByTestId("onboarding-minimized-bar"));
    expect(mockPost).toHaveBeenCalledWith({ action: "expand" });
    expect(await screen.findByTestId("onboarding-checklist-card")).toBeInTheDocument();
  });

  it("dismiss posts, hides the checklist, and reports visibility=false", async () => {
    const user = userEvent.setup();
    const onVisibilityChange = jest.fn();
    render(
      <OnboardingChecklist initial={dto()} onVisibilityChange={onVisibilityChange} />,
    );
    await user.click(screen.getByTestId("onboarding-dismiss"));
    expect(mockPost).toHaveBeenCalledWith({ action: "dismiss" });
    await waitFor(() =>
      expect(screen.queryByTestId("onboarding-checklist-card")).toBeNull(),
    );
    expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
  });

  it("mutation failure restores the previous state and shows a quiet error", async () => {
    const user = userEvent.setup();
    mockPost.mockRejectedValueOnce(new Error("boom"));
    render(<OnboardingChecklist initial={dto()} />);
    await user.click(screen.getByTestId("onboarding-dismiss"));
    expect(await screen.findByTestId("onboarding-action-error")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-checklist-card")).toBeInTheDocument();
  });

  it("workflow picker shows for ≥2 options; selecting posts select_workflow and refetches", async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue(dto());
    render(
      <OnboardingChecklist
        initial={dto({
          workflowOptions: [
            { id: "wf-1", name: "Lead intake" },
            { id: "wf-2", name: "Stripe sync" },
          ],
        })}
      />,
    );
    await user.selectOptions(screen.getByTestId("onboarding-workflow-picker"), "wf-2");
    expect(mockPost).toHaveBeenCalledWith({
      action: "select_workflow",
      workflowId: "wf-2",
    });
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
  });

  it("picker is hidden with a single option", () => {
    render(<OnboardingChecklist initial={dto()} />);
    expect(screen.queryByTestId("onboarding-workflow-picker")).toBeNull();
  });
});

describe("OnboardingChecklist — completion", () => {
  it("success card renders the required copy naming the completion workflow", () => {
    render(
      <OnboardingChecklist
        initial={dto({
          completed: true,
          completedAt: "2026-07-18T00:00:00Z",
          completionWorkflow: { id: "wf-1", name: "Lead intake" },
          presentation: {
            dismissed: false,
            minimized: false,
            videoWatched: false,
            celebrationPending: true,
          },
        })}
      />,
    );
    const card = screen.getByTestId("onboarding-success-card");
    expect(card).toHaveTextContent("Your first workflow is live.");
    expect(card).toHaveTextContent("Lead intake");
    expect(card).toHaveTextContent("when its trigger occurs");
    expect(screen.getByTestId("onboarding-success-open-workflow")).toHaveAttribute(
      "href",
      "/workflows/wf-1",
    );
  });

  it("Done acknowledges the celebration and dismisses", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingChecklist
        initial={dto({
          completed: true,
          completionWorkflow: { id: "wf-1", name: "Lead intake" },
          presentation: {
            dismissed: false,
            minimized: false,
            videoWatched: false,
            celebrationPending: true,
          },
        })}
      />,
    );
    await user.click(screen.getByTestId("onboarding-success-done"));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith({ action: "celebrated" });
      expect(mockPost).toHaveBeenCalledWith({ action: "dismiss" });
    });
  });

  it("deleted completion workflow: success copy falls back without a broken link", () => {
    render(
      <OnboardingChecklist
        initial={dto({
          completed: true,
          completionWorkflow: null,
          presentation: {
            dismissed: false,
            minimized: false,
            videoWatched: false,
            celebrationPending: true,
          },
        })}
      />,
    );
    expect(screen.getByTestId("onboarding-success-card")).toHaveTextContent(
      "Your first workflow is live.",
    );
    expect(screen.queryByTestId("onboarding-success-open-workflow")).toBeNull();
  });
});

describe("OnboardingChecklist — keyboard/a11y", () => {
  it("collapsed step labels are focusable buttons that expand the row", async () => {
    const user = userEvent.setup();
    render(<OnboardingChecklist initial={dto()} />);
    const focusBtn = screen.getByTestId("onboarding-step-configure-focus");
    focusBtn.focus();
    expect(focusBtn).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("onboarding-step-configure")).toHaveAttribute(
      "aria-current",
      "step",
    );
  });
});
