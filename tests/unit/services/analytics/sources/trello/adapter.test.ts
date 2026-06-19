/**
 * @jest-environment node
 *
 * Trello analytics adapter (Slice ANALYTICS-SOURCES-TRELLO-1): per-viewer personal
 * credential resolution (decrypt token, non-refreshable), privacy-safe
 * project-activity metrics (only card timing / due / list-id / open-closed flags
 * read — never card name/description/comments/members), required board validation,
 * and typed, leak-free error normalization. No network/DB — the credential repo,
 * token decryption, and the bounded board reader are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockDecrypt = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  __esModule: true,
  decryptToken: (...args: unknown[]) => mockDecrypt(...args),
}));

const mockFetchCards = jest.fn();
const mockFetchLists = jest.fn();
jest.mock("@/services/analytics/sources/trello/api", () => ({
  __esModule: true,
  fetchBoardCards: (...args: unknown[]) => mockFetchCards(...args),
  fetchBoardLists: (...args: unknown[]) => mockFetchLists(...args),
  MAX_CARDS: 1000,
}));

import { trelloAnalyticsSource } from "@/services/analytics/sources/trello";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { TrelloNotFoundError } from "@/integrations/_shared/trello/api/errors";

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-04T00:00:00Z" }; // 4 day-buckets
const BOARD = "5f1a2b3c4d5e6f7a8b9c0d1e"; // 24-hex
const ms = (iso: string) => Date.parse(iso);

const OPEN_CARDS = [
  { createdMs: ms("2026-06-01T09:00:00Z"), due: "2020-01-01T00:00:00Z", dueComplete: false, idList: "L1", closed: false }, // overdue
  { createdMs: ms("2026-06-02T09:00:00Z"), due: "2020-01-01T00:00:00Z", dueComplete: true, idList: "L1", closed: false }, // due done → not overdue
  { createdMs: ms("2026-05-15T09:00:00Z"), due: null, dueComplete: false, idList: "L2", closed: false }, // created before range
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ accessTokenEncrypted: "enc" });
  mockDecrypt.mockReturnValue("tok");
  mockFetchCards.mockImplementation((_t: string, _b: string, filter: string) => {
    if (filter === "open") return Promise.resolve({ facts: OPEN_CARDS, truncated: false });
    if (filter === "closed") return Promise.resolve({ facts: [OPEN_CARDS[0], OPEN_CARDS[1]], truncated: false });
    return Promise.resolve({ facts: OPEN_CARDS, truncated: false }); // "all"
  });
  mockFetchLists.mockResolvedValue([
    { id: "L1", name: "To Do" },
    { id: "L2", name: "Done" },
  ]);
});

describe("metric registration", () => {
  it("exposes only the approved read-only metric set; every metric needs a board", () => {
    expect(trelloAnalyticsSource.providerKey).toBe("trello");
    expect(trelloAnalyticsSource.connectedApp).toBe(true);
    expect(trelloAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "cards_by_list",
      "cards_created_over_time",
      "closed_cards_count",
      "open_cards_count",
      "overdue_cards_count",
    ]);
    for (const m of trelloAnalyticsSource.metrics) expect(m.supportedFilters).toEqual(["board"]);
  });
});

describe("validation (no I/O before it passes)", () => {
  it("rejects an unknown metric", async () => {
    await expect(
      trelloAnalyticsSource.query({ metricKey: "read_card_text", range: RANGE, filters: { board: BOARD } }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a missing / malformed board id before any I/O", async () => {
    await expect(
      trelloAnalyticsSource.query({ metricKey: "open_cards_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    await expect(
      trelloAnalyticsSource.query({ metricKey: "open_cards_count", range: RANGE, filters: { board: "not-hex" } }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });
});

describe("credential resolution (personal — viewer's own)", () => {
  it("pins to ctx.userId and decrypts that row's token", async () => {
    await trelloAnalyticsSource.query({ metricKey: "open_cards_count", range: RANGE, filters: { board: BOARD } }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "trello", null, { connectedByUserId: "user-1" });
    expect(mockDecrypt).toHaveBeenCalledWith("enc");
    expect(mockFetchCards.mock.calls[0]![0]).toBe("tok");
    expect(mockFetchCards.mock.calls[0]![1]).toBe(BOARD);
  });

  it("returns MISSING_CREDENTIAL when the viewer has no Trello connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      trelloAnalyticsSource.query({ metricKey: "open_cards_count", range: RANGE, filters: { board: BOARD } }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockFetchCards).not.toHaveBeenCalled();
  });
});

describe("metrics", () => {
  it("open_cards_count counts open cards", async () => {
    const r = await trelloAnalyticsSource.query({ metricKey: "open_cards_count", range: RANGE, filters: { board: BOARD } }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ open_cards_count: 3 });
    expect(mockFetchCards.mock.calls[0]![2]).toBe("open");
  });

  it("closed_cards_count counts archived cards", async () => {
    const r = await trelloAnalyticsSource.query({ metricKey: "closed_cards_count", range: RANGE, filters: { board: BOARD } }, CTX);
    expect(r.totals).toEqual({ closed_cards_count: 2 });
    expect(mockFetchCards.mock.calls[0]![2]).toBe("closed");
  });

  it("overdue_cards_count counts open cards past due and not complete", async () => {
    const r = await trelloAnalyticsSource.query({ metricKey: "overdue_cards_count", range: RANGE, filters: { board: BOARD } }, CTX);
    expect(r.totals).toEqual({ overdue_cards_count: 1 }); // only the not-complete past-due card
  });

  it("cards_created_over_time buckets by created time (out-of-range excluded)", async () => {
    const r = await trelloAnalyticsSource.query(
      { metricKey: "cards_created_over_time", range: RANGE, filters: { board: BOARD } },
      CTX,
    );
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((row) => row.count)).toEqual([1, 1, 0, 0]); // 06-01, 06-02 (05-15 excluded)
    expect(r.totals?.count).toBe(2);
    expect(mockFetchCards.mock.calls[0]![2]).toBe("all");
  });

  it("cards_by_list groups open cards by list NAME and preserves board list order", async () => {
    const r = await trelloAnalyticsSource.query({ metricKey: "cards_by_list", range: RANGE, filters: { board: BOARD } }, CTX);
    expect(r.shape).toBe("series");
    expect(r.rows).toEqual([
      { date: "To Do", count: 2 },
      { date: "Done", count: 1 },
    ]);
    expect(r.totals?.count).toBe(3);
  });

  it("surfaces a truncation warning when the board read hit the cap", async () => {
    mockFetchCards.mockResolvedValue({ facts: OPEN_CARDS, truncated: true });
    const r = await trelloAnalyticsSource.query({ metricKey: "open_cards_count", range: RANGE, filters: { board: BOARD } }, CTX);
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces card name / description / member detail — only counts + list labels", async () => {
    const r = await trelloAnalyticsSource.query({ metricKey: "cards_by_list", range: RANGE, filters: { board: BOARD } }, CTX);
    expect(JSON.stringify(r)).not.toMatch(/desc|comment|checklist|member|attachment|shortUrl|\bname\b/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("a 401 → MISSING_CREDENTIAL", async () => {
    mockFetchCards.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      trelloAnalyticsSource.query({ metricKey: "open_cards_count", range: RANGE, filters: { board: BOARD } }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a board not-found → INVALID_QUERY (user-fixable)", async () => {
    mockFetchCards.mockRejectedValueOnce(new TrelloNotFoundError("board cards", "not found"));
    await expect(
      trelloAnalyticsSource.query({ metricKey: "open_cards_count", range: RANGE, filters: { board: BOARD } }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("a rate-limit error → RATE_LIMITED", async () => {
    mockFetchCards.mockRejectedValueOnce(new Error("Trello GET /1/boards/x/cards failed: 429 rate limit"));
    await expect(
      trelloAnalyticsSource.query({ metricKey: "open_cards_count", range: RANGE, filters: { board: BOARD } }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockFetchCards.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await trelloAnalyticsSource
      .query({ metricKey: "open_cards_count", range: RANGE, filters: { board: BOARD } }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
