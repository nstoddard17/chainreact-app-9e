import { fireEvent, render, screen, within } from "@testing-library/react";
import { InsightBarChart, preferHorizontal } from "@/features/analytics/insights/InsightBarChart";
import { InsightTableChart } from "@/features/analytics/insights/InsightTableChart";
import { InsightDonutChart } from "@/features/analytics/insights/InsightDonutChart";
import { InsightResult } from "@/features/analytics/insights/InsightResult";
import { categoricalResult, kpiResult, timeSeriesResult } from "./fixtures";

/**
 * CD-3B display types: bar, the user-selectable table, and the catalog-gated
 * donut. Shared CD-3A guarantees (unit/currency formatting, null-vs-zero,
 * freshness, completeness, series colors) must hold identically here.
 */

const GROUPS = [
  { id: "paid", label: "Paid", values: [60] as (number | null)[] },
  { id: "refunded", label: "Refunded", values: [30] as (number | null)[] },
  { id: "void", label: "Void", values: [0] as (number | null)[] },
];
const ONE_SERIES = [{ id: "value", label: "Orders" }];

describe("InsightBarChart", () => {
  it("renders one bar per category with unit-aware values", () => {
    render(
      <InsightBarChart
        groups={GROUPS}
        series={ONE_SERIES}
        valueMeta={{ unit: "count" }}
        ariaLabel="Orders by status"
      />,
    );
    expect(screen.getByTestId("insight-bar-paid-value")).toBeTruthy();
    expect(screen.getByTestId("insight-bar-refunded-value")).toBeTruthy();
    expect(screen.getByText("60")).toBeTruthy();
    // Zero is a real zero (a rendered bar), never a gap.
    expect(screen.getByTestId("insight-bar-void-value")).toBeTruthy();
  });

  it("renders currency and percent through the shared formatter", () => {
    const { unmount } = render(
      <InsightBarChart
        groups={[{ id: "a", label: "A", values: [1234.5] }]}
        series={ONE_SERIES}
        valueMeta={{ unit: "currency", currency: "EUR" }}
        ariaLabel="Amount"
      />,
    );
    expect(screen.getByText("€1,234.50")).toBeTruthy();
    unmount();
    render(
      <InsightBarChart
        groups={[{ id: "a", label: "A", values: [0.873] }]}
        series={ONE_SERIES}
        valueMeta={{ unit: "percent" }}
        ariaLabel="Rate"
      />,
    );
    expect(screen.getByText("87.3%")).toBeTruthy();
  });

  it("null is a gap — no bar drawn, an em dash reported", () => {
    render(
      <InsightBarChart
        groups={[{ id: "a", label: "A", values: [null] }]}
        series={ONE_SERIES}
        valueMeta={{ unit: "milliseconds" }}
        ariaLabel="Duration"
      />,
    );
    expect(screen.queryByTestId("insight-bar-a-value")).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("keeps the server's row order (the saved sort decides it, not the chart)", () => {
    render(
      <InsightBarChart
        groups={GROUPS}
        series={ONE_SERIES}
        valueMeta={{ unit: "count" }}
        ariaLabel="Orders by status"
      />,
    );
    const labels = screen
      .getAllByTestId(/^insight-bar-group-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(labels).toEqual([
      "insight-bar-group-paid",
      "insight-bar-group-refunded",
      "insight-bar-group-void",
    ]);
  });

  it("supports up to 8 series with a legend that toggles locally", () => {
    const series = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, label: `Series ${i}` }));
    render(
      <InsightBarChart
        groups={[{ id: "b1", label: "Jun 1", values: series.map((_, i) => i + 1) }]}
        series={series}
        valueMeta={{ unit: "count" }}
        ariaLabel="8 series"
        isTime
      />,
    );
    const legend = screen.getByRole("list", { name: "Chart legend" });
    const toggle = within(legend).getByRole("listitem", { name: /Series 3/ });
    expect(screen.getByTestId("insight-bar-b1-s3")).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("insight-bar-b1-s3")).toBeNull();
  });

  it("a single series shows no legend", () => {
    render(
      <InsightBarChart
        groups={GROUPS}
        series={ONE_SERIES}
        valueMeta={{ unit: "count" }}
        ariaLabel="Orders"
      />,
    );
    expect(screen.queryByRole("list", { name: "Chart legend" })).toBeNull();
  });

  it("keyboard navigation announces values and shows the tooltip", () => {
    render(
      <InsightBarChart
        groups={GROUPS}
        series={ONE_SERIES}
        valueMeta={{ unit: "count" }}
        ariaLabel="Orders by status"
      />,
    );
    const chart = screen.getByRole("group", { name: "Orders by status" });
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(screen.getByRole("status").textContent).toContain("Paid: Orders 60");
    expect(screen.getByTestId("insight-bar-tooltip")).toBeTruthy();
    fireEvent.keyDown(chart, { key: "End" });
    expect(screen.getByRole("status").textContent).toContain("Void: Orders 0");
    fireEvent.keyDown(chart, { key: "Escape" });
    expect(screen.queryByTestId("insight-bar-tooltip")).toBeNull();
  });

  describe("orientation (responsive label readability)", () => {
    it("time always reads left→right (vertical)", () => {
      expect(preferHorizontal(["Jun 1", "Jun 2"], 1200, true)).toBe(false);
    });
    it("horizontal for long names, many categories, or a narrow widget", () => {
      expect(preferHorizontal(["A really long workflow name"], 1200, false)).toBe(true);
      expect(preferHorizontal(["a", "b", "c", "d", "e", "f", "g"], 1200, false)).toBe(true);
      expect(preferHorizontal(["a", "b"], 320, false)).toBe(true);
    });
    it("vertical columns for a few short categories on a wide widget", () => {
      expect(preferHorizontal(["Paid", "Void"], 900, false)).toBe(false);
    });
    it("the chosen orientation is exposed on the chart element", () => {
      render(
        <InsightBarChart
          groups={[{ id: "a", label: "A really long category label", values: [1] }]}
          series={ONE_SERIES}
          valueMeta={{ unit: "count" }}
          ariaLabel="x"
        />,
      );
      expect(screen.getByTestId("insight-bar-chart").getAttribute("data-orientation")).toBe(
        "horizontal",
      );
    });
  });
});

describe("InsightTableChart (the selectable display)", () => {
  it("renders a categorical result with headers, total and record counts", () => {
    render(<InsightTableChart result={categoricalResult()} caption="Orders by status" />);
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Group" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Orders" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Records" })).toBeTruthy();
    expect(within(table).getByRole("rowheader", { name: "Paid" })).toBeTruthy();
    expect(within(table).getByRole("rowheader", { name: "Total" })).toBeTruthy();
    // Caption names the view for screen readers.
    expect(table.querySelector("caption")?.textContent).toBe("Orders by status");
  });

  it("renders time-series rows with one column per series + compare", () => {
    render(
      <InsightTableChart
        result={timeSeriesResult({
          series: [
            { id: "a", label: "Daily digest", values: [3, null, 5] },
            { id: "b", label: "Lead sync", values: [1, 2, 0] },
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
    expect(within(table).getByRole("columnheader", { name: "Period" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Daily digest" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Previous period" })).toBeTruthy();
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4); // header + 3 buckets
    // null stays "—", zero stays 0 — the distinction survives the table.
    expect(within(rows[2]!).getByText("—")).toBeTruthy();
    expect(within(rows[3]!).getByText("0")).toBeTruthy();
  });

  it("renders a KPI result as one labeled row", () => {
    render(<InsightTableChart result={kpiResult()} caption="Orders" />);
    expect(screen.getByRole("rowheader", { name: "Orders" })).toBeTruthy();
    expect(screen.getByText("1,234")).toBeTruthy();
  });

  it("formats currency and marks the sorted measure column", () => {
    render(
      <InsightTableChart
        result={categoricalResult({
          valueMeta: { unit: "currency", currency: "JPY" },
          rows: [{ id: "paid", label: "Paid", value: 5000 }],
          total: 5000,
        })}
        caption="Amount by status"
      />,
    );
    expect(screen.getAllByText("¥5,000").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("columnheader", { name: "Orders" }).getAttribute("aria-sort"),
    ).toBe("descending");
  });

  it("shows an empty state and never leaks internal row ids", () => {
    const { unmount } = render(
      <InsightTableChart result={categoricalResult({ rows: [], total: null })} caption="x" />,
    );
    expect(screen.getByText("No data in this range yet.")).toBeTruthy();
    unmount();
    const { container } = render(
      <InsightTableChart
        result={categoricalResult({
          rows: [{ id: "wf_9f8e7d6c", label: "Daily digest", value: 4 }],
          total: 4,
        })}
        caption="x"
      />,
    );
    expect(container.textContent).toContain("Daily digest");
    expect(container.textContent).not.toContain("wf_9f8e7d6c");
  });

  it("scrolls locally rather than widening the page", () => {
    const { container } = render(
      <InsightTableChart result={categoricalResult()} caption="x" />,
    );
    expect(container.querySelector(".overflow-auto")).toBeTruthy();
  });
});

describe("InsightDonutChart", () => {
  it("renders one slice per row with labels, values and shares as text", () => {
    render(<InsightDonutChart result={categoricalResult()} ariaLabel="Orders by status" />);
    expect(screen.getByTestId("insight-donut-slice-paid")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Slices" });
    // Identity + value are readable without hover and without color.
    expect(within(list).getByText("Paid")).toBeTruthy();
    const paidRow = within(list).getByText("Paid").closest("li")!;
    expect(paidRow.textContent).toContain("60");
    expect(paidRow.textContent).toContain("(60%)");
    expect(within(list).getByText("Refunded").closest("li")!.textContent).toContain("(30%)");
  });

  it("suppresses percentages when completeness is not complete", () => {
    render(
      <InsightDonutChart
        result={categoricalResult({
          completeness: { state: "scan_capped", detail: "Counted the 2,000 most recent." },
        })}
        ariaLabel="Orders by status"
      />,
    );
    expect(screen.queryByText(/60%/)).toBeNull();
    expect(screen.getByText(/isn't shown as a share of the total/)).toBeTruthy();
    // Partial data stays visible.
    expect(screen.getByTestId("insight-donut-slice-paid")).toBeTruthy();
  });

  it("never invents an Other slice — it discloses the omission instead", () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: `g${i}`,
      label: `Group ${i}`,
      value: 11 - i,
    }));
    render(
      <InsightDonutChart result={categoricalResult({ rows, total: 66 })} ariaLabel="x" />,
    );
    expect(screen.queryByText("Other")).toBeNull();
    expect(screen.getByText(/8 largest groups of 11/)).toBeTruthy();
    expect(screen.queryByText(/%\)/)).toBeNull(); // no misleading shares
    expect(screen.getAllByTestId(/^insight-donut-slice-/)).toHaveLength(8);
  });

  it("keyboard moves through slices; empty results say so", () => {
    const { unmount } = render(
      <InsightDonutChart result={categoricalResult()} ariaLabel="Orders by status" />,
    );
    const group = screen.getByRole("group", { name: "Orders by status" });
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(screen.getByTestId("insight-donut")).toBeTruthy();
    unmount();
    render(<InsightDonutChart result={categoricalResult({ rows: [] })} ariaLabel="x" />);
    expect(screen.getByText("No data in this range yet.")).toBeTruthy();
  });
});

describe("InsightResult dispatch by saved chart intent", () => {
  it("draws the persisted chart type, not the result shape's default", () => {
    const { unmount } = render(
      <InsightResult result={categoricalResult()} chart="bar" refreshError={null} />,
    );
    expect(screen.getByTestId("insight-bar-chart")).toBeTruthy();
    unmount();

    const donut = render(
      <InsightResult result={categoricalResult()} chart="donut" refreshError={null} />,
    );
    expect(screen.getByTestId("insight-donut")).toBeTruthy();
    donut.unmount();

    render(<InsightResult result={categoricalResult()} chart="table" refreshError={null} />);
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("every graphical type offers the same accessible data view", () => {
    for (const chart of ["bar", "donut"] as const) {
      const view = render(
        <InsightResult result={categoricalResult()} chart={chart} refreshError={null} />,
      );
      fireEvent.click(screen.getByRole("button", { name: "View data" }));
      const table = screen.getByRole("table");
      expect(within(table).getByText("Paid")).toBeTruthy();
      expect(within(table).getByText("60")).toBeTruthy();
      view.unmount();
    }
  });

  it("the selectable table has no redundant data toggle", () => {
    render(<InsightResult result={categoricalResult()} chart="table" refreshError={null} />);
    expect(screen.queryByRole("button", { name: "View data" })).toBeNull();
  });

  it("freshness and completeness surface identically for the new types", () => {
    render(
      <InsightResult
        result={categoricalResult({
          freshness: { mode: "cached", ageSeconds: 300, ttlSeconds: 600 },
          completeness: { state: "row_capped", detail: "Showing the most active groups." },
        })}
        chart="bar"
        refreshError={null}
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByText("Updated 5 minutes ago")).toBeTruthy();
    expect(screen.getByText("Top groups only")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });
});
