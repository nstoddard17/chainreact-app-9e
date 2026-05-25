/**
 * @jest-environment node
 *
 * Tests for integrations/notion/api/comments (Notion 2.1 Commit 3).
 *
 * Covers:
 *   - commentsCreate request shape (page-parent + discussion-id), rich_text
 *     synthesis from text, NOTION_API_BASE override, 401/404 mapping
 *   - commentsList request path (block_id query param), pagination params,
 *     NOTION_API_BASE override, 401/404 mapping
 */
import {
  commentsCreate,
  commentsList,
} from "@/integrations/notion/api/comments";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/notion/api/errors";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.NOTION_API_BASE;
});

function mockFetchOnce(opts: { status: number; body: unknown }): jest.SpyInstance {
  return jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(
      typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
      { status: opts.status },
    ),
  );
}

describe("commentsCreate — page parent (new discussion)", () => {
  it("POSTs /v1/comments with parent.page_id and rich_text synthesized from text", async () => {
    const spy = mockFetchOnce({
      status: 200,
      body: {
        object: "comment",
        id: "c-1",
        parent: { type: "page_id", page_id: "p-1" },
        discussion_id: "d-1",
      },
    });
    await commentsCreate({
      accessToken: "tok",
      target: { pageId: "p-1" },
      text: "Hello world",
    });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.notion.com/v1/comments");
    expect(init!.method).toBe("POST");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["Notion-Version"]).toBe("2022-06-28");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init!.body as string);
    expect(body.parent).toEqual({ page_id: "p-1" });
    expect(body.rich_text).toEqual([
      { type: "text", text: { content: "Hello world" } },
    ]);
    // discussion_id MUST NOT be sent when targeting a page parent.
    expect(body.discussion_id).toBeUndefined();
  });

  it("returns the parsed comment response", async () => {
    mockFetchOnce({
      status: 200,
      body: {
        object: "comment",
        id: "c-1",
        parent: { type: "page_id", page_id: "p-1" },
        discussion_id: "d-1",
        created_time: "2026-05-14T10:00:00Z",
      },
    });
    const result = await commentsCreate({
      accessToken: "tok",
      target: { pageId: "p-1" },
      text: "Hello",
    });
    expect(result.id).toBe("c-1");
    expect(result.parent?.page_id).toBe("p-1");
    expect(result.discussion_id).toBe("d-1");
  });
});

describe("commentsCreate — discussion (reply to existing thread)", () => {
  it("POSTs /v1/comments with discussion_id (NOT parent) and rich_text", async () => {
    const spy = mockFetchOnce({
      status: 200,
      body: {
        object: "comment",
        id: "c-2",
        parent: { type: "block_id", block_id: "b-x" },
        discussion_id: "d-existing",
      },
    });
    await commentsCreate({
      accessToken: "tok",
      target: { discussionId: "d-existing" },
      text: "Reply here",
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.discussion_id).toBe("d-existing");
    // parent MUST NOT be sent when replying to an existing discussion.
    expect(body.parent).toBeUndefined();
    expect(body.rich_text).toEqual([
      { type: "text", text: { content: "Reply here" } },
    ]);
  });
});

describe("commentsCreate — error mapping + NOTION_API_BASE", () => {
  it("honors NOTION_API_BASE override (e2e mock)", async () => {
    process.env.NOTION_API_BASE = "http://127.0.0.1:9999";
    const spy = mockFetchOnce({
      status: 200,
      body: { object: "comment", id: "c-1" },
    });
    await commentsCreate({
      accessToken: "tok",
      target: { pageId: "p-1" },
      text: "ok",
    });
    expect(spy.mock.calls[0]![0]).toBe("http://127.0.0.1:9999/v1/comments");
  });

  it("maps 401 → Unauthorized401Error", async () => {
    mockFetchOnce({ status: 401, body: { code: "unauthorized" } });
    await expect(
      commentsCreate({
        accessToken: "tok",
        target: { pageId: "p-1" },
        text: "x",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("maps 404 → NotFoundError with 'page <id>' resource label when targeting page", async () => {
    mockFetchOnce({ status: 404, body: { code: "object_not_found" } });
    await expect(
      commentsCreate({
        accessToken: "tok",
        target: { pageId: "p-missing" },
        text: "x",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps 404 → NotFoundError with 'discussion <id>' resource label when replying", async () => {
    mockFetchOnce({ status: 404, body: { code: "object_not_found" } });
    await expect(
      commentsCreate({
        accessToken: "tok",
        target: { discussionId: "d-missing" },
        text: "x",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps other non-2xx → generic Error with method + path + Notion message", async () => {
    mockFetchOnce({ status: 429, body: { code: "rate_limited" } });
    await expect(
      commentsCreate({
        accessToken: "tok",
        target: { pageId: "p-1" },
        text: "x",
      }),
    ).rejects.toThrow(/Notion POST \/v1\/comments failed/);
  });
});

describe("commentsList", () => {
  it("GETs /v1/comments?block_id=<id> (required param)", async () => {
    const spy = mockFetchOnce({
      status: 200,
      body: { object: "list", results: [], has_more: false, next_cursor: null },
    });
    await commentsList({ accessToken: "tok", blockId: "p-1" });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.notion.com/v1/comments?block_id=p-1");
    expect(init!.method).toBe("GET");
  });

  it("forwards pageSize as snake_case page_size", async () => {
    const spy = mockFetchOnce({
      status: 200,
      body: { object: "list", results: [], has_more: false, next_cursor: null },
    });
    await commentsList({ accessToken: "tok", blockId: "p-1", pageSize: 25 });
    const url = spy.mock.calls[0]![0] as string;
    expect(url).toContain("block_id=p-1");
    expect(url).toContain("page_size=25");
  });

  it("forwards startCursor as snake_case start_cursor", async () => {
    const spy = mockFetchOnce({
      status: 200,
      body: { object: "list", results: [], has_more: false, next_cursor: null },
    });
    await commentsList({
      accessToken: "tok",
      blockId: "p-1",
      startCursor: "cur-a",
    });
    const url = spy.mock.calls[0]![0] as string;
    expect(url).toContain("start_cursor=cur-a");
  });

  it("URL-encodes blockId when it contains special characters", async () => {
    const spy = mockFetchOnce({
      status: 200,
      body: { object: "list", results: [], has_more: false, next_cursor: null },
    });
    await commentsList({ accessToken: "tok", blockId: "p with space" });
    expect(spy.mock.calls[0]![0]).toContain("block_id=p+with+space");
  });

  it("returns the parsed list response with results, has_more, next_cursor", async () => {
    mockFetchOnce({
      status: 200,
      body: {
        object: "list",
        results: [{ object: "comment", id: "c-1" }],
        has_more: true,
        next_cursor: "cur-x",
      },
    });
    const list = await commentsList({ accessToken: "tok", blockId: "p-1" });
    expect(list.results).toHaveLength(1);
    expect(list.has_more).toBe(true);
    expect(list.next_cursor).toBe("cur-x");
  });

  it("honors NOTION_API_BASE override (e2e mock)", async () => {
    process.env.NOTION_API_BASE = "http://127.0.0.1:9999";
    const spy = mockFetchOnce({
      status: 200,
      body: { object: "list", results: [], has_more: false, next_cursor: null },
    });
    await commentsList({ accessToken: "tok", blockId: "p-1", pageSize: 5 });
    const url = spy.mock.calls[0]![0] as string;
    expect(url.startsWith("http://127.0.0.1:9999/v1/comments?")).toBe(true);
  });

  it("maps 401 → Unauthorized401Error", async () => {
    mockFetchOnce({ status: 401, body: { code: "unauthorized" } });
    await expect(
      commentsList({ accessToken: "tok", blockId: "p-1" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("maps 404 → NotFoundError with 'comments for <id>' resource label", async () => {
    mockFetchOnce({ status: 404, body: { code: "object_not_found" } });
    await expect(
      commentsList({ accessToken: "tok", blockId: "p-missing" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
