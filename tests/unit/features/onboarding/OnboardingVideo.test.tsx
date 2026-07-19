/**
 * 5.ONBOARD-1 Batch 4 — optional video surface. Proves: hidden without config
 * (safe unavailable state), opens in an accessible modal, records opened +
 * watched (≥90%/ended) exactly once, and NEVER affects checklist completion.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OnboardingChecklistDTO } from "@/contracts/onboarding";
import { OnboardingChecklist } from "@/features/onboarding/OnboardingChecklist";

jest.mock("@/features/marketing/MarketingBrandLogo", () => ({
  MarketingBrandLogo: () => <span data-testid="brand-logo" />,
}));

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockEvent = jest.fn();
jest.mock("@/lib/api/onboarding", () => ({
  getOnboardingChecklist: (...a: unknown[]) => mockGet(...a),
  postOnboardingPresentation: (...a: unknown[]) => mockPost(...a),
  postOnboardingEvent: (...a: unknown[]) => mockEvent(...a),
}));

jest.mock("@/lib/api/workflows", () => ({
  createWorkflow: jest.fn(),
  WorkflowApiError: class extends Error {},
}));

function dto(): OnboardingChecklistDTO {
  return {
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
    steps: [
      { key: "create", status: "complete" },
      { key: "connect", status: "current" },
      { key: "configure", status: "pending" },
      { key: "test", status: "pending", testable: true },
      { key: "activate", status: "pending" },
    ],
    completedStepCount: 1,
    totalStepCount: 5,
  };
}

const VIDEO = { videoUrl: "https://cdn.example/onboarding.mp4", captionsUrl: "https://cdn.example/onboarding.vtt" };

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({
    ok: true,
    presentation: {
      dismissed: false,
      minimized: false,
      videoWatched: true,
      celebrationPending: false,
    },
    selectedWorkflowId: "wf-1",
  });
});

describe("OnboardingChecklist — optional video", () => {
  it("no configured video → the surface is absent entirely (safe unavailable state)", () => {
    render(<OnboardingChecklist initial={dto()} video={null} />);
    expect(screen.queryByTestId("onboarding-video-open")).toBeNull();
  });

  it("opens an accessible modal with captions and records video_opened", async () => {
    const user = userEvent.setup();
    render(<OnboardingChecklist initial={dto()} video={VIDEO} />);
    const openBtn = screen.getByTestId("onboarding-video-open");
    expect(openBtn).toHaveTextContent("See how it works — 1 min");
    await user.click(openBtn);
    expect(mockEvent).toHaveBeenCalledWith({ event: "video_opened" });
    const modal = screen.getByTestId("onboarding-video-modal");
    expect(modal).toHaveAttribute("aria-modal", "true");
    expect(modal.querySelector("track[kind=captions]")).not.toBeNull();
    expect(screen.getByTestId("onboarding-video-close")).toHaveFocus();
  });

  it("records watched exactly once at ended, and NEVER completes a checklist step", async () => {
    const user = userEvent.setup();
    render(<OnboardingChecklist initial={dto()} video={VIDEO} />);
    await user.click(screen.getByTestId("onboarding-video-open"));
    const video = screen.getByTestId("onboarding-video-player");
    fireEvent.ended(video);
    fireEvent.ended(video);
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith({ action: "video_watched" }),
    );
    expect(mockPost).toHaveBeenCalledTimes(1);
    // Progress unchanged — watching is never a completion signal.
    expect(screen.getByTestId("onboarding-progress-label")).toHaveTextContent(
      "1 of 5 steps done",
    );
  });

  it("closes on Escape and on the close button", async () => {
    const user = userEvent.setup();
    render(<OnboardingChecklist initial={dto()} video={VIDEO} />);
    await user.click(screen.getByTestId("onboarding-video-open"));
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("onboarding-video-modal")).toBeNull();
    await user.click(screen.getByTestId("onboarding-video-open"));
    await user.click(screen.getByTestId("onboarding-video-close"));
    expect(screen.queryByTestId("onboarding-video-modal")).toBeNull();
  });

  it("step CTA clicks record cta_clicked with the step key", async () => {
    const user = userEvent.setup();
    render(<OnboardingChecklist initial={dto()} video={null} />);
    await user.click(screen.getByTestId("onboarding-step-connect-cta"));
    expect(mockEvent).toHaveBeenCalledWith({
      event: "cta_clicked",
      stepKey: "connect",
    });
  });
});
