import { render, screen, within } from "@testing-library/react";
import { InsightBarChart } from "@/features/analytics/insights/InsightBarChart";
import { InsightTableChart } from "@/features/analytics/insights/InsightTableChart";
import { InsightKpi } from "@/features/analytics/insights/InsightKpi";
import { InsightResult } from "@/features/analytics/insights/InsightResult";
import {
  computeInsightChange,
  describeInsightChange,
  formatChangeAbsolute,
  formatChangePercent,
} from "@/features/analytics/insights/insightCompare";
import { kpiResult, timeSeriesResult, categoricalResult } from "./fixtures";

/**
 * CD-5A — previous-period comparison across chart types.
 *
 * The headline fix: a time BAR chart with comparison on used to render nothing
 * while its own "View data" table showed a Previous-period column. These tests
 * pin the paired bars, the shared change semantics, and the two shapes where
 * comparison must stay unavailable because the contract carries no data for it.
 */

const COUNT = { unit: "count" } as const;

describe("shared change semantics", () => {
  it("computes an absolute change and a fractional percent", () => {
    expect(computeInsightChange(120, 100)).toEqual({ absolute: 20, percent: 0.2 });
    expect(computeInsightChange(80, 100)).toEqual({ absolute: -20, percent: -0.2 });
  });

  it("refuses a percentage when the previous value is zero", () => {
    // Not "∞%" and not "100%" — the rise is real, the ratio is not defined.
    expect(computeInsightChange(5, 0)).toEqual({ absolute: 5, percent: null });
  });

  it("refuses both when either side is missing", () => {
    expect(computeInsightChange(null, 100)).toEqual({ absolute: null, percent: null });
    expect(computeInsightChange(100, null)).toEqual({ absolute: null, percent: null });
  });

  it("uses the magnitude of a negative baseline as the denominator", () => {
    expect(computeInsightChange(-50, -100)).toEqual({ absolute: 50, percent: 0.5 });
  });

  it("formats change with an explicit sign, and nothing when undefined", () => {
    expect(formatChangePercent(0.125)).toBe("+12.5%");
    expect(formatChangePercent(-0.04)).toBe("−4%");
    expect(formatChangePercent(null)).toBe("");
    expect(formatChangeAbsolute(3, COUNT)).toBe("+3");
    expect(formatChangeAbsolute(-3, COUNT)).toBe("−3");
    expect(formatChangeAbsolute(null, COUNT)).toBe("");
  });

  it("describes each edge case in neutral language", () => {
    expect(describeInsightChange(112, 100, COUNT)).toMatch(/Up 12% vs previous period/);
    expect(describeInsightChange(96, 100, COUNT)).toMatch(/Down 4% vs previous period/);
    expect(describeInsightChange(100, 100, COUNT)).toMatch(/Unchanged/);
    expect(describeInsightChange(5, 0, COUNT)).toBe("Up from zero in the previous period");
    expect(describeInsightChange(0, 0, COUNT)).toBe("Unchanged from the previous period");
    expect(describeInsightChange(5, null, COUNT)).toBe("No data in the previous period");
    expect(describeInsightChange(null, 42, COUNT)).toBe("Previous period: 42");
  });

  it("never calls a rise good or a fall bad", () => {
    const copy = [
      describeInsightChange(112, 100, COUNT),
      describeInsightChange(88, 100, COUNT),
      describeInsightChange(5, 0, COUNT),
    ].join(" ");
    expect(copy).not.toMatch(/good|bad|better|worse|improved|declined|success/i);
  });
});

describe("KPI comparison", () => {
  it("states the change without good/bad coloring", () => {
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
    expect(screen.getByRole("note").textContent).toMatch(/Up 50% vs previous period/);
    expect(container.querySelector(".text-success")).toBeNull();
    expect(container.querySelector(".text-destructive")).toBeNull();
  });

  it("states a zero baseline instead of dividing by it", () => {
    render(
      <InsightKpi
        result={kpiResult({
          value: 7,
          compare: { previousValue: 0, previousRange: { from: "2026-05-01", to: "2026-06-01" } },
        })}
      />,
    );
    expect(screen.getByRole("note").textContent).toBe("Up from zero in the previous period");
  });
});

describe("bar chart comparison (the CD-5A gap)", () => {
  const groups = [
    { id: "b1", label: "Jun 1", values: [3] },
    { id: "b2", label: "Jun 2", values: [5] },
  ];
  const series = [{ id: "all", label: "Orders" }];

  it("draws a paired previous bar for every bucket", () => {
    const { container } = render(
      <InsightBarChart
        groups={groups}
        series={series}
        valueMeta={COUNT}
        ariaLabel="Orders by day"
        isTime
        compareValues={[2, 4]}
      />,
    );
    expect(container.querySelector('[data-testid="insight-bar-compare-b1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="insight-bar-compare-b2"]')).toBeTruthy();
  });

  it("distinguishes the previous period by pattern, not by color alone", () => {
    const { container } = render(
      <InsightBarChart
        groups={groups}
        series={series}
        valueMeta={COUNT}
        ariaLabel="Orders by day"
        isTime
        compareValues={[2, 4]}
      />,
    );
    const bar = container.querySelector('[data-testid="insight-bar-compare-b1"]') as HTMLElement;
    // jsdom's CSSOM drops gradient/max() values, so the non-color treatment is
    // declared in the DOM rather than asserted through computed style.
    expect(bar.getAttribute("data-compare-pattern")).toBe("hatched");
  });

  it("labels the previous period in the legend and lets it be toggled", () => {
    render(
      <InsightBarChart
        groups={groups}
        series={series}
        valueMeta={COUNT}
        ariaLabel="Orders by day"
        isTime
        compareValues={[2, 4]}
      />,
    );
    const legend = screen.getByRole("list", { name: "Chart legend" });
    const entry = within(legend).getByRole("listitem", { name: /Previous period/ });
    expect(entry.getAttribute("aria-pressed")).toBe("true");
  });

  it("leaves a null previous bucket as a gap, not a zero bar", () => {
    const { container } = render(
      <InsightBarChart
        groups={groups}
        series={series}
        valueMeta={COUNT}
        ariaLabel="Orders by day"
        isTime
        compareValues={[null, 4]}
      />,
    );
    expect(container.querySelector('[data-testid="insight-bar-compare-b1"]')).toBeNull();
    expect(container.querySelector('[data-testid="insight-bar-compare-b2"]')).toBeTruthy();
  });

  it("shows no comparison legend when there is no comparison", () => {
    render(
      <InsightBarChart
        groups={groups}
        series={series}
        valueMeta={COUNT}
        ariaLabel="Orders by day"
        isTime
      />,
    );
    expect(screen.queryByRole("list", { name: "Chart legend" })).toBeNull();
  });

  it("passes comparison to a time bar chart but never to a categorical one", () => {
    const { container: timeContainer } = render(
      <InsightResult
        result={timeSeriesResult({
          compareSeries: {
            previousRange: { from: "2026-05-01", to: "2026-06-01" },
            values: [1, 1, 1],
          },
        })}
        chart="bar"
        refreshError={null}
      />,
    );
    expect(timeContainer.querySelector('[data-testid^="insight-bar-compare-"]')).toBeTruthy();

    // A categorical result has no per-row previous value in the contract.
    const { container: catContainer } = render(
      <InsightResult result={categoricalResult()} chart="bar" refreshError={null} />,
    );
    expect(catContainer.querySelector('[data-testid^="insight-bar-compare-"]')).toBeNull();
  });
});

describe("table comparison", () => {
  it("adds Previous period, Change and Change % for a single-series time table", () => {
    render(
      <InsightTableChart
        result={timeSeriesResult({
          series: [{ id: "all", label: "Orders", values: [10, 20, 0] }],
          compareSeries: {
            previousRange: { from: "2026-05-01", to: "2026-06-01" },
            values: [8, null, 0],
          },
        })}
        caption="Orders by day"
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Previous period" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Change" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Change %" })).toBeTruthy();
    const rows = within(table).getAllByRole("row");
    // 10 vs 8 → +2 / +25%
    expect(within(rows[1]!).getByText("+2")).toBeTruthy();
    expect(within(rows[1]!).getByText("+25%")).toBeTruthy();
  });

  it("omits Change columns when a multi-series shape makes the change ambiguous", () => {
    render(
      <InsightTableChart
        result={timeSeriesResult({
          series: [
            { id: "a", label: "Digest", values: [3, 1, 5] },
            { id: "b", label: "Sync", values: [1, 2, 0] },
          ],
          compareSeries: {
            previousRange: { from: "2026-05-01", to: "2026-06-01" },
            values: [2, 2, 2],
          },
        })}
        caption="Runs by day"
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Previous period" })).toBeTruthy();
    expect(within(table).queryByRole("columnheader", { name: "Change" })).toBeNull();
    expect(within(table).queryByRole("columnheader", { name: "Change %" })).toBeNull();
  });

  it("shows a KPI's previous value and change as labelled rows", () => {
    render(
      <InsightTableChart
        result={kpiResult({
          value: 120,
          compare: {
            previousValue: 100,
            previousRange: { from: "2026-05-01", to: "2026-06-01" },
          },
        })}
        caption="Orders"
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByRole("rowheader", { name: "Previous period" })).toBeTruthy();
    expect(within(table).getByRole("rowheader", { name: "Change" })).toBeTruthy();
    expect(within(table).getByText(/Up 20% vs previous period/)).toBeTruthy();
  });

  it("keeps null and zero distinct in the change columns", () => {
    render(
      <InsightTableChart
        result={timeSeriesResult({
          series: [{ id: "all", label: "Orders", values: [10, 20, 0] }],
          compareSeries: {
            previousRange: { from: "2026-05-01", to: "2026-06-01" },
            values: [8, null, 0],
          },
        })}
        caption="Orders by day"
      />,
    );
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    // A null previous value yields no change and no percentage.
    expect(within(rows[2]!).getAllByText("—").length).toBeGreaterThanOrEqual(2);
    // Zero vs zero is a real, computable "no change" — the change reads 0, and
    // only the PERCENTAGE is withheld (a zero baseline has no defined ratio).
    expect(within(rows[3]!).getAllByText("0").length).toBeGreaterThanOrEqual(3);
    expect(within(rows[3]!).getAllByText("—")).toHaveLength(1);
  });
});

describe("resolved windows are stated", () => {
  it("shows the window the result covers and the one it is compared with", () => {
    render(
      <InsightResult
        result={kpiResult({
          value: 10,
          range: { from: "2026-06-01T00:00:00.000Z", to: "2026-07-01T00:00:00.000Z" },
          compare: {
            previousValue: 8,
            previousRange: {
              from: "2026-05-02T00:00:00.000Z",
              to: "2026-06-01T00:00:00.000Z",
            },
          },
        })}
        refreshError={null}
      />,
    );
    // Read back as INCLUSIVE calendar days, not the exclusive boundary.
    const notes = screen.getAllByRole("note").map((n) => n.textContent ?? "");
    const period = notes.find((t) => t.includes("Jun 1, 2026"));
    expect(period).toBeTruthy();
    expect(period).toContain("Jun 30, 2026");
    expect(period).toContain("May 2, 2026");
    expect(period).toContain("May 31, 2026");
  });
});
