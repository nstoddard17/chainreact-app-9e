import { act, render, screen } from "@testing-library/react";
import {
  BarRows,
  CHART_COLORS,
  DonutChart,
  DonutPlot,
  Heatmap,
  HeatmapPlot,
  LineChart,
  LinePlot,
  Sparkline,
  SparklinePlot,
} from "@/components/analytics/charts";
import { Widget } from "@/features/analytics/Widget";
import type { AnalyticsWidget } from "@/contracts/analytics";
import {
  ANALYTICS_HEATMAP_CELL_GAP,
  heatmapExtent,
} from "@/core/analytics/chartSizing";

/**
 * Chart responsiveness (ANALYTICS-RESPONSIVE-CHART-SURFACES-1).
 *
 * jsdom lays out nothing, so these tests assert the two things that ARE
 * decidable without a browser: the geometry each `*Plot` emits for a given box,
 * and the container contract of the widget shell. The bounding-box proof — that
 * the painted chart really is inside its body — is the Chromium suite's job
 * (`tests/browser/analytics/chartSurfaces.spec.ts`).
 */

// ── shared harness ───────────────────────────────────────────────────────────

type ObserverCallback = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;
let observers: { el: Element; cb: ObserverCallback }[] = [];

function resizeAllTo(width: number, height: number) {
  act(() => {
    for (const { el, cb } of observers) {
      cb(
        [{ target: el, contentRect: { width, height } } as unknown as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    }
  });
}

beforeEach(() => {
  observers = [];
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    constructor(private readonly cb: ObserverCallback) {}
    observe(el: Element) {
      observers.push({ el, cb: this.cb });
    }
    disconnect() {
      observers = [];
    }
    unobserve() {}
  };
  // Synchronous frames: the surface coalesces into one animation frame, and a
  // resize has to be observable inside the same `act`.
  jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0);
    return 0;
  });
});

afterEach(() => jest.restoreAllMocks());

/** Every drawn coordinate in an SVG path/shape, as numbers. */
function pathNumbers(d: string): number[] {
  return (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

const num = (el: Element, attr: string) => Number(el.getAttribute(attr));

// ── Runs over time ───────────────────────────────────────────────────────────

const RUNS = [4, 9, 2, 140, 7, 3];

describe("LinePlot — Runs over time", () => {
  const series = [{ name: "Successful runs", data: RUNS, color: CHART_COLORS.success }];
  const labels = ["Jun 10", "Jun 11", "Jun 12", "Jun 13", "Jun 14", "Jun 15"];

  const renderAt = (width: number, height: number) =>
    render(
      <LinePlot series={series} labels={labels} width={width} height={height} ariaLabel="Runs over time" />,
    );

  it("paints into the size it was given, with no aspect-ratio stretch", () => {
    renderAt(660, 117);
    const svg = screen.getByTestId("analytics-line-chart");
    expect(svg.getAttribute("width")).toBe("660");
    expect(svg.getAttribute("height")).toBe("117");
    expect(svg.getAttribute("viewBox")).toBe("0 0 660 117");
    // The old chart's `preserveAspectRatio="none"` + missing height is exactly
    // what made a 660px-wide widget render a ~240px-tall SVG in a 117px body.
    expect(svg.getAttribute("preserveAspectRatio")).toBeNull();
  });

  it.each([
    [1370, 117],
    [660, 117],
    [320, 100],
    [270, 117],
    [660, 321],
  ])("keeps every drawn coordinate inside a %ix%i body", (width, height) => {
    renderAt(width, height);
    const svg = screen.getByTestId("analytics-line-chart");
    for (const path of Array.from(svg.querySelectorAll("path"))) {
      const values = pathNumbers(path.getAttribute("d") ?? "");
      expect(values.length).toBeGreaterThan(0);
      for (const v of values) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
    for (const line of Array.from(svg.querySelectorAll("line"))) {
      expect(num(line, "x1")).toBeGreaterThanOrEqual(0);
      expect(num(line, "x2")).toBeLessThanOrEqual(width);
      expect(num(line, "y1")).toBeGreaterThanOrEqual(0);
      expect(num(line, "y1")).toBeLessThanOrEqual(height);
    }
    for (const text of Array.from(svg.querySelectorAll("text"))) {
      expect(num(text, "x")).toBeGreaterThanOrEqual(0);
      expect(num(text, "x")).toBeLessThanOrEqual(width);
      expect(num(text, "y")).toBeLessThanOrEqual(height);
      expect(num(text, "y")).toBeGreaterThanOrEqual(0);
    }
  });

  it("never clips the highest data point", () => {
    renderAt(660, 117);
    const stroke = Array.from(
      screen.getByTestId("analytics-line-chart").querySelectorAll("path"),
    ).find((p) => p.getAttribute("fill") === "none")!;
    const values = pathNumbers(stroke.getAttribute("d") ?? "");
    const ys = values.filter((_, i) => i % 2 === 1);
    // The peak sits at the top margin, strictly inside the box — not above it.
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeLessThan(117 / 2);
  });

  it("keeps the last point's x inside the right edge", () => {
    renderAt(660, 200);
    const stroke = Array.from(
      screen.getByTestId("analytics-line-chart").querySelectorAll("path"),
    ).find((p) => p.getAttribute("fill") === "none")!;
    const values = pathNumbers(stroke.getAttribute("d") ?? "");
    const xs = values.filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs)).toBeLessThan(660);
    expect(Math.max(...xs)).toBeGreaterThan(660 * 0.9);
  });

  it("expands horizontally with the widget", () => {
    const lastX = (width: number) => {
      const view = renderAt(width, 200);
      const stroke = Array.from(
        screen.getByTestId("analytics-line-chart").querySelectorAll("path"),
      ).find((p) => p.getAttribute("fill") === "none")!;
      const xs = pathNumbers(stroke.getAttribute("d") ?? "").filter((_, i) => i % 2 === 0);
      const max = Math.max(...xs);
      view.unmount();
      return max;
    };
    expect(lastX(1370)).toBeGreaterThan(lastX(660));
    expect(lastX(660)).toBeGreaterThan(lastX(320));
  });

  it("reduces tick density in compact mode and shortens the date labels", () => {
    const wide = renderAt(1370, 321);
    const wideTicks = screen.getByTestId("analytics-line-chart").querySelectorAll("line").length;
    expect(screen.getByText("Jun 10")).toBeTruthy();
    wide.unmount();

    renderAt(270, 96);
    const narrow = screen.getByTestId("analytics-line-chart");
    expect(narrow.querySelectorAll("line").length).toBeLessThan(wideTicks);
    // Compact axes drop the month and keep the distinguishing day.
    expect(screen.queryByText("Jun 10")).toBeNull();
    expect(screen.getByText("10")).toBeTruthy();
  });

  it("renders safely for zero, one and many points", () => {
    const empty = render(
      <LinePlot series={[{ name: "s", data: [] }]} labels={[]} width={400} height={150} ariaLabel="a" />,
    );
    expect(screen.getByTestId("analytics-line-chart")).toBeTruthy();
    expect(screen.getByTestId("analytics-line-chart").querySelectorAll("path")).toHaveLength(0);
    empty.unmount();

    const single = render(
      <LinePlot series={[{ name: "s", data: [7] }]} labels={["Jun 10"]} width={400} height={150} ariaLabel="a" />,
    );
    // One reading has no line, so it is drawn as a point rather than nothing.
    expect(screen.getByTestId("analytics-line-chart").querySelectorAll("circle")).toHaveLength(1);
    single.unmount();

    render(
      <LinePlot series={[{ name: "s", data: RUNS }]} labels={labels} width={400} height={150} ariaLabel="a" />,
    );
    expect(
      Array.from(screen.getByTestId("analytics-line-chart").querySelectorAll("path")).length,
    ).toBeGreaterThan(0);
  });

  it("declines to draw an impossible box rather than emitting negative geometry", () => {
    render(<LinePlot series={series} labels={labels} width={30} height={12} ariaLabel="a" />);
    expect(screen.queryByTestId("analytics-line-chart")).toBeNull();
  });
});

describe("LineChart — shell", () => {
  it("keeps the legend out of the plot's measured region", () => {
    render(
      <div style={{ position: "relative" }}>
        <LineChart
          series={[{ name: "Successful runs", data: RUNS }]}
          labels={["a", "b", "c", "d", "e", "f"]}
        />
      </div>,
    );
    const surface = screen.getByTestId("analytics-line-surface");
    const legend = screen.getByText("Successful runs").closest("div")!;
    // The legend is a SIBLING of the measured surface, so the plot never has to
    // guess how much room it took.
    expect(surface.contains(legend)).toBe(false);
    expect(legend.className).toContain("shrink-0");
  });

  it("redraws the plot when its body changes size", () => {
    render(
      <div style={{ position: "relative" }}>
        <LineChart series={[{ name: "s", data: RUNS }]} labels={["a", "b", "c", "d", "e", "f"]} />
      </div>,
    );
    resizeAllTo(660, 200);
    expect(screen.getByTestId("analytics-line-chart").getAttribute("width")).toBe("660");
    resizeAllTo(300, 110);
    expect(screen.getByTestId("analytics-line-chart").getAttribute("width")).toBe("300");
    expect(screen.getByTestId("analytics-line-chart").getAttribute("height")).toBe("110");
  });
});

// ── Sparklines ───────────────────────────────────────────────────────────────

describe("Sparkline", () => {
  const data = [3, 8, 5, 12, 9];

  it("fills the width it is given instead of a fixed 140px stamp", () => {
    render(<SparklinePlot data={data} width={520} height={44} />);
    const svg = screen.getByTestId("analytics-sparkline");
    expect(svg.getAttribute("width")).toBe("520");
    expect(svg.getAttribute("viewBox")).toBe("0 0 520 44");
  });

  it("widens when the card widens and narrows when it narrows", () => {
    render(
      <div style={{ position: "relative", display: "flex" }}>
        <Sparkline data={data} />
      </div>,
    );
    resizeAllTo(520, 44);
    expect(num(screen.getByTestId("analytics-sparkline"), "width")).toBe(520);
    resizeAllTo(180, 30);
    expect(num(screen.getByTestId("analytics-sparkline"), "width")).toBe(180);
    expect(num(screen.getByTestId("analytics-sparkline"), "height")).toBe(30);
  });

  it("keeps the first and last points inside the SVG box", () => {
    render(<SparklinePlot data={data} width={520} height={44} />);
    const svg = screen.getByTestId("analytics-sparkline");
    const stroke = Array.from(svg.querySelectorAll("path")).find(
      (p) => p.getAttribute("fill") === "none",
    )!;
    const values = pathNumbers(stroke.getAttribute("d") ?? "");
    const xs = values.filter((_, i) => i % 2 === 0);
    const ys = values.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(520);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(44);

    // The end dot too — including its radius.
    const dot = svg.querySelector("circle")!;
    expect(num(dot, "cx") + num(dot, "r")).toBeLessThanOrEqual(520);
    expect(num(dot, "cy") + num(dot, "r")).toBeLessThanOrEqual(44);
  });

  it("draws nothing for a single reading rather than a misleading flat line", () => {
    render(<SparklinePlot data={[5]} width={300} height={40} />);
    expect(screen.queryByTestId("analytics-sparkline")).toBeNull();
  });
});

// ── Donut ────────────────────────────────────────────────────────────────────

const SEGMENTS = [
  { label: "Succeeded", value: 1810, color: CHART_COLORS.success },
  { label: "Failed", value: 33, color: CHART_COLORS.danger },
];

describe("DonutChart", () => {
  it("derives its radius from the box and stays circular", () => {
    render(<DonutPlot segments={SEGMENTS} center="98%" sublabel="successful" diameter={160} ariaLabel="a" />);
    const svg = screen.getByTestId("analytics-donut");
    expect(svg.getAttribute("width")).toBe("160");
    expect(svg.getAttribute("height")).toBe("160");
    const ring = svg.querySelector("circle")!;
    const r = num(ring, "r");
    const stroke = num(ring, "stroke-width");
    expect(r + stroke / 2).toBeLessThan(80);
    expect(num(ring, "cx")).toBe(80);
    expect(num(ring, "cy")).toBe(80);
  });

  it("grows the ring with the body", () => {
    const view = render(
      <DonutPlot segments={SEGMENTS} center="98%" sublabel="s" diameter={100} ariaLabel="a" />,
    );
    const small = num(screen.getByTestId("analytics-donut").querySelector("circle")!, "r");
    view.unmount();
    render(<DonutPlot segments={SEGMENTS} center="98%" sublabel="s" diameter={260} ariaLabel="a" />);
    const large = num(screen.getByTestId("analytics-donut").querySelector("circle")!, "r");
    expect(large).toBeGreaterThan(small);
  });

  it("keeps the centre readout centred", () => {
    render(<DonutPlot segments={SEGMENTS} center="98%" sublabel="successful" diameter={180} ariaLabel="a" />);
    const texts = Array.from(screen.getByTestId("analytics-donut").querySelectorAll("text"));
    for (const t of texts) {
      expect(num(t, "x")).toBe(90);
      expect(t.getAttribute("text-anchor")).toBe("middle");
    }
    expect(screen.getByText("98%")).toBeTruthy();
  });

  it("puts the legend beside the ring when wide and beneath it when narrow", () => {
    render(
      <div style={{ position: "relative" }}>
        <DonutChart segments={SEGMENTS} center="98%" sublabel="successful" />
      </div>,
    );
    resizeAllTo(660, 190);
    expect(screen.getByTestId("analytics-donut-layout").dataset["donutOrientation"]).toBe("side");
    resizeAllTo(210, 190);
    expect(screen.getByTestId("analytics-donut-layout").dataset["donutOrientation"]).toBe("stacked");
  });

  it("keeps every value readable as text in both orientations", () => {
    render(
      <div style={{ position: "relative" }}>
        <DonutChart segments={SEGMENTS} center="98%" sublabel="successful" />
      </div>,
    );
    for (const [w, h] of [
      [660, 190],
      [210, 190],
      [270, 117],
    ] as const) {
      resizeAllTo(w, h);
      expect(screen.getByText("Succeeded")).toBeTruthy();
      expect(screen.getByText("Failed")).toBeTruthy();
      // The centre readout and the legend share the majority share's number.
      expect(screen.getAllByText("98%").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("2%").length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ── Horizontal bars ──────────────────────────────────────────────────────────

const BAR_ROWS = [
  { label: "A very long automation name that would overflow a narrow card", value: 900 },
  { label: "Welcome flow", value: 420 },
  { label: "Nightly sync", value: 210 },
  { label: "Invoice chase", value: 120 },
  { label: "Lead router", value: 60 },
  { label: "Digest mailer", value: 30 },
];

describe("BarRows", () => {
  it("gives the bar every pixel the label and value do not use", () => {
    render(<BarRows rows={BAR_ROWS} width={660} height={300} />);
    const row = screen.getAllByTestId("analytics-bar-row")[0]!;
    expect(row.style.gridTemplateColumns).toMatch(/^minmax\(0, \d+px\) minmax\(0, 1fr\) auto$/);
    // No fixed pixel bar width anywhere — the fill is a percentage of the track.
    expect(screen.getAllByTestId("analytics-bar-fill")[0]!.style.width).toBe("100%");
  });

  it("bounds the label column so a long name cannot overflow the row", () => {
    render(<BarRows rows={BAR_ROWS} width={270} height={200} />);
    const row = screen.getAllByTestId("analytics-bar-row")[0]!;
    const labelPx = Number(/minmax\(0, (\d+)px\)/.exec(row.style.gridTemplateColumns)![1]);
    expect(labelPx).toBeLessThan(270);
    const label = row.firstElementChild!;
    expect(label.className).toContain("truncate");
    // The full name stays available rather than being lost to truncation.
    expect(label.getAttribute("title")).toBe(BAR_ROWS[0]!.label);
  });

  it("widens the bar track as the card widens", () => {
    const labelWidthAt = (width: number) => {
      const view = render(<BarRows rows={BAR_ROWS} width={width} height={200} />);
      const row = screen.getAllByTestId("analytics-bar-row")[0]!;
      const px = Number(/minmax\(0, (\d+)px\)/.exec(row.style.gridTemplateColumns)![1]);
      view.unmount();
      return px;
    };
    expect(labelWidthAt(1370)).toBeGreaterThan(labelWidthAt(270));
  });

  it("keeps values visible at every size", () => {
    for (const [w, h] of [
      [1370, 300],
      [660, 117],
      [270, 117],
    ] as const) {
      const view = render(<BarRows rows={BAR_ROWS} width={w} height={h} />);
      expect(screen.getByText("900")).toBeTruthy();
      view.unmount();
    }
  });

  it("says so rather than silently dropping rows it cannot fit", () => {
    render(<BarRows rows={BAR_ROWS} width={660} height={300} />);
    expect(screen.getAllByTestId("analytics-bar-row")).toHaveLength(6);
    expect(screen.queryByTestId("analytics-bar-overflow-note")).toBeNull();

    const cramped = render(<BarRows rows={BAR_ROWS} width={660} height={56} />);
    const shown = cramped.container.querySelectorAll('[data-testid="analytics-bar-row"]').length;
    expect(shown).toBeLessThan(6);
    expect(shown).toBeGreaterThan(0);
    expect(
      cramped.container.querySelector('[data-testid="analytics-bar-overflow-note"]')!.textContent,
    ).toContain(`+${6 - shown} more`);
  });

  it("drops the width transition while a resize is in flight", () => {
    const still = render(<BarRows rows={BAR_ROWS} width={660} height={200} animate />);
    expect(screen.getAllByTestId("analytics-bar-fill")[0]!.className).toContain("transition-[width]");
    still.unmount();
    render(<BarRows rows={BAR_ROWS} width={660} height={200} animate={false} />);
    expect(screen.getAllByTestId("analytics-bar-fill")[0]!.className).not.toContain(
      "transition-[width]",
    );
  });
});

// ── Heatmap ──────────────────────────────────────────────────────────────────

const CELLS = Array.from({ length: 16 * 7 }, (_, i) => i % 5);

describe("Heatmap", () => {
  const cellSizeOf = () => Number(screen.getByTestId("analytics-heatmap").dataset["heatmapCell"]);

  it("grows its cells with the container and shrinks them again", () => {
    const small = render(<HeatmapPlot cells={CELLS} maxCell={4} width={300} height={100} />);
    const smallCell = cellSizeOf();
    small.unmount();
    render(<HeatmapPlot cells={CELLS} maxCell={4} width={660} height={280} />);
    expect(cellSizeOf()).toBeGreaterThan(smallCell);
  });

  it("no longer sits at the old fixed 14px cell in a large widget", () => {
    render(<HeatmapPlot cells={CELLS} maxCell={4} width={660} height={280} />);
    expect(cellSizeOf()).toBeGreaterThan(14);
  });

  it("keeps cells square and the whole matrix inside the body", () => {
    for (const [w, h] of [
      [300, 100],
      [660, 280],
      [1370, 117],
      [270, 117],
    ] as const) {
      const view = render(<HeatmapPlot cells={CELLS} maxCell={4} width={w} height={h} />);
      const svg = screen.getByTestId("analytics-heatmap");
      const cell = cellSizeOf();
      expect(num(svg, "width")).toBe(heatmapExtent(16, cell, ANALYTICS_HEATMAP_CELL_GAP));
      expect(num(svg, "height")).toBe(heatmapExtent(7, cell, ANALYTICS_HEATMAP_CELL_GAP));
      expect(num(svg, "width")).toBeLessThanOrEqual(w);
      expect(num(svg, "height")).toBeLessThanOrEqual(h);
      for (const rect of Array.from(svg.querySelectorAll("rect"))) {
        expect(num(rect, "width")).toBe(num(rect, "height"));
        expect(num(rect, "x") + num(rect, "width")).toBeLessThanOrEqual(num(svg, "width"));
        expect(num(rect, "y") + num(rect, "height")).toBeLessThanOrEqual(num(svg, "height"));
      }
      view.unmount();
    }
  });

  it("renders every cell of the matrix", () => {
    render(<HeatmapPlot cells={CELLS} maxCell={4} width={660} height={280} />);
    expect(screen.getByTestId("analytics-heatmap").querySelectorAll("rect")).toHaveLength(
      CELLS.length,
    );
  });

  it("keeps the legend outside the measured matrix region", () => {
    render(
      <div style={{ position: "relative" }}>
        <Heatmap cells={CELLS} maxCell={4} />
      </div>,
    );
    resizeAllTo(660, 260);
    const surface = screen.getByTestId("analytics-heatmap-surface");
    const legend = screen.getByText("Less").parentElement!;
    expect(surface.contains(legend)).toBe(false);
    expect(legend.className).toContain("shrink-0");
    expect(screen.getByText("More")).toBeTruthy();
  });

  it("remeasures when the widget resizes", () => {
    render(
      <div style={{ position: "relative" }}>
        <Heatmap cells={CELLS} maxCell={4} />
      </div>,
    );
    resizeAllTo(660, 260);
    const big = cellSizeOf();
    resizeAllTo(300, 90);
    expect(cellSizeOf()).toBeLessThan(big);
  });
});

// ── Widget shell ─────────────────────────────────────────────────────────────

const WIDGET: AnalyticsWidget = {
  id: "w-1",
  type: "line",
  size: "m",
  title: "Runs over time",
  config: { source: "any", metric: "runs" },
};

function renderShell() {
  return render(
    <Widget
      widget={WIDGET}
      isEditing={false}
      isDragSource={false}
      onResize={() => {}}
      onDuplicate={() => {}}
      onRemove={() => {}}
      onRename={() => {}}
      onConfigure={() => {}}
      onDragHandleDown={() => {}}
    >
      <div data-testid="body-child">chart</div>
    </Widget>,
  );
}

describe("widget shell", () => {
  it("keeps the header outside the chart body", () => {
    renderShell();
    const body = screen.getByTestId("analytics-widget-body-w-1");
    expect(body.contains(screen.getByText("Runs over time"))).toBe(false);
    expect(body.contains(screen.getByTestId("body-child"))).toBe(true);
  });

  it("gives the body the remaining height and lets it shrink", () => {
    renderShell();
    const body = screen.getByTestId("analytics-widget-body-w-1");
    expect(body.className).toContain("flex-1");
    expect(body.className).toContain("min-h-0");
    expect(body.className).toContain("min-w-0");
    // `relative` is what a `ResponsiveChartSurface` fills.
    expect(body.className).toContain("relative");
  });

  it("holds the header at its content height so the body absorbs the squeeze", () => {
    renderShell();
    const header = screen.getByText("Runs over time").closest("div.flex")!.parentElement!;
    expect(header.className).toContain("shrink-0");
  });

  it("cannot grow the grid row: the card bounds its own content", () => {
    renderShell();
    const card = screen.getByTestId("analytics-widget-w-1");
    expect(card.className).toContain("h-full");
    expect(card.className).toContain("min-h-0");
    expect(card.className).toContain("overflow-hidden");
  });
});
