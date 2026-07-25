/**
 * HELP-CENTER-CONTEXTUAL-1 — onboarding-checklist Help Center links.
 *
 * Pins: each expanded step renders a restrained "Learn how" link to its
 * permanent quick-start article, the primary CTA (and its analytics click
 * event) is unchanged, clicking the help link fires NO onboarding event,
 * and completed steps render no help link.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OnboardingStepDTO } from "@/contracts/onboarding";
import { OnboardingStepRow } from "@/features/onboarding/OnboardingStepRow";

const mockPostEvent = jest.fn();
jest.mock("@/lib/api/onboarding", () => ({
  postOnboardingEvent: (...a: unknown[]) => mockPostEvent(...a),
}));

beforeEach(() => mockPostEvent.mockReset());

function renderStep(step: OnboardingStepDTO, expanded = true) {
  return render(
    <ol>
      <OnboardingStepRow step={step} expanded={expanded} onFocus={() => {}} />
    </ol>,
  );
}

const EXPECTED: ReadonlyArray<[OnboardingStepDTO["key"], string]> = [
  ["connect", "/help/connect-an-app"],
  ["configure", "/help/configure-workflow-steps"],
  ["test", "/help/test-a-workflow"],
  ["activate", "/help/turn-on-a-workflow"],
];

describe("OnboardingStepRow — Learn how links", () => {
  it.each(EXPECTED)("expanded %s step links its permanent article", (key, href) => {
    renderStep({
      key,
      status: "current",
      ...(key === "test" ? { testable: true } : {}),
      ctaWorkflowId: "wf-1",
      ctaWorkflowName: "Lead intake",
    } as OnboardingStepDTO);
    const help = screen.getByTestId(`onboarding-step-${key}-help-link`);
    expect(help).toHaveAttribute("href", href);
    expect(help).toHaveTextContent("Learn how");
  });

  it("create step renders its article link too (alongside the chooser slot)", () => {
    render(
      <ol>
        <OnboardingStepRow
          step={{ key: "create", status: "current" } as OnboardingStepDTO}
          expanded
          onFocus={() => {}}
          createChooser={<button data-testid="mock-chooser">New workflow</button>}
        />
      </ol>,
    );
    expect(screen.getByTestId("mock-chooser")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-step-create-help-link")).toHaveAttribute(
      "href",
      "/help/create-your-first-workflow",
    );
  });

  it("primary CTA keeps its destination and analytics; the help link fires no event", async () => {
    const user = userEvent.setup();
    renderStep({
      key: "connect",
      status: "current",
    } as OnboardingStepDTO);
    const cta = screen.getByTestId("onboarding-step-connect-cta");
    expect(cta).toHaveTextContent("Open Apps");
    await user.click(cta);
    expect(mockPostEvent).toHaveBeenCalledWith({ event: "cta_clicked", stepKey: "connect" });
    mockPostEvent.mockClear();
    await user.click(screen.getByTestId("onboarding-step-connect-help-link"));
    expect(mockPostEvent).not.toHaveBeenCalled();
  });

  it("completed steps render no help link", () => {
    renderStep({ key: "connect", status: "complete" } as OnboardingStepDTO, false);
    expect(
      screen.queryByTestId("onboarding-step-connect-help-link"),
    ).not.toBeInTheDocument();
  });
});
