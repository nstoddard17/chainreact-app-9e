/**
 * ANALYTICS-EXPLICIT-LAYOUT-S2-CONTRACT-1 — the service/repository round trip.
 *
 * What the read path must NOT do is as important as what it must: reading a
 * legacy dashboard must not write, must not add `layout`, and must not lose a
 * widget. What the write path must do is carry an explicit board through
 * unchanged.
 */

jest.mock("@/repositories/analyticsDashboards", () => ({
  listByAccount: jest.fn(),
  getByIdServiceRole: jest.fn(),
  seedDefaultServiceRole: jest.fn(),
  createServiceRole: jest.fn(),
  updateServiceRole: jest.fn(),
  deleteServiceRole: jest.fn(),
  nextPositionServiceRole: jest.fn(),
}));

import * as repo from "@/repositories/analyticsDashboards";
import { listOrSeedDashboards, updateDashboard } from "@/services/analytics/dashboards";
import type { AnalyticsWidgetSize } from "@/contracts/analytics";

const mockRepo = repo as jest.Mocked<typeof repo>;

const stored = (id: string, size: AnalyticsWidgetSize = "s", layout?: unknown) => ({
  id,
  type: "stat",
  size,
  title: id,
  config: { source: "any", metric: "runs" },
  ...(layout === undefined ? {} : { layout }),
});

function record(widgets: unknown): repo.AnalyticsDashboardRecord {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    accountId: "acct-1",
    createdByUserId: "user-1",
    name: "Overview",
    position: 0,
    isDefault: true,
    widgets,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
}

/** Every repository function that would write. */
const WRITE_FNS = [
  "createServiceRole",
  "updateServiceRole",
  "deleteServiceRole",
  "seedDefaultServiceRole",
] as const;

beforeEach(() => jest.clearAllMocks());
// The read path warns on recovery; assert on the calls, don't print them.
beforeAll(() => jest.spyOn(console, "warn").mockImplementation(() => {}));
afterAll(() => jest.restoreAllMocks());

describe("reading a legacy dashboard", () => {
  const legacy = [stored("a"), stored("b", "m")];

  it("returns the widgets exactly as stored, with no layout added", async () => {
    mockRepo.listByAccount.mockResolvedValueOnce([record(legacy)]);
    const [dashboard] = await listOrSeedDashboards("acct-1", "user-1");
    expect(dashboard?.widgets).toHaveLength(2);
    for (const widget of dashboard!.widgets) expect("layout" in widget).toBe(false);
  });

  it("writes nothing — a read is side-effect free", async () => {
    mockRepo.listByAccount.mockResolvedValueOnce([record(legacy)]);
    await listOrSeedDashboards("acct-1", "user-1");
    for (const fn of WRITE_FNS) expect(mockRepo[fn]).not.toHaveBeenCalled();
  });

  it("does not mutate the row the repository handed it", async () => {
    const row = record(legacy);
    const snapshot = JSON.stringify(row.widgets);
    mockRepo.listByAccount.mockResolvedValueOnce([row]);
    await listOrSeedDashboards("acct-1", "user-1");
    expect(JSON.stringify(row.widgets)).toBe(snapshot);
  });
});

describe("reading an explicit-layout dashboard", () => {
  const explicit = [
    stored("a", "s", { x: 3, y: 0, w: 1, h: 1 }),
    stored("b", "m", { x: 0, y: 2, w: 2, h: 1 }),
  ];

  it("round-trips the exact rectangles", async () => {
    mockRepo.listByAccount.mockResolvedValueOnce([record(explicit)]);
    const [dashboard] = await listOrSeedDashboards("acct-1", "user-1");
    expect(dashboard?.widgets.map((w) => w.layout)).toEqual([
      { x: 3, y: 0, w: 1, h: 1 },
      { x: 0, y: 2, w: 2, h: 1 },
    ]);
  });

  it("preserves the board's gaps — nothing is compacted on read", async () => {
    mockRepo.listByAccount.mockResolvedValueOnce([record(explicit)]);
    const [dashboard] = await listOrSeedDashboards("acct-1", "user-1");
    expect(dashboard?.widgets.map((w) => `${w.layout?.x},${w.layout?.y}`)).toEqual(["3,0", "0,2"]);
  });

  it("writes nothing on read", async () => {
    mockRepo.listByAccount.mockResolvedValueOnce([record(explicit)]);
    await listOrSeedDashboards("acct-1", "user-1");
    for (const fn of WRITE_FNS) expect(mockRepo[fn]).not.toHaveBeenCalled();
  });
});

describe("reading a damaged dashboard", () => {
  it("keeps every widget when a layout field is malformed", async () => {
    mockRepo.listByAccount.mockResolvedValueOnce([
      record([stored("a", "s", { x: "nope" }), stored("b")]),
    ]);
    const [dashboard] = await listOrSeedDashboards("acct-1", "user-1");
    expect(dashboard?.widgets.map((w) => w.id)).toEqual(["a", "b"]);
    expect(dashboard?.widgets[0]?.layout).toBeUndefined();
  });

  it("keeps every widget when the board overlaps, and still writes nothing", async () => {
    mockRepo.listByAccount.mockResolvedValueOnce([
      record([
        stored("a", "m", { x: 0, y: 0, w: 2, h: 1 }),
        stored("b", "m", { x: 1, y: 0, w: 2, h: 1 }),
      ]),
    ]);
    const [dashboard] = await listOrSeedDashboards("acct-1", "user-1");
    expect(dashboard?.widgets).toHaveLength(2);
    for (const fn of WRITE_FNS) expect(mockRepo[fn]).not.toHaveBeenCalled();
  });

  it("logs a diagnostic carrying no stored user content", async () => {
    const warn = console.warn as jest.Mock;
    warn.mockClear();
    mockRepo.listByAccount.mockResolvedValueOnce([
      record([
        { ...stored("a"), title: "Q3 acquisition targets", config: { source: "any", note: "confidential" } },
        stored("b", "s", { x: "nope" }),
      ]),
    ]);
    await listOrSeedDashboards("acct-1", "user-1");
    expect(warn).toHaveBeenCalled();
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain("acquisition");
    expect(logged).not.toContain("confidential");
  });
});

describe("saving a dashboard", () => {
  it("passes an explicit board through to persistence unchanged", async () => {
    const explicit = [stored("a", "s", { x: 3, y: 0, w: 1, h: 1 })];
    mockRepo.updateServiceRole.mockResolvedValueOnce(record(explicit));
    const saved = await updateDashboard("11111111-1111-1111-1111-111111111111", {
      widgets: explicit as never,
    });
    expect(mockRepo.updateServiceRole).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      { widgets: explicit },
    );
    expect(saved.widgets[0]?.layout).toEqual({ x: 3, y: 0, w: 1, h: 1 });
  });

  it("a name-only save carries no widgets, so a legacy board cannot be converted", async () => {
    const legacy = [stored("a"), stored("b")];
    mockRepo.updateServiceRole.mockResolvedValueOnce(record(legacy));
    const saved = await updateDashboard("11111111-1111-1111-1111-111111111111", {
      name: "Renamed",
    });
    expect(mockRepo.updateServiceRole).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      { name: "Renamed" },
    );
    for (const widget of saved.widgets) expect("layout" in widget).toBe(false);
  });
});
