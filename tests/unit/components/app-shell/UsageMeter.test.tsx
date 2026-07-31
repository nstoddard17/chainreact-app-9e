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

/**
 * RESPONSIVE-FOUNDATION-1 §9 — narrow-width behaviour.
 *
 * The meter used to be `hidden … lg:flex`: below 1024px the account's remaining
 * usage simply vanished with nothing in its place. That is a hard cut, not a
 * responsive behaviour, and it removes exactly the signal a user near their limit
 * needs. A compact presentation of the SAME fetched data now renders alongside
 * it, with CSS choosing which one is visible — no second fetch, no duplicated
 * state, no viewport JavaScript in the shell.
 */
describe("UsageMeter — compact narrow variant", () => {
  it("renders a compact readout that survives below the full meter's breakpoint", async () => {
    fetchReturns(summaryOf({ used: 30, limit: 100 }, { used: 5, limit: 200 }));
    render(<UsageMeter />);

    const full = await screen.findByTestId("usage-meter");
    const compact = screen.getByTestId("usage-meter-compact");
    // The full meter hides below lg; the compact one hides at lg and above.
    expect(full.className).toContain("lg:flex");
    expect(full.className).toContain("hidden");
    expect(compact.className).toContain("lg:hidden");
    // Same destination, so usage detail is never unreachable on a narrow screen.
    expect(compact).toHaveAttribute("href", "/account?section=billing");
  });

  it("surfaces the pool closest to exhaustion, not a hard-coded dimension", async () => {
    // AI is at 90% while tasks sit at 30% — AI is what the user needs to see.
    fetchReturns(summaryOf({ used: 30, limit: 100 }, { used: 180, limit: 200 }));
    render(<UsageMeter />);
    const compact = await screen.findByTestId("usage-meter-compact");
    expect(compact).toHaveAttribute("data-dimension", "ai");
    expect(compact).toHaveTextContent("20");
    expect(compact.className).toMatch(/amber/);
  });

  it("switches to tasks when tasks are the tighter pool", async () => {
    fetchReturns(summaryOf({ used: 95, limit: 100 }, { used: 5, limit: 200 }));
    render(<UsageMeter />);
    const compact = await screen.findByTestId("usage-meter-compact");
    expect(compact).toHaveAttribute("data-dimension", "tasks");
    expect(compact).toHaveTextContent("5");
  });

  it("names the remaining figure for assistive tech rather than relying on the bar", async () => {
    fetchReturns(summaryOf({ used: 30, limit: 100 }, null));
    render(<UsageMeter />);
    const compact = await screen.findByTestId("usage-meter-compact");
    expect(compact.getAttribute("aria-label")).toMatch(/70 tasks left/i);
  });

  it("stays absent entirely when there is no real usage data", async () => {
    fetchReturns(summaryOf(null, null));
    const { container } = render(<UsageMeter />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    // No compact fallback either — honest-by-construction still wins.
    expect(container).toBeEmptyDOMElement();
  });
});
