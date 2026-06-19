/**
 * @jest-environment node
 *
 * Monday analytics adapter (Slice ANALYTICS-SOURCES-MONDAY-1): per-viewer personal
 * credential resolution (refreshable → refreshAndRetry), privacy-safe
 * item-count/created/by-group metrics (only created_at / group-id / state read —
 * never item names/column values/updates), required board validation, and typed,
 * leak-free error normalization. No network/DB — the credential repo,
 * refreshAndRetry, and the bounded readers are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockCount = jest.fn();
const mockScan = jest.fn();
const mockGroups = jest.fn();
jest.mock("@/services/analytics/sources/monday/api", () => ({
  __esModule: true,
  fetchItemCount: (...args: unknown[]) => mockCount(...args),
  scanItems: (...args: unknown[]) => mockScan(...args),
  fetchGroups: (...args: unknown[]) => mockGroups(...args),
  PAGE_SIZE: 500,
  MAX_PAGES: 4,
}));

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { mondayAnalyticsSource } from "@/services/analytics/sources/monday";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError, RateLimitError } from "@/integrations/_shared/monday/errors";

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-04T00:00:00Z" }; // 4 day-buckets
const BOARD = "1234567890";
const ms = (iso: string) => Date.parse(iso);

const ITEMS = [
  { createdMs: ms("2026-06-01T09:00:00Z"), groupId: "g1", state: "active" },
  { createdMs: ms("2026-06-02T09:00:00Z"), groupId: "g1", state: "active" },
  { createdMs: ms("2026-05-15T09:00:00Z"), groupId: "g2", state: "active" }, // created before range
  { createdMs: ms("2026-06-01T09:00:00Z"), groupId: "g1", state: "archived" }, // archived → excluded
];
const GROUPS = [
  { id: "g1", title: "To Do" },
  { id: "g2", title: "Done" },
];

function mb(extra: Record<string, string> = {}) {
  return { monday_board: BOARD, ...extra };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ providerAccountId: "monday-user-1" });
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
  mockCount.mockResolvedValue(7);
  mockScan.mockResolvedValue({ facts: ITEMS, truncated: false });
  mockGroups.mockResolvedValue(GROUPS);
});

describe("metric registration", () => {
  it("exposes only the approved read-only metric set; every metric needs a board", () => {
    expect(mondayAnalyticsSource.providerKey).toBe("monday");
    expect(mondayAnalyticsSource.connectedApp).toBe(true);
    expect(mondayAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "items_by_group",
      "items_created_over_time",
      "open_items_count",
    ]);
    for (const m of mondayAnalyticsSource.metrics) expect(m.supportedFilters).toEqual(["monday_board"]);
  });
});

describe("validation (no I/O before it passes)", () => {
  it("rejects an unknown metric", async () => {
    await expect(
      mondayAnalyticsSource.query({ metricKey: "read_item_text", range: RANGE, filters: mb() }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a missing / non-numeric board id before any I/O", async () => {
    await expect(
      mondayAnalyticsSource.query({ metricKey: "open_items_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    await expect(
      mondayAnalyticsSource.query({ metricKey: "open_items_count", range: RANGE, filters: { monday_board: "abc" } }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });
});

describe("credential resolution (personal — viewer's own)", () => {
  it("pins to ctx.userId and refreshAndRetry uses that row's providerAccountId", async () => {
    await mondayAnalyticsSource.query({ metricKey: "open_items_count", range: RANGE, filters: mb() }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "monday", null, { connectedByUserId: "user-1" });
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "monday",
      providerAccountId: "monday-user-1",
    });
  });

  it("returns MISSING_CREDENTIAL when the viewer has no Monday connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      mondayAnalyticsSource.query({ metricKey: "open_items_count", range: RANGE, filters: mb() }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockCount).not.toHaveBeenCalled();
  });
});

describe("metrics", () => {
  it("open_items_count uses the server-side board item count (no item scan)", async () => {
    const r = await mondayAnalyticsSource.query({ metricKey: "open_items_count", range: RANGE, filters: mb() }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ open_items_count: 7 });
    expect(mockCount.mock.calls[0]![1]).toBe(BOARD);
    expect(mockScan).not.toHaveBeenCalled();
  });

  it("items_created_over_time buckets active items by created time (archived + out-of-range excluded)", async () => {
    const r = await mondayAnalyticsSource.query(
      { metricKey: "items_created_over_time", range: RANGE, filters: mb() },
      CTX,
    );
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((row) => row.count)).toEqual([1, 1, 0, 0]); // active 06-01, 06-02 (05-15 out, archived skip)
    expect(r.totals?.count).toBe(2);
  });

  it("items_by_group groups active items by group TITLE, preserving group order", async () => {
    const r = await mondayAnalyticsSource.query({ metricKey: "items_by_group", range: RANGE, filters: mb() }, CTX);
    expect(r.shape).toBe("series");
    expect(r.rows).toEqual([
      { date: "To Do", count: 2 }, // g1 active: 06-01, 06-02 (archived g1 item excluded)
      { date: "Done", count: 1 }, // g2 active: 05-15
    ]);
    expect(r.totals?.count).toBe(3);
  });

  it("surfaces a truncation warning when the item scan hit the cap", async () => {
    mockScan.mockResolvedValue({ facts: ITEMS, truncated: true });
    const r = await mondayAnalyticsSource.query(
      { metricKey: "items_created_over_time", range: RANGE, filters: mb() },
      CTX,
    );
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces item name / column / update detail — only counts + group labels", async () => {
    const r = await mondayAnalyticsSource.query({ metricKey: "items_by_group", range: RANGE, filters: mb() }, CTX);
    expect(JSON.stringify(r)).not.toMatch(/column|update|assignee|creator|\bname\b|text|value/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("IntegrationActionRequiredError → MISSING_CREDENTIAL", async () => {
    mockRefresh.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "monday",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      mondayAnalyticsSource.query({ metricKey: "open_items_count", range: RANGE, filters: mb() }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockCount.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      mondayAnalyticsSource.query({ metricKey: "open_items_count", range: RANGE, filters: mb() }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a board NotFoundError → INVALID_QUERY (user-fixable)", async () => {
    mockCount.mockRejectedValueOnce(new NotFoundError("board", "not found"));
    await expect(
      mondayAnalyticsSource.query({ metricKey: "open_items_count", range: RANGE, filters: mb() }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("a RateLimitError → RATE_LIMITED", async () => {
    mockCount.mockRejectedValueOnce(new RateLimitError("complexity budget exhausted", null));
    await expect(
      mondayAnalyticsSource.query({ metricKey: "open_items_count", range: RANGE, filters: mb() }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockCount.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await mondayAnalyticsSource
      .query({ metricKey: "open_items_count", range: RANGE, filters: mb() }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
