/**
 * @jest-environment node
 */
import { databasesQuery } from "@/integrations/notion/api/databases";

afterEach(() => jest.restoreAllMocks());

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
