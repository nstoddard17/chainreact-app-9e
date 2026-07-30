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
  AnalyticsWidgetSize,
} from "@/contracts/analytics";

/**
 * ANALYTICS-EXPLICIT-LAYOUT-S5-RESPONSIVE-PROJECTION-1 — responsive behaviour
 * of the shipping page.
 *
 * The rule under test throughout: a viewport change is a VIEW change. It may
 * repack what is drawn; it may never touch canonical coordinates, mark the board
 * dirty, or cause a request.
 */

const mockedApi = analyticsApi as jest.Mocked<typeof analyticsApi>;

const PITCH = ANALYTICS_MIN_CELL_WIDTH_PX + 14;
const WIDTH_FOR = (columns: number) => PITCH * columns - 14;

const widget = (
  id: string,
  size: AnalyticsWidgetSize,
  layout: { x: number; y: number; w: number; h: number },
): AnalyticsWidget => ({
  id,
  type: "stat",
  size,
  title: id,
  config: { source: "any", metric: "runs" },
  layout,
});

/**  A A | B | ·  /  C | B | D  — B is 1×2, row 0 column 3 is a deliberate gap. */
const EXPLICIT: AnalyticsWidget[] = [
  widget("A", "m", { x: 0, y: 0, w: 2, h: 1 }),
  widget("B", "tall", { x: 2, y: 0, w: 1, h: 2 }),
  widget("C", "s", { x: 0, y: 1, w: 1, h: 1 }),
  widget("D", "s", { x: 3, y: 1, w: 1, h: 1 }),
];

const LEGACY: AnalyticsWidget[] = [
  { id: "a", type: "stat", size: "s", title: "a", config: { source: "any", metric: "runs" } },
  { id: "b", type: "stat", size: "m", title: "b", config: { source: "any", metric: "runs" } },
];

const OVERVIEW: AnalyticsOverview = {
  range: { id: "7d", since: "2026-07-21", until: "2026-07-28" },
  totals: { runs: 1, succeeded: 1, failed: 0, successRate: 1, avgDurationMs: 1, activeWorkflows: 1, totalWorkflows: 1, connectedApps: 0 },
  previousTotals: { runs: 1, succeeded: 1, failed: 0, successRate: 1, avgDurationMs: 1, activeWorkflows: 1, totalWorkflows: 1, connectedApps: 0 },
  runsOverTime: [], workflows: [], apps: [],
  heatmap: { weeks: 1, cells: [0, 0, 0, 0, 0, 0, 0], maxCell: 0, total: 0 },
  recentRuns: [], truncated: false,
};

const dashboard = (widgets: AnalyticsWidget[]): Dashboard => ({
  id: "00000000-0000-4000-8000-00000000s5s5",
  name: "Board",
  position: 0,
  isDefault: true,
  widgets,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
});

/** A controllable ResizeObserver so a test can drive the container width. */
type ObserverCallback = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;
let observers: { el: Element; cb: ObserverCallback }[] = [];
function setContainerWidth(width: number) {
  act(() => {
    for (const { el, cb } of observers) {
      cb(
        [{ target: el, contentRect: { width } } as unknown as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    }
  });
}

beforeEach(() => {
  jest.clearAllMocks();
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
});

function renderBoard(widgets: AnalyticsWidget[]) {
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

const grid = () => screen.getByTestId("analytics-explicit-grid");
const rendered = (id: string) => {
  const el = screen.getByTestId(`analytics-grid-cell-${id}`);
  return `${el.dataset.gridX},${el.dataset.gridY},${el.dataset.gridW},${el.dataset.gridH}`;
};
const canonical = (id: string) => {
  const el = screen.getByTestId(`analytics-grid-cell-${id}`);
  return `${el.dataset.canonicalX},${el.dataset.canonicalY},${el.dataset.canonicalW},${el.dataset.canonicalH}`;
};
const editButton = () => screen.getByRole("button", { name: /Edit dashboard/i });
const readingOrder = () =>
  screen.getAllByTestId(/^analytics-grid-cell-/).map((el) => el.dataset.widgetId);

// ── Projection at each width ────────────────────────────────────────────────

describe("the board projects to the container's width", () => {
  it("renders the canonical arrangement at four columns, gap included", () => {
    renderBoard(EXPLICIT);
    setContainerWidth(WIDTH_FOR(4));
    expect(grid().style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    expect(rendered("A")).toBe("0,0,2,1");
    expect(rendered("B")).toBe("2,0,1,2");
    expect(rendered("D")).toBe("3,1,1,1");
    // Row 0 column 3 stays empty on purpose.
    expect(readingOrder().every((id) => rendered(id!) !== "3,0,1,1")).toBe(true);
  });

  it("compacts into three columns without losing a widget", () => {
    renderBoard(EXPLICIT);
    setContainerWidth(WIDTH_FOR(3));
    expect(grid().style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
    expect(readingOrder()).toEqual(["A", "B", "C", "D"]);
    expect(rendered("B")).toBe("2,0,1,2"); // height kept
  });

  it("clamps a wide widget at two columns", () => {
    renderBoard(EXPLICIT);
    setContainerWidth(WIDTH_FOR(2));
    expect(grid().style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
    expect(rendered("A")).toBe("0,0,2,1");
    expect(readingOrder()).toEqual(["A", "B", "C", "D"]);
  });

  it("stacks everything one wide at one column, keeping heights and order", () => {
    renderBoard(EXPLICIT);
    setContainerWidth(WIDTH_FOR(1));
    expect(grid().style.gridTemplateColumns).toBe("repeat(1, minmax(0, 1fr))");
    expect(readingOrder()).toEqual(["A", "B", "C", "D"]);
    expect(rendered("A")).toBe("0,0,1,1");
    expect(rendered("B")).toBe("0,1,1,2");
    expect(rendered("C")).toBe("0,3,1,1");
  });

  it("keeps canonical coordinates on every cell, whatever is drawn", () => {
    renderBoard(EXPLICIT);
    setContainerWidth(WIDTH_FOR(1));
    expect(canonical("A")).toBe("0,0,2,1");
    expect(canonical("D")).toBe("3,1,1,1");
    expect(rendered("A")).not.toBe(canonical("A"));
  });

  it("renders canonically before the container has been measured", () => {
    renderBoard(EXPLICIT);
    expect(grid().style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    expect(rendered("A")).toBe("0,0,2,1");
    expect(screen.queryByTestId("analytics-explicit-grid-error")).toBeNull();
  });
});

// ── Resizing is a view change, never a data change ─────────────────────────

describe("resizing never touches the data", () => {
  it("makes no request at any width", () => {
    renderBoard(EXPLICIT);
    for (const columns of [4, 3, 2, 1, 2, 3, 4]) setContainerWidth(WIDTH_FOR(columns));
    expect(mockedApi.updateDashboard).not.toHaveBeenCalled();
    expect(mockedApi.createDashboard).not.toHaveBeenCalled();
  });

  it("restores the exact canonical rectangles on the way back to four columns", () => {
    renderBoard(EXPLICIT);
    setContainerWidth(WIDTH_FOR(4));
    const before = ["A", "B", "C", "D"].map(rendered);
    setContainerWidth(WIDTH_FOR(1));
    setContainerWidth(WIDTH_FOR(2));
    setContainerWidth(WIDTH_FOR(4));
    expect(["A", "B", "C", "D"].map(rendered)).toEqual(before);
  });

  it("is deterministic under repeated oscillation", () => {
    renderBoard(EXPLICIT);
    setContainerWidth(WIDTH_FOR(2));
    const first = ["A", "B", "C", "D"].map(rendered);
    for (let i = 0; i < 3; i += 1) {
      setContainerWidth(WIDTH_FOR(4));
      setContainerWidth(WIDTH_FOR(2));
    }
    expect(["A", "B", "C", "D"].map(rendered)).toEqual(first);
  });

  it("does not remount widget components when the projection changes", () => {
    renderBoard(EXPLICIT);
    setContainerWidth(WIDTH_FOR(4));
    const node = screen.getByTestId("analytics-widget-A");
    setContainerWidth(WIDTH_FOR(1));
    expect(screen.getByTestId("analytics-widget-A")).toBe(node);
  });

  it("a legacy board projects without ever gaining a layout", async () => {
    mockedApi.updateDashboard.mockResolvedValueOnce(dashboard(LEGACY));
    renderBoard(LEGACY);
    setContainerWidth(WIDTH_FOR(1));
    setContainerWidth(WIDTH_FOR(4));
    fireEvent.click(editButton());
    fireEvent.click(screen.getByRole("button", { name: /Done editing/i }));
    await act(async () => {});
    const sent = mockedApi.updateDashboard.mock.calls[0]![1].widgets!;
    expect(sent.every((w) => !("layout" in w))).toBe(true);
  });
});

// ── Edit gating ─────────────────────────────────────────────────────────────

describe("layout editing needs the full four columns", () => {
  it("is available at four columns", () => {
    renderBoard(EXPLICIT);
    setContainerWidth(WIDTH_FOR(4));
    expect(editButton()).not.toBeDisabled();
    expect(screen.queryByTestId("analytics-narrow-edit-notice")).toBeNull();
  });

  it.each([3, 2, 1])("is disabled at %i columns, with a reason", (columns) => {
    renderBoard(EXPLICIT);
    setContainerWidth(WIDTH_FOR(columns));
    expect(editButton()).toBeDisabled();
    expect(editButton().title).toBe("Use a wider window to rearrange this dashboard.");
    expect(screen.getByTestId("analytics-narrow-edit-notice").textContent).toContain(
      "Use a wider window",
    );
  });

  it("still shows every widget when editing is unavailable", () => {
    renderBoard(EXPLICIT);
    setContainerWidth(WIDTH_FOR(1));
    expect(readingOrder()).toEqual(["A", "B", "C", "D"]);
  });

  it("offers no drag grip, resize or add control outside edit mode", () => {
    renderBoard(EXPLICIT);
    setContainerWidth(WIDTH_FOR(2));
    expect(screen.queryByTestId("analytics-widget-drag-handle-A")).toBeNull();
    expect(screen.queryAllByLabelText("Resize widget")).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: /Add a widget/i })).toHaveLength(0);
  });
});

// ── The canonical edit lock ────────────────────────────────────────────────

describe("an open edit session holds the grid at four columns", () => {
  function startEditingWide() {
    renderBoard(EXPLICIT);
    setContainerWidth(WIDTH_FOR(4));
    fireEvent.click(editButton());
  }

  it("keeps four columns and canonical rectangles when the window narrows", () => {
    startEditingWide();
    setContainerWidth(WIDTH_FOR(1));
    expect(grid().style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    expect(rendered("A")).toBe("0,0,2,1");
    expect(rendered("D")).toBe("3,1,1,1");
  });

  it("offers horizontal scrolling and a minimum width instead of squashing cells", () => {
    startEditingWide();
    setContainerWidth(WIDTH_FOR(1));
    const surface = screen.getByTestId("analytics-grid-surface");
    expect(surface.className).toContain("overflow-x-auto");
    expect(screen.getByTestId("analytics-canonical-lock-notice")).toBeTruthy();
  });

  it("explains itself without implying the dashboard is broken", () => {
    startEditingWide();
    setContainerWidth(WIDTH_FOR(1));
    expect(screen.getByTestId("analytics-canonical-lock-notice").textContent).toContain(
      "stays on screen while you edit",
    );
  });

  it("does not mark the board dirty, so a legacy save stays legacy", async () => {
    mockedApi.updateDashboard.mockResolvedValueOnce(dashboard(LEGACY));
    renderBoard(LEGACY);
    setContainerWidth(WIDTH_FOR(4));
    fireEvent.click(editButton());
    setContainerWidth(WIDTH_FOR(1));
    fireEvent.click(screen.getByRole("button", { name: /Done editing/i }));
    await act(async () => {});
    expect(
      mockedApi.updateDashboard.mock.calls[0]![1].widgets!.every((w) => !("layout" in w)),
    ).toBe(true);
  });

  it("resumes responsive projection after cancelling", () => {
    startEditingWide();
    setContainerWidth(WIDTH_FOR(1));
    expect(grid().style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    fireEvent.click(screen.getByTestId("analytics-cancel-editing"));
    expect(grid().style.gridTemplateColumns).toBe("repeat(1, minmax(0, 1fr))");
    expect(canonical("A")).toBe("0,0,2,1");
  });
});
