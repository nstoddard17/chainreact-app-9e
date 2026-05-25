/**
 * @jest-environment node
 */
import { search } from "@/integrations/notion/api/search";

afterEach(() => jest.restoreAllMocks());

function mockFetchOnce(body: unknown, status = 200): jest.SpyInstance {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

describe("search", () => {
  it("POSTs /v1/search with query (empty string allowed)", async () => {
    const spy = mockFetchOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    await search({ accessToken: "t", query: "" });
    expect(spy.mock.calls[0]![0]).toBe("https://api.notion.com/v1/search");
    expect(spy.mock.calls[0]![1]!.method).toBe("POST");
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({ query: "" });
  });

  it("forward-passes filter / pagination (snake_case)", async () => {
    const spy = mockFetchOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    await search({
      accessToken: "t",
      query: "Q2",
      filter: { value: "page", property: "object" },
      pageSize: 25,
      startCursor: "cur-x",
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.filter).toEqual({ value: "page", property: "object" });
    expect(body.page_size).toBe(25);
    expect(body.start_cursor).toBe("cur-x");
  });

  it("returns the parsed Notion list response", async () => {
    mockFetchOnce({
      object: "list",
      results: [
        { object: "page", id: "p-1", url: "https://x" },
        { object: "database", id: "db-1" },
      ],
      has_more: false,
      next_cursor: null,
    });
    const result = await search({ accessToken: "t", query: "x" });
    expect(result.results).toHaveLength(2);
    expect(result.results[0]!.object).toBe("page");
    expect(result.results[1]!.object).toBe("database");
  });
});
