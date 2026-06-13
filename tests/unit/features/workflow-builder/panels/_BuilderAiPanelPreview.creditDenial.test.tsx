/**
 * Tests for the AI-credit denial rendering in `PlanFailure`
 * (features/workflow-builder/panels/_BuilderAiPanelPreview.tsx), Slice
 * 4.AI-CREDITS-3b-ii.
 *
 * Pure component test — the REAL `@/lib/api/ai` module is used (no mock), so this
 * pins the actual shipped `AI_CREDITS_EXHAUSTED_MESSAGE` copy AND the no-leak
 * suppression of the technical "Planner error: stage / code" detail line for a
 * credit denial. Other failure codes keep their detail line (regression guard).
 */
import { render, screen } from "@testing-library/react";
import { PlanFailure } from "@/features/workflow-builder/panels/_BuilderAiPanelPreview";
import { AI_CREDITS_EXHAUSTED_MESSAGE } from "@/lib/api/ai";

const creditDenial = {
  ok: false as const,
  code: "AI_CREDITS_EXHAUSTED",
  message: "You've used all your AI credits for this billing period.",
  errors: [
    { stage: "billing", code: "AI_CREDITS_EXHAUSTED", message: "AI credit limit reached." },
  ],
};

describe("PlanFailure — AI-credit denial (AI-CREDITS-3b-ii)", () => {
  it("renders the shared credit-specific message", () => {
    render(<PlanFailure failure={creditDenial} />);
    expect(screen.getByTestId("builder-ai-plan-failure")).toHaveTextContent(
      AI_CREDITS_EXHAUSTED_MESSAGE,
    );
  });

  it("does not fall through to the generic preview/parse/model copy", () => {
    render(<PlanFailure failure={creditDenial} />);
    expect(screen.getByTestId("builder-ai-plan-failure")).not.toHaveTextContent(
      /couldn’t preview|wrong format|isn’t available|text instead of the required JSON/i,
    );
  });

  it("suppresses the technical planner-error detail line (no billing internals leaked)", () => {
    render(<PlanFailure failure={creditDenial} />);
    expect(screen.queryByTestId("builder-ai-plan-failure-detail")).not.toBeInTheDocument();
    const text = screen.getByTestId("builder-ai-plan-failure").textContent ?? "";
    expect(text).not.toMatch(/Planner error/i);
    // The raw error code / stage are never surfaced (the friendly copy's "billing
    // period" wording is fine — we only guard against the technical token).
    expect(text).not.toContain("AI_CREDITS_EXHAUSTED");
  });

  it("no upgrade CTA / button is rendered — plain copy only", () => {
    render(<PlanFailure failure={creditDenial} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("regression: a PARSE_FAILED still shows its value-free detail line", () => {
    render(
      <PlanFailure
        failure={{
          ok: false,
          code: "PARSE_FAILED",
          message: "x",
          errors: [{ stage: "parse", code: "NOT_JSON", message: "bad" }],
        }}
      />,
    );
    expect(screen.getByTestId("builder-ai-plan-failure-detail")).toHaveTextContent(
      "Planner error: parse / NOT_JSON",
    );
  });
});
