/**
 * @jest-environment jsdom
 *
 * components/templates/TemplateUseSummary (CS-XT-MARKETPLACE-UX-DETAIL). The reusable summary
 * block shared by the marketplace details dialog + the builder create/replace confirmation.
 * Proves it renders ONLY safe derived metadata (category, trigger kind, required apps, step
 * count, humanized chain) + the right "what happens next" copy per variant, and never leaks raw
 * type ids / JSON / config.
 */
import { render, screen } from "@testing-library/react";
import { TemplateUseSummary } from "@/components/templates/TemplateUseSummary";
import type { TemplateCardMeta } from "@/contracts/workflowTemplate";

const card: TemplateCardMeta = {
  nodeCount: 3,
  stepCount: 2,
  triggerKind: "scheduled",
  providers: ["google-analytics", "slack"],
  category: "reporting",
  steps: [
    { kind: "trigger", provider: "native", type: "schedule.fired" },
    { kind: "action", provider: "google-analytics", type: "run_report" },
    { kind: "action", provider: "slack", type: "send_channel_message" },
  ],
};

it("renders derived metadata: category, trigger kind, step count, required apps, chain", () => {
  render(<TemplateUseSummary description="Weekly analytics report." card={card} variant="use" />);
  expect(screen.getByText("Weekly analytics report.")).toBeInTheDocument();
  expect(screen.getByTestId("summary-category")).toHaveTextContent("Reporting");
  expect(screen.getByTestId("summary-trigger-kind")).toHaveTextContent("Scheduled");
  expect(screen.getByTestId("summary-step-count")).toHaveTextContent("2 steps");
  expect(screen.getByTestId("summary-provider-google-analytics")).toHaveTextContent("Google Analytics");
  expect(screen.getByTestId("summary-provider-slack")).toHaveTextContent("Slack");
  // humanized chain (no raw type ids)
  const chain = screen.getByTestId("summary-chain");
  expect(chain).toHaveTextContent("Google Analytics: Run report");
  expect(chain).toHaveTextContent("Slack: Send channel message");
});

it("never shows raw type ids / config / JSON (humanized only)", () => {
  const { container } = render(<TemplateUseSummary description="x" card={card} variant="use" />);
  expect(container.innerHTML).not.toContain("schedule.fired");
  expect(container.innerHTML).not.toContain("run_report");
  expect(container.innerHTML).not.toContain("send_channel_message");
  expect(container.innerHTML).not.toContain('"config"');
});

it("shows the shared reassurance copy in every variant", () => {
  for (const variant of ["use", "create", "replace"] as const) {
    const { unmount } = render(<TemplateUseSummary description="x" card={card} variant={variant} />);
    const box = screen.getByTestId("summary-what-happens-next");
    expect(box).toHaveTextContent(/connect apps and fill in required fields after the workflow is created/i);
    expect(box).toHaveTextContent(/does not copy credentials or account-specific settings/i);
    unmount();
  }
});

it("uses variant-specific lead copy (use / create / replace)", () => {
  const { rerender } = render(<TemplateUseSummary card={card} variant="use" />);
  expect(screen.getByTestId("summary-what-happens-next")).toHaveTextContent(/creates a new workflow from this template/i);

  rerender(<TemplateUseSummary card={card} variant="create" />);
  expect(screen.getByTestId("summary-what-happens-next")).toHaveTextContent(/creates a new workflow from this template and opens it/i);

  rerender(<TemplateUseSummary card={card} variant="replace" />);
  expect(screen.getByTestId("summary-what-happens-next")).toHaveTextContent(
    /replace the current workflow draft with the selected template/i,
  );
});

it("degrades gracefully when card metadata is absent (copy still shows)", () => {
  render(<TemplateUseSummary description="No card." variant="use" />);
  expect(screen.queryByTestId("summary-category")).toBeNull();
  expect(screen.queryByTestId("summary-chain")).toBeNull();
  expect(screen.getByTestId("summary-what-happens-next")).toBeInTheDocument();
});
