import { render, screen } from "@testing-library/react";
import { RunStatusBadge } from "@/features/runs/RunStatusBadge";

describe("RunStatusBadge", () => {
  it("renders the Succeeded label for status='succeeded'", () => {
    render(<RunStatusBadge status="succeeded" />);
    const badge = screen.getByTestId("run-status-badge-succeeded");
    expect(badge).toHaveTextContent(/succeeded/i);
  });

  it("renders the Failed label for status='failed'", () => {
    render(<RunStatusBadge status="failed" />);
    const badge = screen.getByTestId("run-status-badge-failed");
    expect(badge).toHaveTextContent(/failed/i);
  });
});
