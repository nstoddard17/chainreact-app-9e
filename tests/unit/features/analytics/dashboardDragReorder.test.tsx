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

import { act, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as analyticsApi from "@/lib/api/analytics";
import { AnalyticsDashboard } from "@/features/analytics/AnalyticsDashboard";
import { computeDragPreview, hitTestSlot } from "@/features/analytics/dashboardHelpers";
import type {
  AnalyticsDashboard as Dashboard,
  AnalyticsOverview,
  AnalyticsWidget,
} from "@/contracts/analytics";
import { FIXTURE_CATALOG, kpiResult } from "./insights/fixtures";

const mockedApi = analyticsApi as jest.Mocked<typeof analyticsApi>;

/**
 * ANALYTICS-WIDGET-DRAG-STABILITY-1 — the drag model and its session lifecycle.
 *
 * The contract under test is that the destination is derived from geometry
 * FROZEN at drag start plus the pointer's current position — never from which
 * card happens to be under the pointer. That is what stops the feedback loop
 * (re-order moves cards under the pointer → re-target → re-order …) which no
 * threshold could fix, and it is what gives every slot one stable meaning, so
 * a widget can be stepped out and back within a single drag.
 */

const OVERVIEW: AnalyticsOverview = {
  range: { id: "7d", since: "2026-07-18", until: "2026-07-25" },
  totals: {
    runs: 10, succeeded: 9, failed: 1, successRate: 0.9, avgDurationMs: 100,
    activeWorkflows: 2, totalWorkflows: 3, connectedApps: 1,
  },
  previousTotals: {
    runs: 8, succeeded: 8, failed: 0, successRate: 1, avgDurationMs: 90,
    activeWorkflows: 2, totalWorkflows: 3, connectedApps: 1,
  },
  runsOverTime: [],
  workflows: [],
  apps: [],
  heatmap: { weeks: 1, cells: [0, 0, 0, 0, 0, 0, 0], maxCell: 0, total: 0 },
  recentRuns: [],
  truncated: false,
};

const stat = (id: string, title: string, size: AnalyticsWidget["size"]): AnalyticsWidget => ({
  id,
  type: "stat",
  size,
  title,
  config: { source: "any", metric: "runs" },
});

const A = stat("w-a", "Alpha", "s");
const B = stat("w-b", "Bravo", "s");
const C = stat("w-c", "Charlie", "s");

function dashboard(widgets: AnalyticsWidget[] = [A, B, C]): Dashboard {
  return {
    id: "3f8f34a1-0000-4000-8000-00000000000d",
    name: "Overview",
    position: 0,
    isDefault: true,
    widgets,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
}

/**
 * jsdom lays nothing out, so the slot capture would read every card as 0×0.
 * Model three slots in a row and give each CARD the box of the slot it occupies
 * at the moment of capture. Crucially the drag session snapshots these once, so
 * later re-orders move cards between boxes without moving the boxes — exactly
 * the property the implementation relies on and the old harness lacked.
 */
const SLOT_SIZE = 200;
const SLOT_PITCH = 220;
const GRID_ORIGIN = { left: 50, top: 30 };

function layoutCards() {
  const cards = Array.from(document.querySelectorAll("[data-widget-id]")) as HTMLElement[];
  cards.forEach((card, index) => {
    Object.defineProperty(card, "offsetLeft", { value: index * SLOT_PITCH, configurable: true });
    Object.defineProperty(card, "offsetTop", { value: 0, configurable: true });
    Object.defineProperty(card, "offsetWidth", { value: SLOT_SIZE, configurable: true });
    Object.defineProperty(card, "offsetHeight", { value: SLOT_SIZE, configurable: true });
  });
  const grid = cards[0]?.parentElement;
  if (grid) {
    grid.getBoundingClientRect = () =>
      ({
        left: GRID_ORIGIN.left,
        top: GRID_ORIGIN.top,
        right: GRID_ORIGIN.left + SLOT_PITCH * 3,
        bottom: GRID_ORIGIN.top + SLOT_SIZE,
        width: SLOT_PITCH * 3,
        height: SLOT_SIZE,
        x: GRID_ORIGIN.left,
        y: GRID_ORIGIN.top,
        toJSON: () => ({}),
      }) as DOMRect;
  }
}

/** Client coordinates of a slot's centre. */
const slotPoint = (index: number) => ({
  clientX: GRID_ORIGIN.left + index * SLOT_PITCH + SLOT_SIZE / 2,
  clientY: GRID_ORIGIN.top + SLOT_SIZE / 2,
});

/** Client coordinates of the gutter after a slot (between two slots). */
const gutterPoint = (afterIndex: number) => ({
  clientX: GRID_ORIGIN.left + afterIndex * SLOT_PITCH + SLOT_SIZE + 10,
  clientY: GRID_ORIGIN.top + SLOT_SIZE / 2,
});

const widgetEl = (id: string) => screen.getByTestId(`analytics-widget-${id}`);
const handleEl = (id: string) =>
  screen.getByTestId(`analytics-widget-drag-handle-${id}`) as HTMLElement;

/** The grid's DOM order — what CSS grid auto-places from. */
function renderedOrder(): string[] {
  return Array.from(document.querySelectorAll("[data-widget-id]")).map(
    (el) => (el as HTMLElement).dataset.widgetId as string,
  );
}

/**
 * requestAnimationFrame is where pointer moves are coalesced, so tests drive it
 * explicitly. Draining ONCE per batch of moves is also how the coalescing gets
 * verified: several moves in a frame must produce a single settled destination.
 */
let frames: ((time: number) => void)[] = [];
function drainFrames() {
  const queued = frames;
  frames = [];
  act(() => {
    queued.forEach((cb) => cb(performance.now()));
  });
}

/**
 * jsdom implements no PointerEvent, and an event built from an init alone
 * arrives with pointerId, button, pointerType and coordinates all null — the
 * very fields the session lifecycle is built on. A real browser always supplies
 * them, so stamp them here rather than weakening the guards to suit the test
 * environment.
 */
function firePointer(
  el: HTMLElement,
  type: "pointerDown" | "pointerMove" | "pointerUp" | "pointerCancel" | "lostPointerCapture",
  props: {
    pointerId?: number;
    button?: number;
    pointerType?: string;
    clientX?: number;
    clientY?: number;
  },
) {
  const event = createEvent[type](el);
  for (const [key, value] of Object.entries({
    pointerType: "mouse",
    button: 0,
    ...props,
  })) {
    Object.defineProperty(event, key, { value, configurable: true });
  }
  fireEvent(el, event);
}

function pointerDown(
  id: string,
  at: { clientX: number; clientY: number },
  pointerId = 1,
  button = 0,
) {
  layoutCards();
  firePointer(handleEl(id), "pointerDown", { pointerId, button, ...at });
}

/** Move the pointer and let the coalescing frame run. */
function pointerMove(
  id: string,
  at: { clientX: number; clientY: number },
  pointerId = 1,
) {
  firePointer(handleEl(id), "pointerMove", { pointerId, ...at });
  drainFrames();
}

function pointerUp(id: string, at: { clientX: number; clientY: number }, pointerId = 1) {
  firePointer(handleEl(id), "pointerUp", { pointerId, ...at });
}

function renderEditing(widgets?: AnalyticsWidget[]) {
  const view = render(
    <AnalyticsDashboard
      accountName="Acme Co"
      canManage
      connectedProviders={{ acme: true }}
      insightCatalog={FIXTURE_CATALOG}
      initialDashboards={[dashboard(widgets)]}
      initialOverview={OVERVIEW}
      initialRange="7d"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Edit dashboard/ }));
  layoutCards();
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  frames = [];
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.push(cb);
    return frames.length;
  });
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  // jsdom implements neither pointer capture method.
  Element.prototype.setPointerCapture = function setPointerCapture() {};
  Element.prototype.releasePointerCapture = function releasePointerCapture() {};
  mockedApi.queryInsight.mockResolvedValue({ ok: true, result: kpiResult() });
  mockedApi.updateDashboard.mockImplementation(async (id, patch) => ({
    ...dashboard(),
    id,
    ...(patch.widgets !== undefined ? { widgets: patch.widgets as AnalyticsWidget[] } : {}),
  }));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("destination is derived from the drag-start layout", () => {
  it("moves a widget one slot forward", () => {
    renderEditing();
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);

    pointerDown("w-a", slotPoint(0));
    pointerMove("w-a", slotPoint(1));

    expect(renderedOrder()).toEqual(["w-b", "w-a", "w-c"]);
  });

  it("moves back to the original slot within the same drag", () => {
    // The old model could not express this: the only target that would restore
    // the original was the dragged widget itself, which was never a target.
    renderEditing();
    pointerDown("w-a", slotPoint(0));

    pointerMove("w-a", slotPoint(1));
    expect(renderedOrder()).toEqual(["w-b", "w-a", "w-c"]);

    pointerMove("w-a", slotPoint(0));
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);
  });

  it("steps through consecutive slots and back, every step reachable", () => {
    renderEditing();
    pointerDown("w-a", slotPoint(0));

    pointerMove("w-a", slotPoint(1));
    expect(renderedOrder()).toEqual(["w-b", "w-a", "w-c"]);
    pointerMove("w-a", slotPoint(2));
    expect(renderedOrder()).toEqual(["w-b", "w-c", "w-a"]);
    pointerMove("w-a", slotPoint(1));
    expect(renderedOrder()).toEqual(["w-b", "w-a", "w-c"]);
    pointerMove("w-a", slotPoint(0));
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);
  });

  it("a slot means the same thing however it is reached", () => {
    // Slot 2 via 0→1→2 and slot 2 via 0→2 must produce the same layout: the
    // destination is start-order + slot, not a history of mutations.
    const view = renderEditing();
    pointerDown("w-a", slotPoint(0));
    pointerMove("w-a", slotPoint(1));
    pointerMove("w-a", slotPoint(2));
    const stepped = renderedOrder();
    view.unmount();

    renderEditing();
    pointerDown("w-a", slotPoint(0));
    pointerMove("w-a", slotPoint(2));
    expect(renderedOrder()).toEqual(stepped);
  });
});

describe("stability — a moving layout must not drive the drag", () => {
  it("a stationary pointer produces no further re-orders", () => {
    renderEditing();
    pointerDown("w-a", slotPoint(0));
    pointerMove("w-a", slotPoint(1));
    const settled = renderedOrder();
    expect(settled).toEqual(["w-b", "w-a", "w-c"]);

    // Bravo now occupies slot 0 and Alpha's placeholder slot 1 — under the old
    // model this was the slingshot. The pointer has not moved, so nothing may.
    for (let i = 0; i < 8; i += 1) pointerMove("w-a", slotPoint(1));
    expect(renderedOrder()).toEqual(settled);
  });

  it("moving within one slot does not re-order", () => {
    renderEditing();
    pointerDown("w-a", slotPoint(0));
    pointerMove("w-a", slotPoint(1));
    const settled = renderedOrder();

    const p = slotPoint(1);
    pointerMove("w-a", { clientX: p.clientX - 40, clientY: p.clientY - 30 });
    pointerMove("w-a", { clientX: p.clientX + 40, clientY: p.clientY + 30 });
    expect(renderedOrder()).toEqual(settled);
  });

  it("creeping across a boundary changes the destination exactly once each way", () => {
    renderEditing();
    pointerDown("w-a", slotPoint(0));

    const y = slotPoint(0).clientY;
    // Grid-relative: slot 0 is 0–200, the gutter 200–220, slot 1 220–420.
    // Creep from inside slot 0, through the gutter, to inside slot 1.
    const sweep = (from: number, to: number, step: number) => {
      const seen: string[] = [renderedOrder().join(",")];
      for (let x = from; step > 0 ? x <= to : x >= to; x += step) {
        pointerMove("w-a", { clientX: GRID_ORIGIN.left + x, clientY: y });
        const now = renderedOrder().join(",");
        if (now !== seen[seen.length - 1]) seen.push(now);
      }
      return seen;
    };

    const forward = sweep(180, 240, 5);
    expect(forward).toEqual(["w-a,w-b,w-c", "w-b,w-a,w-c"]);

    const back = sweep(240, 180, -5);
    expect(back).toEqual(["w-b,w-a,w-c", "w-a,w-b,w-c"]);
  });

  it("a gutter keeps the current destination rather than flickering", () => {
    renderEditing();
    pointerDown("w-a", slotPoint(0));
    pointerMove("w-a", slotPoint(1));

    pointerMove("w-a", gutterPoint(1));
    expect(renderedOrder()).toEqual(["w-b", "w-a", "w-c"]);
  });

  it("coalesces a burst of pointer moves into one settled destination", () => {
    renderEditing();
    pointerDown("w-a", slotPoint(0));

    firePointer(handleEl("w-a"), "pointerMove", { pointerId: 1, ...slotPoint(1) });
    firePointer(handleEl("w-a"), "pointerMove", { pointerId: 1, ...slotPoint(2) });
    firePointer(handleEl("w-a"), "pointerMove", { pointerId: 1, ...slotPoint(1) });
    // One frame for the whole burst, settling on the LAST position.
    expect(frames).toHaveLength(1);
    drainFrames();

    expect(renderedOrder()).toEqual(["w-b", "w-a", "w-c"]);
  });
});

describe("drag session lifecycle", () => {
  it("pointer movement without a pointer-down never changes the layout", () => {
    renderEditing();
    pointerMove("w-a", slotPoint(2));
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);
    expect(screen.queryByTestId("analytics-drag-overlay")).toBeNull();
  });

  it("pointer movement after pointerup never changes the layout", () => {
    renderEditing();
    pointerDown("w-a", slotPoint(0));
    pointerMove("w-a", slotPoint(1));
    pointerUp("w-a", slotPoint(1));
    const committed = renderedOrder();

    pointerMove("w-a", slotPoint(2));
    expect(renderedOrder()).toEqual(committed);
  });

  it("ignores events carrying a different pointer id", () => {
    renderEditing();
    pointerDown("w-a", slotPoint(0), 1);

    pointerMove("w-a", slotPoint(2), 99);
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);

    // The real pointer still works.
    pointerMove("w-a", slotPoint(2), 1);
    expect(renderedOrder()).toEqual(["w-b", "w-c", "w-a"]);

    // A foreign pointer cannot end the session either.
    pointerUp("w-a", slotPoint(0), 99);
    expect(screen.getByTestId("analytics-drag-overlay")).toBeTruthy();
  });

  it("a non-primary mouse button does not start a drag", () => {
    renderEditing();
    pointerDown("w-a", slotPoint(0), 1, 2);
    pointerMove("w-a", slotPoint(2));
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);
    expect(screen.queryByTestId("analytics-drag-overlay")).toBeNull();
  });

  it.each([
    ["pointercancel", (el: HTMLElement) => firePointer(el, "pointerCancel", { pointerId: 1 })],
    ["lostpointercapture", (el: HTMLElement) => firePointer(el, "lostPointerCapture", { pointerId: 1 })],
    ["Escape", () => fireEvent.keyDown(window, { key: "Escape" })],
    ["window blur", () => fireEvent.blur(window)],
  ])("%s cancels the session and restores the committed layout", (_label, exit) => {
    renderEditing();
    pointerDown("w-a", slotPoint(0));
    pointerMove("w-a", slotPoint(2));
    expect(renderedOrder()).toEqual(["w-b", "w-c", "w-a"]);

    act(() => {
      exit(handleEl("w-a"));
    });

    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);
    expect(screen.queryByTestId("analytics-drag-overlay")).toBeNull();
    expect(document.querySelector("[data-testid^='analytics-drag-placeholder']")).toBeNull();
    expect(mockedApi.updateDashboard).not.toHaveBeenCalled();

    // And the dead session cannot be resurrected by more movement.
    pointerMove("w-a", slotPoint(1));
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);
  });

  it("leaving edit mode mid-drag cancels the session", async () => {
    renderEditing();
    pointerDown("w-a", slotPoint(0));
    pointerMove("w-a", slotPoint(2));

    fireEvent.click(screen.getByRole("button", { name: /Done editing/ }));
    // Done editing saves, then leaves edit mode; the session cannot outlive it.
    await waitFor(() => expect(screen.queryByTestId("analytics-drag-overlay")).toBeNull());
    // The in-flight preview was never committed — only the real draft was saved.
    expect(mockedApi.updateDashboard.mock.calls[0]![1].widgets?.map((w) => w.id)).toEqual([
      "w-a",
      "w-b",
      "w-c",
    ]);
  });

  it("unmounting mid-drag tears the session down without leaking listeners", () => {
    const view = renderEditing();
    pointerDown("w-a", slotPoint(0));
    pointerMove("w-a", slotPoint(1));

    expect(() => view.unmount()).not.toThrow();
    // Post-unmount movement reaches no handler.
    expect(() => fireEvent.keyDown(window, { key: "Escape" })).not.toThrow();
  });
});

describe("overlay and destination placeholder", () => {
  it("shows the floating overlay and turns the in-flow card into the placeholder", () => {
    renderEditing();
    expect(screen.queryByTestId("analytics-drag-overlay")).toBeNull();

    pointerDown("w-a", slotPoint(0));

    const overlay = screen.getByTestId("analytics-drag-overlay");
    expect(overlay.textContent).toContain("Alpha");
    // The overlay is sized to the card it replaced.
    expect(overlay.style.width).toBe(`${SLOT_SIZE}px`);
    expect(overlay.style.height).toBe(`${SLOT_SIZE}px`);
    // The card stays mounted (it holds the pointer capture) as the placeholder.
    expect(screen.getByTestId("analytics-drag-placeholder-w-a")).toBeTruthy();
    expect(widgetEl("w-a").className).toContain("border-primary");
  });

  it("the placeholder travels with the destination, and names the footprint", () => {
    renderEditing([stat("w-a", "Alpha", "l"), B, C]);
    pointerDown("w-a", slotPoint(0));
    expect(screen.getByTestId("analytics-drag-placeholder-w-a").textContent).toBe("2×2");

    pointerMove("w-a", slotPoint(1));
    // Placeholder is the dragged card itself, so it IS at the destination.
    expect(renderedOrder()).toEqual(["w-b", "w-a", "w-c"]);
    expect(screen.getByTestId("analytics-drag-placeholder-w-a")).toBeTruthy();
  });

  it("the overlay follows the pointer", () => {
    renderEditing();
    pointerDown("w-a", slotPoint(0));
    pointerMove("w-a", { clientX: 400, clientY: 260 });

    const overlay = screen.getByTestId("analytics-drag-overlay");
    // Grab offset was the slot-0 centre, i.e. half a card in on each axis.
    expect(overlay.style.transform).toBe(
      `translate3d(${400 - SLOT_SIZE / 2}px, ${260 - SLOT_SIZE / 2}px, 0)`,
    );
  });
});

describe("commit", () => {
  it("the drop commits exactly the previewed order", () => {
    renderEditing();
    pointerDown("w-a", slotPoint(0));
    pointerMove("w-a", slotPoint(2));
    const previewed = renderedOrder();

    pointerUp("w-a", slotPoint(2));

    expect(renderedOrder()).toEqual(previewed);
    expect(renderedOrder()).toEqual(["w-b", "w-c", "w-a"]);
    expect(screen.queryByTestId("analytics-drag-overlay")).toBeNull();
  });

  it("nothing is persisted until Done editing", () => {
    renderEditing();
    pointerDown("w-a", slotPoint(0));
    pointerMove("w-a", slotPoint(2));
    pointerUp("w-a", slotPoint(2));

    expect(mockedApi.updateDashboard).not.toHaveBeenCalled();
  });

  it("releasing back on the origin leaves the order untouched", () => {
    renderEditing();
    pointerDown("w-a", slotPoint(0));
    pointerMove("w-a", slotPoint(2));
    pointerMove("w-a", slotPoint(0));
    pointerUp("w-a", slotPoint(0));

    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);
  });

  it("no drag handle outside edit mode", () => {
    render(
      <AnalyticsDashboard
        accountName="Acme Co"
        canManage
        connectedProviders={{ acme: true }}
        insightCatalog={FIXTURE_CATALOG}
        initialDashboards={[dashboard()]}
        initialOverview={OVERVIEW}
        initialRange="7d"
      />,
    );
    expect(screen.queryByTestId("analytics-widget-drag-handle-w-a")).toBeNull();
  });
});

describe("computeDragPreview (pure)", () => {
  const order = [A, B, C];

  it("is derived from the start order, so a slot always means the same thing", () => {
    expect(computeDragPreview(order, "w-a", 0)?.map((w) => w.id)).toEqual([
      "w-a", "w-b", "w-c",
    ]);
    expect(computeDragPreview(order, "w-a", 1)?.map((w) => w.id)).toEqual([
      "w-b", "w-a", "w-c",
    ]);
    expect(computeDragPreview(order, "w-a", 2)?.map((w) => w.id)).toEqual([
      "w-b", "w-c", "w-a",
    ]);
  });

  it("is idempotent — recomputing the same slot yields the same layout", () => {
    const once = computeDragPreview(order, "w-b", 2)?.map((w) => w.id);
    const twice = computeDragPreview(order, "w-b", 2)?.map((w) => w.id);
    expect(once).toEqual(twice);
    expect(once).toEqual(["w-a", "w-c", "w-b"]);
  });

  it("clamps an out-of-range slot instead of dropping the widget", () => {
    expect(computeDragPreview(order, "w-a", 99)?.map((w) => w.id)).toEqual([
      "w-b", "w-c", "w-a",
    ]);
    expect(computeDragPreview(order, "w-a", -5)?.map((w) => w.id)).toEqual([
      "w-a", "w-b", "w-c",
    ]);
  });

  it("returns null for an unknown widget and never mutates the input", () => {
    expect(computeDragPreview(order, "nope", 1)).toBeNull();
    computeDragPreview(order, "w-a", 2);
    expect(order.map((w) => w.id)).toEqual(["w-a", "w-b", "w-c"]);
  });
});

describe("hitTestSlot (pure)", () => {
  const slots = [
    { left: 0, top: 0, width: 200, height: 200 },
    { left: 220, top: 0, width: 200, height: 200 },
    { left: 440, top: 0, width: 200, height: 200 },
  ];

  it("finds the slot containing the point", () => {
    expect(hitTestSlot(slots, 100, 100)).toBe(0);
    expect(hitTestSlot(slots, 320, 100)).toBe(1);
    expect(hitTestSlot(slots, 540, 100)).toBe(2);
  });

  it("returns null in a gutter, so the destination is held rather than flickering", () => {
    expect(hitTestSlot(slots, 210, 100)).toBeNull();
    expect(hitTestSlot(slots, 430, 100)).toBeNull();
  });

  it("returns null outside the grid entirely", () => {
    expect(hitTestSlot(slots, -20, 100)).toBeNull();
    expect(hitTestSlot(slots, 100, 400)).toBeNull();
    expect(hitTestSlot(slots, 900, 100)).toBeNull();
  });

  it("is half-open, so adjacent slots cannot both claim a boundary pixel", () => {
    expect(hitTestSlot(slots, 0, 0)).toBe(0);
    expect(hitTestSlot(slots, 199, 199)).toBe(0);
    expect(hitTestSlot(slots, 200, 100)).toBeNull();
    expect(hitTestSlot(slots, 220, 100)).toBe(1);
  });
});
