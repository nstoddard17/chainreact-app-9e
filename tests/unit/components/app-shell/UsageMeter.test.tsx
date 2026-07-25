/**
 * Tests for the app-shell header UsageMeter (HEADER-USAGE-VISIBILITY-1).
 * Mocks global fetch; builds responses through the REAL
 * computeAccountUsageSummary so the component is exercised against the exact
 * shape GET /api/account/usage returns.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { UsageMeter } from "@/components/app-shell/UsageMeter";
import { computeAccountUsageSummary } from "@/core/billing/accountUsageSummary";

const NOW = new Date("2026-07-15T12:00:00Z");

function summaryOf(
  tasks: { used: number; limit: number } | null,
  aiCredits: { used: number; limit: number } | null,
  billingMode: "standard" | "internal_free" = "standard",
) {
  return computeAccountUsageSummary({
    billingMode,
    tasks: tasks ? { ...tasks, periodStartedAt: "2026-07-01T00:00:00Z" } : null,
    aiCredits: aiCredits
      ? { ...aiCredits, periodStartedAt: "2026-07-01T00:00:00Z" }
      : null,
    now: NOW,
  });
}

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

function fetchReturns(usage: unknown, ok = true) {
  mockFetch.mockResolvedValueOnce({
    ok,
    json: async () => ({ usage }),
  });
}

describe("UsageMeter", () => {
  it("renders tasks + AI credits remaining and links to Plan & billing", async () => {
    fetchReturns(summaryOf({ used: 30, limit: 100 }, { used: 5, limit: 200 }));
    render(<UsageMeter />);

    const meter = await screen.findByTestId("usage-meter");
    expect(meter).toHaveAttribute("href", "/account?section=billing");
    expect(screen.getByTestId("usage-meter-tasks-remaining")).toHaveTextContent(
      "70 left",
    );
    expect(screen.getByTestId("usage-meter-ai-remaining")).toHaveTextContent(
      "195 left",
    );
    expect(mockFetch).toHaveBeenCalledWith("/api/account/usage");
  });

  it("goes amber when a dimension is near its limit", async () => {
    fetchReturns(summaryOf({ used: 85, limit: 100 }, { used: 0, limit: 200 }));
    render(<UsageMeter />);

    const remaining = await screen.findByTestId("usage-meter-tasks-remaining");
    expect(remaining).toHaveTextContent("15 left");
    expect(remaining.className).toMatch(/amber/);
    // The healthy AI dimension stays neutral.
    expect(
      screen.getByTestId("usage-meter-ai-remaining").className,
    ).not.toMatch(/amber/);
  });

  it("shows 0 left when exhausted", async () => {
    fetchReturns(summaryOf({ used: 100, limit: 100 }, { used: 0, limit: 200 }));
    render(<UsageMeter />);
    const remaining = await screen.findByTestId("usage-meter-tasks-remaining");
    expect(remaining).toHaveTextContent("0 left");
    expect(remaining.className).toMatch(/amber/);
  });

  it("renders NOTHING when the fetch fails — no fake meter in the header", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));
    const { container } = render(<UsageMeter />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders NOTHING on a non-ok response", async () => {
    fetchReturns(undefined, false);
    const { container } = render(<UsageMeter />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders NOTHING when neither dimension is available (no billing row)", async () => {
    fetchReturns(summaryOf(null, null));
    const { container } = render(<UsageMeter />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
