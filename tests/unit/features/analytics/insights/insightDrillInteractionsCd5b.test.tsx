import { fireEvent, render, screen, within } from "@testing-library/react";
import { InsightResult } from "@/features/analytics/insights/InsightResult";
import type { InsightDrill } from "@/features/analytics/insights/insightRefine";
import { kpiResult, timeSeriesResult, categoricalResult } from "./fixtures";

/**
 * CD-5B — drill activation across chart types, driven ONLY by server-supplied
 * result data (row refinements, bucket boundaries, previous-window buckets).
 * Values without a refinement stay ordinary readable values everywhere.
 */

const REFINE_PAID = { filterKey: "status", filterValue: "paid", label: "Paid" };

function categoricalWithRefine() {
  return categoricalResult({
    rows: [
      { id: "paid", label: "Paid", value: 60, records: 60, refine: REFINE_PAID },
      { id: "refunded", label: "Refunded", value: 30, records: 30 }, // non-drillable
      { id: "void", label: "Void", value: 10, records: 10 },
    ],
  });
}

function comparedTimeSeries() {
  return timeSeriesResult({
    compareSeries: {
      previousRange: { from: "2026-05-01T00:00:00.000Z", to: "2026-06-01T00:00:00.000Z" },
      values: [2, 2, 2],
      buckets: [
        { start: "2026-05-01T00:00:00.000Z", end: "2026-05-02T00:00:00.000Z", label: "May 1" },
        { start: "2026-05-02T00:00:00.000Z", end: "2026-05-03T00:00:00.000Z", label: "May 2" },
        { start: "2026-05-03T00:00:00.000Z", end: "2026-05-04T00:00:00.000Z", label: "May 3" },
      ],
    },
  });
}

describe("bar chart drills", () => {
  it("click on a refinable category bar emits its server refinement", () => {
    const onExplore = jest.fn();
    const { container } = render(
      <InsightResult result={categoricalWithRefine()} chart="bar" refreshError={null} onExplore={onExplore} />,
    );
    fireEvent.click(container.querySelector('[data-testid="insight-bar-group-paid"]')!);
    expect(onExplore).toHaveBeenCalledWith({
      kind: "filter",
      refine: REFINE_PAID,
      fromSeries: false,
    });
  });

  it("click on a non-refinable bar does nothing, and it is not styled clickable", () => {
    const onExplore = jest.fn();
    const { container } = render(
      <InsightResult result={categoricalWithRefine()} chart="bar" refreshError={null} onExplore={onExplore} />,
    );
    const group = container.querySelector('[data-testid="insight-bar-group-refunded"]')!;
    fireEvent.click(group);
    expect(onExplore).not.toHaveBeenCalled();
    expect(group.getAttribute("data-drillable")).toBeNull();
  });

  it("click on a time bar emits the bucket's exact server boundaries", () => {
    const onExplore = jest.fn();
    const { container } = render(
      <InsightResult result={timeSeriesResult()} chart="bar" refreshError={null} onExplore={onExplore} />,
    );
    const first = container.querySelector('[data-testid^="insight-bar-group-"]')!;
    fireEvent.click(first);
    const drill = onExplore.mock.calls[0]![0] as InsightDrill;
    expect(drill.kind).toBe("bucket");
    if (drill.kind === "bucket") {
      // The fixture's bucket boundaries, verbatim — never recomputed.
      expect(drill.start).toBe("2026-06-01");
      expect(drill.end).toBe("2026-06-02");
      expect(drill.period).toBe("current");
    }
  });

  it("click on the paired previous bar emits the PREVIOUS window's own bucket", () => {
    const onExplore = jest.fn();
    const { container } = render(
      <InsightResult result={comparedTimeSeries()} chart="bar" refreshError={null} onExplore={onExplore} />,
    );
    fireEvent.click(container.querySelector('[data-testid^="insight-bar-compare-"]')!);
    const drill = onExplore.mock.calls[0]![0] as InsightDrill;
    expect(drill.kind).toBe("bucket");
    if (drill.kind === "bucket") {
      expect(drill.start).toBe("2026-05-01T00:00:00.000Z"); // its real dates
      expect(drill.period).toBe("previous");
    }
  });

  it("keyboard: Enter drills the active bar, Shift+Enter its previous pair", () => {
    const onExplore = jest.fn();
    const { container } = render(
      <InsightResult result={comparedTimeSeries()} chart="bar" refreshError={null} onExplore={onExplore} />,
    );
    const chart = container.querySelector('[data-testid="insight-bar-chart"]')!;
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    fireEvent.keyDown(chart, { key: "Enter" });
    fireEvent.keyDown(chart, { key: "Enter", shiftKey: true });
    const kinds = onExplore.mock.calls.map((c) => (c[0] as InsightDrill & { period?: string }).period);
    expect(kinds).toEqual(["current", "previous"]);
  });

  it("announces explore availability to assistive tech", () => {
    const onExplore = jest.fn();
    const { container } = render(
      <InsightResult result={comparedTimeSeries()} chart="bar" refreshError={null} onExplore={onExplore} />,
    );
    const chart = container.querySelector('[data-testid="insight-bar-chart"]')!;
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toMatch(/Press Enter to explore; Shift\+Enter for the previous period/);
  });

  it("renders no drill affordance at all without an exploration context", () => {
    const { container } = render(
      <InsightResult result={categoricalWithRefine()} chart="bar" refreshError={null} />,
    );
    expect(container.querySelector('[data-drillable="true"]')).toBeNull();
  });
});

describe("line chart drills", () => {
  it("Enter drills the active bucket; Shift+Enter the previous period's bucket", () => {
    const onExplore = jest.fn();
    render(
      <InsightResult result={comparedTimeSeries()} chart="line" refreshError={null} onExplore={onExplore} />,
    );
    const group = screen.getByRole("group");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    fireEvent.keyDown(group, { key: "Enter" });
    fireEvent.keyDown(group, { key: "Enter", shiftKey: true });
    const drills = onExplore.mock.calls.map((c) => c[0] as InsightDrill);
    expect(drills[0]!.kind).toBe("bucket");
    if (drills[0]!.kind === "bucket") expect(drills[0]!.period).toBe("current");
    if (drills[1]!.kind === "bucket") {
      expect(drills[1]!.period).toBe("previous");
      expect(drills[1]!.start).toBe("2026-05-01T00:00:00.000Z");
    }
  });

  it("previous points are not drillable when the result predates per-bucket previous boundaries", () => {
    const onExplore = jest.fn();
    render(
      <InsightResult
        result={timeSeriesResult({
          compareSeries: {
            previousRange: { from: "2026-05-01T00:00:00.000Z", to: "2026-06-01T00:00:00.000Z" },
            values: [2, 2, 2],
            // no buckets — e.g. a snapshot cached before CD-5B
          },
        })}
        chart="line"
        refreshError={null}
        onExplore={onExplore}
      />,
    );
    const group = screen.getByRole("group");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    fireEvent.keyDown(group, { key: "Enter", shiftKey: true });
    expect(onExplore).not.toHaveBeenCalled();
  });

  it("legend clicks keep toggling visibility, never exploration", () => {
    const onExplore = jest.fn();
    render(
      <InsightResult result={comparedTimeSeries()} chart="line" refreshError={null} onExplore={onExplore} />,
    );
    const legend = screen.getByRole("list", { name: "Chart legend" });
    fireEvent.click(within(legend).getByRole("listitem", { name: /Previous period/ }));
    expect(onExplore).not.toHaveBeenCalled();
  });
});

describe("donut drills", () => {
  it("renders an explicit Explore button only for refinable slices", () => {
    const onExplore = jest.fn();
    render(
      <InsightResult result={categoricalWithRefine()} chart="donut" refreshError={null} onExplore={onExplore} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Explore Paid" }));
    expect(onExplore).toHaveBeenCalledWith({ kind: "filter", refine: REFINE_PAID, fromSeries: false });
    expect(screen.queryByRole("button", { name: "Explore Refunded" })).toBeNull();
  });

  it("keyboard Enter drills the active slice when refinable", () => {
    const onExplore = jest.fn();
    const { container } = render(
      <InsightResult result={categoricalWithRefine()} chart="donut" refreshError={null} onExplore={onExplore} />,
    );
    const donut = container.querySelector('[data-testid="insight-donut"]')!;
    fireEvent.keyDown(donut, { key: "ArrowRight" }); // first slice = Paid
    fireEvent.keyDown(donut, { key: "Enter" });
    expect(onExplore).toHaveBeenCalledTimes(1);
    // Move to the non-refinable slice — Enter does nothing.
    fireEvent.keyDown(donut, { key: "ArrowRight" });
    fireEvent.keyDown(donut, { key: "Enter" });
    expect(onExplore).toHaveBeenCalledTimes(1);
  });
});

describe("table drills", () => {
  it("shows an accessible Explore action only for refinable rows; totals get none", () => {
    const onExplore = jest.fn();
    render(
      <InsightResult result={categoricalWithRefine()} chart="table" refreshError={null} onExplore={onExplore} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Explore Paid" }));
    expect(onExplore).toHaveBeenCalledWith({ kind: "filter", refine: REFINE_PAID, fromSeries: false });
    expect(screen.queryByRole("button", { name: /Explore Refunded/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Explore Total/ })).toBeNull();
  });

  it("time rows explore their exact bucket, matching graphical activation", () => {
    const onExplore = jest.fn();
    render(
      <InsightResult result={timeSeriesResult()} chart="table" refreshError={null} onExplore={onExplore} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Explore Jun 1" }));
    const drill = onExplore.mock.calls[0]![0] as InsightDrill;
    expect(drill).toEqual({
      kind: "bucket",
      start: "2026-06-01",
      end: "2026-06-02",
      label: "Jun 1",
      period: "current",
    });
  });

  it("keeps the sort header semantics untouched", () => {
    render(
      <InsightResult result={categoricalWithRefine()} chart="table" refreshError={null} onExplore={jest.fn()} />,
    );
    expect(
      screen.getByRole("columnheader", { name: "Orders" }).getAttribute("aria-sort"),
    ).toBe("descending");
  });
});

describe("KPI", () => {
  it("has no drill target by default", () => {
    render(<InsightResult result={kpiResult()} chart="kpi" refreshError={null} onExplore={jest.fn()} />);
    expect(screen.queryByRole("button", { name: /Explore/ })).toBeNull();
  });

  it("offers Explore previous period only when a comparison exists", () => {
    const onExplore = jest.fn();
    render(
      <InsightResult
        result={kpiResult({
          compare: {
            previousValue: 900,
            previousRange: { from: "2026-05-01T00:00:00.000Z", to: "2026-06-01T00:00:00.000Z" },
          },
        })}
        chart="kpi"
        refreshError={null}
        onExplore={onExplore}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Explore previous period" }));
    expect(onExplore).toHaveBeenCalledWith({
      kind: "previous_window",
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-06-01T00:00:00.000Z",
    });
  });
});
