/**
 * Tests for features/admin/react-agent/ReactAgentFeedbackDashboard
 * (INTERNAL-FEEDBACK-2).
 *
 * Business rule: the dashboard renders REAL aggregate counts from the internal
 * metrics API (honest zeros when empty), a working date-range control that
 * refetches, and a fail-safe error state with retry. It renders numbers + fixed
 * labels only — never any prompt/summary/content (the DTO carries none).
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactAgentFeedbackDashboard } from "@/features/admin/react-agent/ReactAgentFeedbackDashboard";
import { EMPTY_REACT_AGENT_METRICS, type ReactAgentMetrics } from "@/contracts/internalReactAgent";

const mockFetch = jest.fn();
jest.mock("@/lib/api/internalReactAgent", () => ({
  fetchReactAgentMetrics: (...a: unknown[]) => mockFetch(...a),
  InternalReactAgentApiError: class extends Error {},
}));

const METRICS: ReactAgentMetrics = {
  range: { from: null, to: null },
  totals: { agentChanges: 100, governanceEvents: 50 },
  previewFunnel: { created: 40, applied: 25, keptAsPreview: 5, discarded: 8, applyFailed: 3, undone: 2 },
  testOutcomes: { tested: 10, testFailed: 4 },
  setupIssues: { changesWithIssues: 3, totalIssues: 6, workflowsNeedingSetup: 2 },
  governance: { byOutcome: { success: 45, denied: 3, failed: 2 } },
};

beforeEach(() => {
  mockFetch.mockReset();
});

function sectionByTitle(title: string) {
  return screen.getByRole("heading", { level: 2, name: title }).closest("section") as HTMLElement;
}

describe("ReactAgentFeedbackDashboard", () => {
  it("renders the titled shell and real counts after load", async () => {
    mockFetch.mockResolvedValue(METRICS);
    render(<ReactAgentFeedbackDashboard />);

    expect(
      screen.getByRole("heading", { level: 1, name: "React Agent Feedback" }),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Overview" })).toBeInTheDocument(),
    );
    // Real values land in the right sections.
    expect(within(sectionByTitle("Overview")).getByText("100")).toBeInTheDocument();
    expect(within(sectionByTitle("Preview funnel")).getByText("40")).toBeInTheDocument();
    expect(within(sectionByTitle("Setup issues")).getByText("6")).toBeInTheDocument();
    expect(within(sectionByTitle("Test outcomes")).getByText("10")).toBeInTheDocument();
    expect(within(sectionByTitle("Governance outcomes")).getByText("45")).toBeInTheDocument();
  });

  it("renders honest zeros for empty telemetry", async () => {
    mockFetch.mockResolvedValue(EMPTY_REACT_AGENT_METRICS);
    render(<ReactAgentFeedbackDashboard />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Overview" })).toBeInTheDocument(),
    );
    // Every stat is 0 — no placeholders / fake numbers.
    const overview = sectionByTitle("Overview");
    expect(within(overview).getAllByText("0").length).toBeGreaterThan(0);
  });

  it("defaults to a 7-day range (passes a from bound) and refetches All time with no bound", async () => {
    mockFetch.mockResolvedValue(EMPTY_REACT_AGENT_METRICS);
    render(<ReactAgentFeedbackDashboard />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(mockFetch.mock.calls[0][0]).toHaveProperty("from");

    await userEvent.click(screen.getByRole("button", { name: "All time" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(mockFetch.mock.calls[1][0]).toEqual({}); // all time → no date bound
  });

  it("shows a fail-safe error with retry when the fetch fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(METRICS);
    render(<ReactAgentFeedbackDashboard />);

    await waitFor(() => expect(screen.getByText(/Couldn't load React Agent metrics/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Overview" })).toBeInTheDocument(),
    );
  });

  it("renders labels + numbers only — no content fields", async () => {
    mockFetch.mockResolvedValue(METRICS);
    const { container } = render(<ReactAgentFeedbackDashboard />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Overview" })).toBeInTheDocument(),
    );
    const text = container.textContent ?? "";
    for (const forbidden of ["prompt", "summary", "failure_reason", "diff", "SECRET"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
