import { render, screen } from "@testing-library/react";
import { RunsEmptyState } from "@/features/runs/RunsEmptyState";

describe("RunsEmptyState", () => {
  it("renders the no-runs copy when no runs exist", () => {
    render(<RunsEmptyState kind="no-runs" />);
    expect(screen.getByTestId("runs-empty-state-no-runs")).toHaveTextContent(
      /no runs yet/i,
    );
    expect(
      screen.queryByTestId("runs-empty-state-no-matches"),
    ).toBeNull();
  });

  it("renders the no-matches copy when filters yield zero", () => {
    render(<RunsEmptyState kind="no-matches" />);
    expect(
      screen.getByTestId("runs-empty-state-no-matches"),
    ).toHaveTextContent(/nothing here/i);
    expect(screen.queryByTestId("runs-empty-state-no-runs")).toBeNull();
  });
});
