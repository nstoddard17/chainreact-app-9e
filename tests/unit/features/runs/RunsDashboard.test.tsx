import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RunListItem } from "@/contracts/workflow";

const mockListRuns = jest.fn();
jest.mock("@/lib/api/runs", () => ({
  // Re-export the real RunApiError so `instanceof` checks inside the
  // dashboard keep working.
  RunApiError: jest.requireActual("@/lib/api/runs").RunApiError,
  listRuns: (...args: unknown[]) => mockListRuns(...args),
}));

import { RunsDashboard } from "@/features/runs/RunsDashboard";

function fixtureRun(overrides: Partial<RunListItem> = {}): RunListItem {
  const base: RunListItem = {
    id: "11111111-1111-1111-1111-111111111111",
    workflowId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    workflowName: "Slack new-lead alert",
    status: "succeeded",
    isTest: false,
    triggeredBy: "manual",
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    finishedAt: new Date(Date.now()).toISOString(),
    durationMs: 60_000,
    errorClassification: null,
  };
  return { ...base, ...overrides };
}

beforeEach(() => {
  mockListRuns.mockReset();
});

describe("RunsDashboard — empty / list", () => {
  it("renders the no-runs empty state when initial list is empty", () => {
    render(<RunsDashboard initialRuns={[]} />);
    expect(screen.getByTestId("runs-empty-state-no-runs")).toBeInTheDocument();
    expect(screen.queryByTestId("runs-list")).toBeNull();
  });

  it("renders one row per real-fixture run (test runs hidden by default)", () => {
    render(
      <RunsDashboard
        initialRuns={[
          fixtureRun({ id: "r1", workflowName: "Workflow A" }),
          fixtureRun({ id: "r2", workflowName: "Workflow B", status: "failed" }),
          fixtureRun({ id: "r3", workflowName: "Test workflow", isTest: true }),
        ]}
      />,
    );
    const list = screen.getByTestId("runs-list");
    expect(list).toBeInTheDocument();
    expect(screen.getByTestId("runs-row-r1")).toBeInTheDocument();
    expect(screen.getByTestId("runs-row-r2")).toBeInTheDocument();
    // r3 (isTest) is hidden by the default-off "Include test runs" toggle.
    expect(screen.queryByTestId("runs-row-r3")).toBeNull();
  });

  it("reveals isTest rows when the Include test runs toggle is on", async () => {
    const user = userEvent.setup();
    render(
      <RunsDashboard
        initialRuns={[
          fixtureRun({ id: "real", workflowName: "Real workflow" }),
          fixtureRun({ id: "test", workflowName: "Test workflow", isTest: true }),
        ]}
      />,
    );
    expect(screen.queryByTestId("runs-row-test")).toBeNull();
    const toggle = screen
      .getByTestId("runs-include-test-toggle")
      .querySelector("input") as HTMLInputElement;
    await user.click(toggle);
    expect(screen.getByTestId("runs-row-test")).toBeInTheDocument();
  });
});

describe("RunsDashboard — filters", () => {
  const runs = [
    fixtureRun({
      id: "ok-manual",
      workflowName: "Manual ok",
      status: "succeeded",
      triggeredBy: "manual",
    }),
    fixtureRun({
      id: "fail-webhook",
      workflowName: "Webhook fail",
      status: "failed",
      triggeredBy: "webhook",
    }),
    fixtureRun({
      id: "ok-scheduled",
      workflowName: "Cron ok",
      status: "succeeded",
      triggeredBy: "scheduled",
    }),
  ];

  it("status filter narrows the list to one status", async () => {
    const user = userEvent.setup();
    render(<RunsDashboard initialRuns={runs} />);
    await user.click(screen.getByTestId("runs-status-filter-failed"));
    expect(screen.queryByTestId("runs-row-ok-manual")).toBeNull();
    expect(screen.queryByTestId("runs-row-ok-scheduled")).toBeNull();
    expect(screen.getByTestId("runs-row-fail-webhook")).toBeInTheDocument();
  });

  it("source filter narrows to a specific triggered_by", async () => {
    const user = userEvent.setup();
    render(<RunsDashboard initialRuns={runs} />);
    await user.selectOptions(
      screen.getByTestId("runs-source-filter") as HTMLSelectElement,
      "scheduled",
    );
    expect(screen.queryByTestId("runs-row-ok-manual")).toBeNull();
    expect(screen.queryByTestId("runs-row-fail-webhook")).toBeNull();
    expect(screen.getByTestId("runs-row-ok-scheduled")).toBeInTheDocument();
  });

  it("search by workflow name (case-insensitive) narrows the list", async () => {
    const user = userEvent.setup();
    render(<RunsDashboard initialRuns={runs} />);
    await user.type(screen.getByTestId("runs-search-input"), "webhook");
    expect(screen.queryByTestId("runs-row-ok-manual")).toBeNull();
    expect(screen.queryByTestId("runs-row-ok-scheduled")).toBeNull();
    expect(screen.getByTestId("runs-row-fail-webhook")).toBeInTheDocument();
  });

  it("renders the no-matches empty state when filters yield zero (but runs exist)", async () => {
    const user = userEvent.setup();
    render(<RunsDashboard initialRuns={runs} />);
    await user.type(screen.getByTestId("runs-search-input"), "no-such-workflow");
    expect(
      screen.getByTestId("runs-empty-state-no-matches"),
    ).toBeInTheDocument();
  });
});

describe("RunsDashboard — refresh + error", () => {
  it("Refresh calls listRuns() and replaces the list with the new data", async () => {
    const user = userEvent.setup();
    mockListRuns.mockResolvedValueOnce([
      fixtureRun({ id: "fresh", workflowName: "Fresh workflow" }),
    ]);
    render(
      <RunsDashboard
        initialRuns={[fixtureRun({ id: "stale", workflowName: "Stale workflow" })]}
      />,
    );
    await user.click(screen.getByTestId("runs-refresh-button"));
    await waitFor(() => {
      expect(screen.getByTestId("runs-row-fresh")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("runs-row-stale")).toBeNull();
    expect(mockListRuns).toHaveBeenCalledTimes(1);
  });

  it("shows the error banner + Retry button when listRuns() fails", async () => {
    const user = userEvent.setup();
    mockListRuns.mockRejectedValueOnce(new Error("boom"));
    render(
      <RunsDashboard
        initialRuns={[fixtureRun({ id: "stale" })]}
      />,
    );
    await user.click(screen.getByTestId("runs-refresh-button"));
    await waitFor(() => {
      expect(screen.getByTestId("runs-dashboard-error")).toBeInTheDocument();
    });
    expect(screen.getByTestId("runs-dashboard-retry")).toBeInTheDocument();

    // Retry succeeds → banner clears, new data lands.
    mockListRuns.mockResolvedValueOnce([
      fixtureRun({ id: "after-retry", workflowName: "Retry success" }),
    ]);
    await user.click(screen.getByTestId("runs-dashboard-retry"));
    await waitFor(() => {
      expect(screen.queryByTestId("runs-dashboard-error")).toBeNull();
    });
    expect(screen.getByTestId("runs-row-after-retry")).toBeInTheDocument();
  });

  it("does NOT render Retry/Replay/Cancel CTAs on rows (unsupported actions stay invisible)", () => {
    render(
      <RunsDashboard
        initialRuns={[fixtureRun({ id: "r-actions" })]}
      />,
    );
    const row = screen.getByTestId("runs-row-r-actions");
    // No retry/replay/cancel anywhere on the row.
    for (const label of [/retry/i, /replay/i, /cancel/i]) {
      // The dashboard-level Retry only shows on error; ensure none of
      // these strings leak into the row markup.
      expect(row).not.toHaveTextContent(label);
    }
  });
});
