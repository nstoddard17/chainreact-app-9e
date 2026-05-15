/**
 * @jest-environment node
 */
import {
  databasesCreate,
  databasesQuery,
} from "@/integrations/notion/api/databases";
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

describe("databasesQuery", () => {
  it("POSTs /v1/databases/{id}/query with optional fields omitted", async () => {
    const spy = mockFetchOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    await databasesQuery({ accessToken: "tok", databaseId: "db-1" });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.notion.com/v1/databases/db-1/query",
    );
    expect(spy.mock.calls[0]![1]!.method).toBe("POST");
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({});
  });

  it("forward-passes filter / sorts / pagination params (snake_case keys)", async () => {
    const spy = mockFetchOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    await databasesQuery({
      accessToken: "tok",
      databaseId: "db-1",
      filter: { property: "Status", status: { equals: "Done" } },
      sorts: [{ property: "Name", direction: "ascending" }],
      pageSize: 50,
      startCursor: "cur-xyz",
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.filter).toEqual({
      property: "Status",
      status: { equals: "Done" },
    });
    expect(body.sorts).toHaveLength(1);
    expect(body.page_size).toBe(50);
    expect(body.start_cursor).toBe("cur-xyz");
  });

  it("URL-encodes the databaseId", async () => {
    const spy = mockFetchOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    await databasesQuery({ accessToken: "t", databaseId: "db with space" });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.notion.com/v1/databases/db%20with%20space/query",
    );
  });

  it("returns the parsed Notion list response", async () => {
    mockFetchOnce({
      object: "list",
      results: [{ object: "page", id: "row-1" }],
      has_more: true,
      next_cursor: "next-1",
    });
    const result = await databasesQuery({
      accessToken: "tok",
      databaseId: "db-1",
    });
    expect(result.results).toHaveLength(1);
    expect(result.has_more).toBe(true);
    expect(result.next_cursor).toBe("next-1");
  });
});

describe("databasesCreate", () => {
  it("POSTs /v1/databases with parent.page_id + synthesized title rich_text + properties wire-format", async () => {
    const spy = mockFetchOnce({
      object: "database",
      id: "db-new",
      url: "https://notion.so/db-new",
    });
    await databasesCreate({
      accessToken: "tok",
      parentPageId: "p-1",
      title: "My Database",
      properties: {
        Name: { type: "title" },
        Done: { type: "checkbox" },
      },
    });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.notion.com/v1/databases");
    expect(init!.method).toBe("POST");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["Notion-Version"]).toBe("2022-06-28");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init!.body as string);
    expect(body.parent).toEqual({ type: "page_id", page_id: "p-1" });
    expect(body.title).toEqual([
      { type: "text", text: { content: "My Database" } },
    ]);
    // V2 property descriptor → Notion's `{ <type>: {} }` wire-format.
    expect(body.properties).toEqual({
      Name: { title: {} },
      Done: { checkbox: {} },
    });
    // Optional fields omitted (Q11).
    expect(body.description).toBeUndefined();
    expect(body.is_inline).toBeUndefined();
  });

  it("includes description as synthesized rich_text when supplied", async () => {
    const spy = mockFetchOnce({ object: "database", id: "db-new" });
    await databasesCreate({
      accessToken: "tok",
      parentPageId: "p-1",
      title: "T",
      description: "Hello desc",
      properties: { Name: { type: "title" } },
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.description).toEqual([
      { type: "text", text: { content: "Hello desc" } },
    ]);
  });

  it("includes is_inline only when supplied", async () => {
    const spy = mockFetchOnce({ object: "database", id: "db-new" });
    await databasesCreate({
      accessToken: "tok",
      parentPageId: "p-1",
      title: "T",
      isInline: true,
      properties: { Name: { type: "title" } },
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.is_inline).toBe(true);
  });

  it("honors NOTION_API_BASE override (e2e mock)", async () => {
    process.env.NOTION_API_BASE = "http://127.0.0.1:9999";
    const spy = mockFetchOnce({ object: "database", id: "db-new" });
    await databasesCreate({
      accessToken: "tok",
      parentPageId: "p-1",
      title: "T",
      properties: { Name: { type: "title" } },
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9999/v1/databases",
    );
  });

  it("returns the parsed database response", async () => {
    mockFetchOnce({
      object: "database",
      id: "db-new",
      url: "https://x",
      title: [{ plain_text: "T", text: { content: "T" } }],
    });
    const db = await databasesCreate({
      accessToken: "tok",
      parentPageId: "p-1",
      title: "T",
      properties: { Name: { type: "title" } },
    });
    expect(db.id).toBe("db-new");
    expect(db.url).toBe("https://x");
  });

  it("maps 401 → Unauthorized401Error", async () => {
    mockFetchOnce({ code: "unauthorized" }, 401);
    await expect(
      databasesCreate({
        accessToken: "tok",
        parentPageId: "p-1",
        title: "T",
        properties: { Name: { type: "title" } },
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("maps 404 → NotFoundError with 'page <id>' resource label", async () => {
    mockFetchOnce({ code: "object_not_found" }, 404);
    await expect(
      databasesCreate({
        accessToken: "tok",
        parentPageId: "p-missing",
        title: "T",
        properties: { Name: { type: "title" } },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps other non-2xx → tagged Error", async () => {
    mockFetchOnce({ code: "rate_limited" }, 429);
    await expect(
      databasesCreate({
        accessToken: "tok",
        parentPageId: "p-1",
        title: "T",
        properties: { Name: { type: "title" } },
      }),
    ).rejects.toThrow(/Notion POST \/v1\/databases failed/);
  });
});
