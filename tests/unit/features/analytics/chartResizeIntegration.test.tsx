jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: import("react").ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
jest.mock("@/lib/api/analytics", () => ({
  AnalyticsApiError: class AnalyticsApiError extends Error {},
  getAnalyticsData: jest.fn(),
  updateDashboard: jest.fn(),
  createDashboard: jest.fn(),
  deleteDashboard: jest.fn(),
  listDashboards: jest.fn(),
  querySourceData: jest.fn(),
  queryInsight: jest.fn(),
}));
jest.mock("@/lib/api/options", () => ({ fetchOptionsSource: jest.fn() }));

import { act, fireEvent, render, screen } from "@testing-library/react";
import * as analyticsApi from "@/lib/api/analytics";
import { AnalyticsDashboard } from "@/features/analytics/AnalyticsDashboard";
import { FIXTURE_CATALOG } from "./insights/fixtures";
import { ANALYTICS_MIN_CELL_WIDTH_PX } from "@/core/analytics/layout";
import type {
  AnalyticsDashboard as Dashboard,
  AnalyticsOverview,
  AnalyticsWidget,
} from "@/contracts/analytics";

/**
 * Chart resizing on the SHIPPING dashboard
 * (ANALYTICS-RESPONSIVE-CHART-SURFACES-1).
 *
 * The rule under test: chart dimensions are a PRESENTATION concern. Resizing a
 * widget or narrowing the page must remeasure and redraw the charts, and must
 * never mark the board dirty, serialize a layout, or issue a request. A measured
 * pixel is not allowed anywhere near persistence.
 */

const mockedApi = analyticsApi as jest.Mocked<typeof analyticsApi>;

const PITCH = ANALYTICS_MIN_CELL_WIDTH_PX + 14;
const WIDTH_FOR = (columns: number) => PITCH * columns - 14;

const OVERVIEW: AnalyticsOverview = {
  range: { id: "7d", since: "2026-07-21", until: "2026-07-28" },
  totals: {
    runs: 1843,
    succeeded: 1810,
    failed: 33,
    successRate: 1810 / 1843,
    avgDurationMs: 142,
    activeWorkflows: 6,
    totalWorkflows: 9,
    connectedApps: 2,
  },
  previousTotals: {
    runs: 1562,
    succeeded: 1500,
    failed: 62,
    successRate: 1500 / 1562,
    avgDurationMs: 160,
    activeWorkflows: 5,
    totalWorkflows: 9,
    connectedApps: 2,
  },
  runsOverTime: [
    { date: "2026-07-22", succeeded: 100, failed: 2 },
    { date: "2026-07-23", succeeded: 140, failed: 4 },
    { date: "2026-07-24", succeeded: 90, failed: 1 },
    { date: "2026-07-25", succeeded: 180, failed: 9 },
  ],
  workflows: [
    { workflowId: "11111111-1111-1111-1111-111111111111", name: "Welcome flow", runs: 900, succeeded: 880, successRate: 880 / 900, avgDurationMs: 120 },
    { workflowId: "22222222-2222-2222-2222-222222222222", name: "Nightly sync", runs: 400, succeeded: 390, successRate: 390 / 400, avgDurationMs: 220 },
  ],
  apps: [{ provider: "slack", label: "Slack", connections: 2 }],
  heatmap: {
    weeks: 16,
    cells: Array.from({ length: 16 * 7 }, (_, i) => i % 5),
    maxCell: 4,
    total: 300,
  },
  recentRuns: [],
  truncated: false,
};

const widget = (
  id: string,
  type: AnalyticsWidget["type"],
  size: AnalyticsWidget["size"],
  layout: { x: number; y: number; w: number; h: number },
): AnalyticsWidget => ({
  id,
  type,
  size,
  title: id,
  config: { source: "any", metric: type === "bar" ? "top_workflows" : "runs" },
  layout,
});

/**  line(2×1) | donut(2×1)  /  heat(2×1) | bar(1×1) | stat(1×1)  */
const WIDGETS: AnalyticsWidget[] = [
  widget("line", "line", "m", { x: 0, y: 0, w: 2, h: 1 }),
  widget("donut", "donut", "m", { x: 2, y: 0, w: 2, h: 1 }),
  widget("heat", "heatmap", "m", { x: 0, y: 1, w: 2, h: 1 }),
  widget("bar", "bar", "s", { x: 2, y: 1, w: 1, h: 1 }),
  widget("stat", "stat", "s", { x: 3, y: 1, w: 1, h: 1 }),
];

const dashboard = (widgets: AnalyticsWidget[]): Dashboard => ({
  id: "00000000-0000-4000-8000-000000000001",
  name: "Board",
  position: 0,
  isDefault: true,
  widgets,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
});

// ── driving the two independent observers ────────────────────────────────────

type ObserverCallback = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;
let observers: { el: Element; cb: ObserverCallback }[] = [];

function fire(match: (el: Element) => boolean, width: number, height: number) {
  act(() => {
    for (const { el, cb } of observers) {
      if (!match(el)) continue;
      cb(
        [{ target: el, contentRect: { width, height } } as unknown as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    }
  });
}

/**
 * The two observers are told apart by their target, because they answer
 * different questions: the responsive controller watches the grid SURFACE (how
 * many columns fit), each chart watches its own body (how to draw).
 */
const isGrid = (el: Element) => el.getAttribute("data-testid") === "analytics-grid-surface";

const isChartSurface = (el: Element) => {
  const id = el.getAttribute("data-testid") ?? "";
  return id.startsWith("analytics-") && id.endsWith("-surface") && id !== "analytics-grid-surface";
};

/** The page container width — what decides the responsive projection. */
const setPageWidth = (width: number) => fire(isGrid, width, 800);

/** Every chart body's own box — what decides how each chart draws. */
const setChartBodies = (width: number, height: number) =>
  fire(isChartSurface, width, height);

beforeEach(() => {
  jest.clearAllMocks();
  observers = [];
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    constructor(private readonly cb: ObserverCallback) {}
    observe(el: Element) {
      observers.push({ el, cb: this.cb });
    }
    disconnect() {
      observers = observers.filter((o) => o.cb !== this.cb);
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

function renderBoard(widgets = WIDGETS) {
  return render(
    <AnalyticsDashboard
      accountName="Acct"
      canManage
      connectedProviders={{}}
      insightCatalog={FIXTURE_CATALOG}
      initialDashboards={[dashboard(widgets)]}
      initialOverview={OVERVIEW}
      initialRange="7d"
    />,
  );
}

const lineSvg = () => screen.getByTestId("analytics-line-chart");
const heatSvg = () => screen.getByTestId("analytics-heatmap");
const cell = (id: string) => screen.getByTestId(`analytics-grid-cell-${id}`);
const editButton = () => screen.getByRole("button", { name: /Edit dashboard/i });
const dims = (el: Element) => `${el.getAttribute("width")}×${el.getAttribute("height")}`;

describe("chart bodies remeasure when the board changes", () => {
  it("draws every chart at its own measured body size", () => {
    renderBoard();
    setPageWidth(WIDTH_FOR(4));
    setChartBodies(640, 117);
    expect(dims(lineSvg())).toBe("640×117");
    expect(Number(heatSvg().dataset["heatmapCell"])).toBeGreaterThan(0);
  });

  it("redraws when a widget's footprint changes in edit mode, with no reload", () => {
    renderBoard();
    setPageWidth(WIDTH_FOR(4));
    setChartBodies(640, 117);
    const before = dims(lineSvg());

    fireEvent.click(editButton());
    // A larger preset: the layout engine moves the footprint, then the body's
    // own observer reports the new box.
    fireEvent.change(screen.getByTestId("analytics-widget-line").querySelector("select")!, {
      target: { value: "l" },
    });
    setChartBodies(640, 321);

    expect(dims(lineSvg())).toBe("640×321");
    expect(dims(lineSvg())).not.toBe(before);
    // The chart went with the footprint, which really did change.
    expect(cell("line").dataset["gridH"]).toBe("2");
  });

  it("contracts again when the widget is made smaller", () => {
    renderBoard();
    setPageWidth(WIDTH_FOR(4));
    setChartBodies(640, 321);
    const tall = Number(heatSvg().dataset["heatmapCell"]);
    setChartBodies(300, 96);
    expect(Number(heatSvg().dataset["heatmapCell"])).toBeLessThan(tall);
  });

  it("remeasures through a 4 → 2 → 1 → 4 projection round trip", () => {
    renderBoard();
    setPageWidth(WIDTH_FOR(4));
    setChartBodies(640, 117);
    const atFour = dims(lineSvg());

    setPageWidth(WIDTH_FOR(2));
    setChartBodies(430, 117);
    expect(dims(lineSvg())).toBe("430×117");

    setPageWidth(WIDTH_FOR(1));
    setChartBodies(300, 117);
    expect(dims(lineSvg())).toBe("300×117");

    setPageWidth(WIDTH_FOR(4));
    setChartBodies(640, 117);
    expect(dims(lineSvg())).toBe(atFour);
  });

  it("keeps every widget mounted across a projection change", () => {
    renderBoard();
    setPageWidth(WIDTH_FOR(4));
    setChartBodies(640, 117);
    const identities = WIDGETS.map((w) => cell(w.id));
    setPageWidth(WIDTH_FOR(1));
    setChartBodies(300, 117);
    // Same DOM nodes: the projection repacked the grid, it did not remount the
    // board to force the charts to resize.
    WIDGETS.forEach((w, i) => expect(cell(w.id)).toBe(identities[i]));
  });
});

describe("chart resizing is not a dashboard change", () => {
  it("issues no request when only the chart bodies resize", async () => {
    renderBoard();
    setPageWidth(WIDTH_FOR(4));
    setChartBodies(640, 117);
    setChartBodies(430, 200);
    setChartBodies(300, 96);
    await act(async () => {});
    expect(mockedApi.updateDashboard).not.toHaveBeenCalled();
    expect(mockedApi.createDashboard).not.toHaveBeenCalled();
  });

  it("issues no request when the projection changes", async () => {
    renderBoard();
    for (const columns of [4, 3, 2, 1, 4]) {
      setPageWidth(WIDTH_FOR(columns));
      setChartBodies(200 * columns, 117);
    }
    await act(async () => {});
    expect(mockedApi.updateDashboard).not.toHaveBeenCalled();
  });

  it("leaves a legacy board legacy — no chart dimension reaches the payload", async () => {
    const legacy = WIDGETS.map(({ layout: _layout, ...rest }) => rest as AnalyticsWidget);
    mockedApi.updateDashboard.mockResolvedValueOnce(dashboard(legacy));
    renderBoard(legacy);
    setPageWidth(WIDTH_FOR(4));
    setChartBodies(640, 117);

    fireEvent.click(editButton());
    setChartBodies(640, 321);
    setChartBodies(300, 96);
    fireEvent.click(screen.getByRole("button", { name: /Done editing/i }));
    await act(async () => {});

    const payload = mockedApi.updateDashboard.mock.calls[0]?.[1];
    if (payload) {
      const serialized = JSON.stringify(payload);
      for (const banned of ["chartWidth", "chartHeight", "plotWidth", "plotHeight"]) {
        expect(serialized).not.toContain(banned);
      }
      // A resize that only changed CHART dimensions must not have converted the
      // board to explicit placement either.
      expect(payload.widgets!.every((w) => !("layout" in w))).toBe(true);
    }
  });
});
