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

  // RUN-VISIBILITY-1 — the durable-queue non-terminal states are now visible.
  it("renders the Queued label for status='queued'", () => {
    render(<RunStatusBadge status="queued" />);
    const badge = screen.getByTestId("run-status-badge-queued");
    expect(badge).toHaveTextContent(/queued/i);
  });

  it("renders the Running label for status='running'", () => {
    render(<RunStatusBadge status="running" />);
    const badge = screen.getByTestId("run-status-badge-running");
    expect(badge).toHaveTextContent(/running/i);
  });
});
