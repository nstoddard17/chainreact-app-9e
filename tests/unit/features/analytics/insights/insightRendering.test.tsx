import { fireEvent, render, screen, within } from "@testing-library/react";
import { InsightKpi } from "@/features/analytics/insights/InsightKpi";
import { InsightLineChart } from "@/features/analytics/insights/InsightLineChart";
import { InsightDataTable } from "@/features/analytics/insights/InsightDataTable";
import { InsightResult } from "@/features/analytics/insights/InsightResult";
import { kpiResult, timeSeriesResult } from "./fixtures";

/**
 * KPI, line-chart, accessible-table, freshness, and completeness rendering
 * (CD-3A).
 */

describe("InsightKpi", () => {
  it("renders unit-aware values", () => {
    render(<InsightKpi result={kpiResult({ value: 1234 })} />);
    expect(screen.getByText("1,234")).toBeTruthy();
  });

  it("renders currency from the result's ISO code (zero-decimal correct)", () => {
    render(
      <InsightKpi
        result={kpiResult({ valueMeta: { unit: "currency", currency: "JPY" }, value: 5000 })}
      />,
    );
    expect(screen.getByText("¥5,000")).toBeTruthy();
  });

  it("null renders as unavailable, never zero", () => {
    render(<InsightKpi result={kpiResult({ value: null })} />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText(/No data to measure/)).toBeTruthy();
  });

  it("comparison uses neutral language and no good/bad coloring", () => {
    const { container } = render(
      <InsightKpi
        result={kpiResult({
          value: 150,
          compare: {
            previousValue: 100,
            previousRange: { from: "2026-05-01", to: "2026-06-01" },
          },
        })}
      />,
    );
    expect(screen.getByText(/Up 50% vs previous period/)).toBeTruthy();
    // Neutral trend: no success/destructive semantic classes on the note.
    expect(container.querySelector(".text-success")).toBeNull();
    expect(container.querySelector(".text-destructive")).toBeNull();
  });

  it("zero previous period is stated, not divided by", () => {
    render(
      <InsightKpi
        result={kpiResult({
          value: 5,
          compare: { previousValue: 0, previousRange: { from: "a", to: "b" } },
        })}
      />,
    );
    expect(screen.getByText(/Up from zero in the previous period/)).toBeTruthy();
  });
});

const BUCKETS = [
  { start: "2026-06-01", end: "2026-06-02", label: "Jun 1" },
  { start: "2026-06-02", end: "2026-06-03", label: "Jun 2" },
  { start: "2026-06-03", end: "2026-06-04", label: "Jun 3" },
];

describe("InsightLineChart", () => {
  it("renders one path per contiguous run and splits at nulls (no interpolation)", () => {
    const { container } = render(
      <InsightLineChart
        buckets={BUCKETS}
        series={[{ id: "a", label: "A", values: [1, null, 3] }]}
        valueMeta={{ unit: "count" }}
        ariaLabel="A over time"
      />,
    );
    const group = container.querySelector('[data-testid="insight-series-a"]')!;
    // Two isolated points (single-value segments) render as circles, no path
    // bridging the null gap.
    expect(group.querySelectorAll("path").length).toBe(0);
    expect(group.querySelectorAll("circle").length).toBe(2);
  });

  it("zero is drawn as a point on the line, not a gap", () => {
    const { container } = render(
      <InsightLineChart
        buckets={BUCKETS}
        series={[{ id: "a", label: "A", values: [1, 0, 3] }]}
        valueMeta={{ unit: "count" }}
        ariaLabel="A over time"
      />,
    );
    const group = container.querySelector('[data-testid="insight-series-a"]')!;
    expect(group.querySelectorAll("path").length).toBe(1); // one unbroken line
  });

  it("supports 8 series with a legend; toggling hides a line WITHOUT refetching", () => {
    const series = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`,
      label: `Series ${i}`,
      values: [i, i + 1, i + 2] as (number | null)[],
    }));
    const { container } = render(
      <InsightLineChart
        buckets={BUCKETS}
        series={series}
        valueMeta={{ unit: "count" }}
        ariaLabel="8 series"
      />,
    );
    expect(container.querySelectorAll('[data-testid^="insight-series-"]').length).toBe(8);
    const legend = screen.getByRole("list", { name: "Chart legend" });
    const toggle = within(legend).getByRole("listitem", { name: /Series 3/ });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelectorAll('[data-testid^="insight-series-"]').length).toBe(7);
    // Show it again.
    fireEvent.click(toggle);
    expect(container.querySelectorAll('[data-testid^="insight-series-"]').length).toBe(8);
  });

  it("keyboard arrows move the reading position and announce values", () => {
    render(
      <InsightLineChart
        buckets={BUCKETS}
        series={[{ id: "a", label: "Orders", values: [3, 0, 5] }]}
        valueMeta={{ unit: "count" }}
        ariaLabel="Orders over time"
      />,
    );
    const chart = screen.getByRole("group", { name: "Orders over time" });
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(screen.getByRole("status").textContent).toContain("Jun 1: Orders 3");
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(screen.getByRole("status").textContent).toContain("Jun 2: Orders 0");
    fireEvent.keyDown(chart, { key: "End" });
    expect(screen.getByRole("status").textContent).toContain("Jun 3: Orders 5");
    expect(screen.getByTestId("insight-chart-tooltip")).toBeTruthy();
  });
});

describe("InsightDataTable", () => {
  it("contains exactly the chart's buckets and values with correct units", () => {
    render(
      <InsightDataTable
        caption="Orders by day"
        buckets={BUCKETS}
        series={[
          { id: "a", label: "Paid", values: [3, null, 5] },
          { id: "b", label: "Refunded", values: [1, 2, 0] },
        ]}
        valueMeta={{ unit: "currency", currency: "USD" }}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("Paid")).toBeTruthy();
    expect(within(table).getByText("Refunded")).toBeTruthy();
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4); // header + 3 buckets
    expect(within(rows[1]!).getByText("Jun 1")).toBeTruthy();
    expect(within(rows[1]!).getByText("$3.00")).toBeTruthy();
    expect(within(rows[2]!).getByText("—")).toBeTruthy(); // null stays null in the table
    expect(within(rows[3]!).getByText("$0.00")).toBeTruthy(); // zero is zero
  });
});

describe("InsightResult freshness & completeness", () => {
  it("live data says live", () => {
    render(<InsightResult result={timeSeriesResult()} refreshError={null} />);
    expect(screen.getByText("Live Acme data")).toBeTruthy();
  });

  it("cached data shows its age; refresh appears for cached results", () => {
    const onRefresh = jest.fn();
    render(
      <InsightResult
        result={timeSeriesResult({
          freshness: { mode: "cached", ageSeconds: 300, ttlSeconds: 600 },
        })}
        refreshError={null}
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByText("Updated 5 minutes ago")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("server-stale fallback names the source and the data's age", () => {
    render(
      <InsightResult
        result={timeSeriesResult({
          freshness: { mode: "cached", ageSeconds: 1080, ttlSeconds: 600, stale: true },
        })}
        refreshError={null}
      />,
    );
    expect(
      screen.getByText("Acme couldn't refresh. Showing data from 18 minutes ago."),
    ).toBeTruthy();
  });

  it("a client-retained prior result is labeled, never shown as fresh", () => {
    render(
      <InsightResult
        result={timeSeriesResult()}
        refreshError={{ code: "PROVIDER_ERROR", message: "down" }}
      />,
    );
    expect(screen.getByText("Couldn't refresh — showing previously saved data.")).toBeTruthy();
  });

  it("scan-capped completeness is a visible badge with the newest-first disclosure", () => {
    render(
      <InsightResult
        result={timeSeriesResult({
          completeness: { state: "scan_capped", detail: "Counted the 2,000 most recent matching payments." },
          warnings: ["Only the 2,000 most recent matching payments were scanned."],
        })}
        refreshError={null}
      />,
    );
    const badge = screen.getByText("May be incomplete");
    expect(badge).toBeTruthy();
    // Data stays visible alongside the badge.
    expect(screen.getByRole("group", { name: /Orders by day/ })).toBeTruthy();
  });

  it("the accessible table toggle mirrors the chart exactly", () => {
    render(<InsightResult result={timeSeriesResult()} refreshError={null} />);
    fireEvent.click(screen.getByRole("button", { name: "View data" }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByText("5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View chart" }));
    expect(screen.queryByRole("table")).toBeNull();
  });
});
