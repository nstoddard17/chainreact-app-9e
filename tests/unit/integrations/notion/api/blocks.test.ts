/**
 * @jest-environment node
 */
import {
  blocksAppendChildren,
  blocksChildrenList,
  blocksRetrieve,
} from "@/integrations/notion/api/blocks";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/notion/api/errors";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.NOTION_API_BASE;
});

function mockFetchOnce(body: unknown, status = 200): jest.SpyInstance {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

describe("blocksAppendChildren", () => {
  it("PATCHes /v1/blocks/{id}/children with the children array", async () => {
    const spy = mockFetchOnce({
      object: "list",
      results: [{ object: "block", id: "b-1", type: "paragraph" }],
    });
    await blocksAppendChildren({
      accessToken: "tok",
      blockId: "page-1",
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: "hi" } }],
          },
        },
      ],
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.notion.com/v1/blocks/page-1/children",
    );
    expect(spy.mock.calls[0]![1]!.method).toBe("PATCH");
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.children).toHaveLength(1);
    expect(body.children[0].type).toBe("paragraph");
  });

  it("URL-encodes the blockId", async () => {
    const spy = mockFetchOnce({ object: "list", results: [] });
    await blocksAppendChildren({
      accessToken: "t",
      blockId: "p with space",
      children: [{ object: "block", type: "divider", divider: {} }],
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.notion.com/v1/blocks/p%20with%20space/children",
    );
  });

  it("returns the list of newly-created block ids", async () => {
    mockFetchOnce({
      object: "list",
      results: [
        { object: "block", id: "b-1" },
        { object: "block", id: "b-2" },
      ],
    });
    const result = await blocksAppendChildren({
      accessToken: "t",
      blockId: "p",
      children: [
        { object: "block", type: "divider", divider: {} },
        { object: "block", type: "divider", divider: {} },
      ],
    });
    expect(result.results.map((r) => r.id)).toEqual(["b-1", "b-2"]);
  });
});

describe("blocksRetrieve", () => {
  it("GETs /v1/blocks/{id} with auth + Notion-Version headers", async () => {
    const spy = mockFetchOnce({
      object: "block",
      id: "b-1",
      type: "paragraph",
    });
    await blocksRetrieve({ accessToken: "tok", blockId: "b-1" });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.notion.com/v1/blocks/b-1");
    expect(init!.method).toBe("GET");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["Notion-Version"]).toBe("2022-06-28");
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("URL-encodes the blockId in the path", async () => {
    const spy = mockFetchOnce({ object: "block", id: "x" });
    await blocksRetrieve({ accessToken: "t", blockId: "b/with slash" });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.notion.com/v1/blocks/b%2Fwith%20slash",
    );
  });

  it("honors NOTION_API_BASE override", async () => {
    process.env.NOTION_API_BASE = "http://127.0.0.1:9999";
    const spy = mockFetchOnce({ object: "block", id: "b-1" });
    await blocksRetrieve({ accessToken: "t", blockId: "b-1" });
    expect(spy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9999/v1/blocks/b-1",
    );
  });

  it("returns the parsed block object", async () => {
    mockFetchOnce({
      object: "block",
      id: "b-1",
      type: "paragraph",
      paragraph: { rich_text: [{ plain_text: "hi" }] },
      has_children: false,
    });
    const block = await blocksRetrieve({ accessToken: "t", blockId: "b-1" });
    expect(block.id).toBe("b-1");
    expect(block.type).toBe("paragraph");
  });

  it("maps 401 → Unauthorized401Error", async () => {
    mockFetchOnce({ code: "unauthorized" }, 401);
    await expect(
      blocksRetrieve({ accessToken: "t", blockId: "b-1" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("maps 404 → NotFoundError with 'block <id>' resource label", async () => {
    mockFetchOnce({ code: "object_not_found" }, 404);
    await expect(
      blocksRetrieve({ accessToken: "t", blockId: "b-missing" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("blocksChildrenList", () => {
  it("GETs /v1/blocks/{id}/children without query string when no pagination args", async () => {
    const spy = mockFetchOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    await blocksChildrenList({ accessToken: "tok", blockId: "p-1" });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.notion.com/v1/blocks/p-1/children",
    );
    expect(spy.mock.calls[0]![1]!.method).toBe("GET");
  });

  it("forwards pageSize + startCursor as snake_case query params", async () => {
    const spy = mockFetchOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    await blocksChildrenList({
      accessToken: "tok",
      blockId: "p-1",
      pageSize: 25,
      startCursor: "cur-x",
    });
    const url = spy.mock.calls[0]![0] as string;
    expect(url).toContain("page_size=25");
    expect(url).toContain("start_cursor=cur-x");
  });

  it("URL-encodes the blockId", async () => {
    const spy = mockFetchOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    await blocksChildrenList({
      accessToken: "t",
      blockId: "b/with slash",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.notion.com/v1/blocks/b%2Fwith%20slash/children",
    );
  });

  it("honors NOTION_API_BASE override", async () => {
    process.env.NOTION_API_BASE = "http://127.0.0.1:9999";
    const spy = mockFetchOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    await blocksChildrenList({
      accessToken: "t",
      blockId: "b-1",
      pageSize: 5,
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9999/v1/blocks/b-1/children?page_size=5",
    );
  });

  it("returns the parsed list response", async () => {
    mockFetchOnce({
      object: "list",
      results: [
        { object: "block", id: "b-1", type: "paragraph" },
        { object: "block", id: "b-2", type: "divider" },
      ],
      has_more: true,
      next_cursor: "cur-next",
    });
    const list = await blocksChildrenList({
      accessToken: "t",
      blockId: "p-1",
    });
    expect(list.results).toHaveLength(2);
    expect(list.has_more).toBe(true);
    expect(list.next_cursor).toBe("cur-next");
  });

  it("maps 401 → Unauthorized401Error", async () => {
    mockFetchOnce({ code: "unauthorized" }, 401);
    await expect(
      blocksChildrenList({ accessToken: "t", blockId: "b-1" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("maps 404 → NotFoundError with 'block <id>' resource label", async () => {
    mockFetchOnce({ code: "object_not_found" }, 404);
    await expect(
      blocksChildrenList({ accessToken: "t", blockId: "b-missing" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
