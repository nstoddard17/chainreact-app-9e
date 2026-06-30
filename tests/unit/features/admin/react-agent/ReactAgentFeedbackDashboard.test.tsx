/**
 * Tests for features/admin/react-agent/ReactAgentFeedbackDashboard
 * (INTERNAL-FEEDBACK-1).
 *
 * Business rule: this slice ships an EMPTY, access-controlled shell — every
 * planned metric section renders the same honest "not connected" empty state and
 * NO fabricated numbers. These tests would fail if the shell ever shipped a fake
 * metric or dropped the empty-state copy.
 */
import { render, screen } from "@testing-library/react";
import { ReactAgentFeedbackDashboard } from "@/features/admin/react-agent/ReactAgentFeedbackDashboard";

const EMPTY_COPY =
  "React Agent feedback metrics will appear here once the metrics endpoint is connected.";

describe("ReactAgentFeedbackDashboard", () => {
  it("renders the titled, access-controlled shell", () => {
    render(<ReactAgentFeedbackDashboard />);
    expect(
      screen.getByRole("heading", { level: 1, name: "React Agent Feedback" }),
    ).toBeInTheDocument();
  });

  it("renders all five planned metric sections as headings", () => {
    render(<ReactAgentFeedbackDashboard />);
    for (const title of [
      "Overview",
      "Preview funnel",
      "Setup issues",
      "Test outcomes",
      "Recent agent attempts",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
    }
  });

  it("shows the not-connected empty state in every section (one per section)", () => {
    render(<ReactAgentFeedbackDashboard />);
    expect(screen.getAllByText(EMPTY_COPY)).toHaveLength(5);
  });

  it("renders no fabricated metric numbers (only the static range label)", () => {
    const { container } = render(<ReactAgentFeedbackDashboard />);
    const digits = (container.textContent ?? "").match(/\d/g) ?? [];
    // The only digit allowed in the shell is the "7" in the static "Last 7 days"
    // range placeholder — there are no real metrics yet.
    expect(digits).toEqual(["7"]);
  });
});
