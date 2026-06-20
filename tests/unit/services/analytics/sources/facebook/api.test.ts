/**
 * @jest-environment node
 *
 * Bounded, aggregate/metadata-only Facebook readers (Slice ANALYTICS-SOURCES-FACEBOOK-1):
 * verifies the page audience-count read (fan_count/followers_count fields only, null
 * handling) and the page-post scan (created_time only — never message/story/attachments;
 * `after`-cursor pagination + truncation budget). The shared `graphRequest` transport is
 * mocked — no network.
 */

const mockGraphRequest = jest.fn();
jest.mock("@/integrations/_shared/facebook/api/_request", () => ({
  __esModule: true,
  graphRequest: (...a: unknown[]) => mockGraphRequest(...a),
}));

import {
  getPageAudienceCounts,
  scanPagePosts,
  POSTS_PAGE_SIZE,
} from "@/services/analytics/sources/facebook/api";

beforeEach(() => jest.clearAllMocks());

describe("getPageAudienceCounts", () => {
  it("requests only fan_count,followers_count and projects the aggregate numbers", async () => {
    mockGraphRequest.mockResolvedValueOnce({ fan_count: 1500, followers_count: 1620 });
    const r = await getPageAudienceCounts({ pageAccessToken: "page-tok", pageId: "123" });
    expect(r).toEqual({ fanCount: 1500, followersCount: 1620 });
    const call = mockGraphRequest.mock.calls[0]![0];
    expect(call.path).toBe("/123");
    expect(call.query).toEqual({ fields: "fan_count,followers_count" });
    expect(call.accessToken).toBe("page-tok");
  });

  it("returns null for missing/non-numeric aggregate fields", async () => {
    mockGraphRequest.mockResolvedValueOnce({ fan_count: "lots" });
    const r = await getPageAudienceCounts({ pageAccessToken: "page-tok", pageId: "123" });
    expect(r).toEqual({ fanCount: null, followersCount: null });
  });
});

describe("scanPagePosts", () => {
  it("requests created_time only and projects epoch-ms timestamps", async () => {
    mockGraphRequest.mockResolvedValueOnce({
      data: [{ created_time: "2026-06-01T09:00:00+0000" }, { created_time: "2026-06-02T09:00:00+0000" }],
    });
    const r = await scanPagePosts("page-tok", "123");
    expect(r.timestamps).toEqual([
      Date.parse("2026-06-01T09:00:00+0000"),
      Date.parse("2026-06-02T09:00:00+0000"),
    ]);
    expect(r.truncated).toBe(false);
    const call = mockGraphRequest.mock.calls[0]![0];
    expect(call.path).toBe("/123/posts");
    expect(call.query).toMatchObject({ fields: "created_time", limit: POSTS_PAGE_SIZE });
  });

  it("paginates via the opaque `after` cursor until paging.next is absent", async () => {
    let call = 0;
    mockGraphRequest.mockImplementation(async () => {
      call++;
      if (call === 1) {
        return {
          data: [{ created_time: "2026-06-01T00:00:00+0000" }],
          paging: { cursors: { after: "CUR2" }, next: "https://graph.facebook.com/next" },
        };
      }
      return { data: [{ created_time: "2026-06-02T00:00:00+0000" }] }; // no paging.next → stop
    });
    const r = await scanPagePosts("page-tok", "123");
    expect(r.timestamps).toHaveLength(2);
    expect(mockGraphRequest.mock.calls[1]![0].query).toMatchObject({ after: "CUR2" });
  });

  it("reports truncated when the post-scan budget is exhausted", async () => {
    mockGraphRequest.mockResolvedValue({
      data: [{ created_time: "2026-06-01T00:00:00+0000" }],
      paging: { cursors: { after: "MORE" }, next: "https://graph.facebook.com/more" },
    });
    const r = await scanPagePosts("page-tok", "123", { maxPages: 2 });
    expect(r.truncated).toBe(true);
    expect(r.timestamps).toHaveLength(2);
  });

  it("never carries post message/story/attachments into the result", async () => {
    mockGraphRequest.mockResolvedValueOnce({
      data: [
        {
          created_time: "2026-06-01T00:00:00+0000",
          message: "SECRET POST BODY",
          story: "X shared a link",
          attachments: { data: [{ url: "http://x" }] },
        },
      ],
    });
    const r = await scanPagePosts("page-tok", "123");
    expect(JSON.stringify(r)).not.toMatch(/SECRET POST BODY|shared a link|attachments|http:\/\/x/);
  });
});
