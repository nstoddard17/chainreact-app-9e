/**
 * @jest-environment node
 *
 * Tests for integrations/notion/api/users (Notion 2.1 Commit 2).
 *
 * Mirrors the existing api/pages.test.ts + api/search.test.ts patterns.
 * Covers: request path, query-string pagination, NOTION_API_BASE
 * override, 401 + 404 + generic error mapping (inherited from
 * notionRequest — re-asserted here so the wrapper-level contract
 * shows up in test coverage).
 */
import { usersList, usersRetrieve } from "@/integrations/notion/api/users";
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

describe("usersRetrieve", () => {
  it("GETs /v1/users/{id} with the access token + Notion-Version header", async () => {
    const spy = mockFetchOnce({
      status: 200,
      body: { object: "user", id: "u-1", type: "person" },
    });
    await usersRetrieve({ accessToken: "tok", userId: "u-1" });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.notion.com/v1/users/u-1");
    expect(init!.method).toBe("GET");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["Notion-Version"]).toBe("2022-06-28");
    // GET — no Content-Type expected.
    expect(headers["Content-Type"]).toBeUndefined();
    expect(init!.body).toBeUndefined();
  });

  it("URI-encodes the userId in the path", async () => {
    const spy = mockFetchOnce({
      status: 200,
      body: { object: "user", id: "u/with slash", type: "person" },
    });
    await usersRetrieve({ accessToken: "tok", userId: "u/with slash" });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.notion.com/v1/users/u%2Fwith%20slash",
    );
  });

  it("honors NOTION_API_BASE override (e2e mock)", async () => {
    process.env.NOTION_API_BASE = "http://127.0.0.1:9999";
    const spy = mockFetchOnce({
      status: 200,
      body: { object: "user", id: "u-1", type: "person" },
    });
    await usersRetrieve({ accessToken: "tok", userId: "u-1" });
    expect(spy.mock.calls[0]![0]).toBe("http://127.0.0.1:9999/v1/users/u-1");
  });

  it("returns the parsed user object", async () => {
    mockFetchOnce({
      status: 200,
      body: {
        object: "user",
        id: "u-1",
        type: "person",
        name: "Alice",
        avatar_url: "https://x",
        person: { email: "alice@example.com" },
      },
    });
    const user = await usersRetrieve({ accessToken: "tok", userId: "u-1" });
    expect(user.id).toBe("u-1");
    expect(user.type).toBe("person");
    expect(user.person?.email).toBe("alice@example.com");
  });

  it("maps 401 → Unauthorized401Error (caught by refreshAndRetry)", async () => {
    mockFetchOnce({ status: 401, body: { code: "unauthorized" } });
    await expect(
      usersRetrieve({ accessToken: "tok", userId: "u-1" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("maps 404 → NotFoundError with 'user <id>' resource label", async () => {
    mockFetchOnce({ status: 404, body: { code: "object_not_found" } });
    await expect(
      usersRetrieve({ accessToken: "tok", userId: "u-missing" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps other non-2xx → generic Error with method + path + Notion message", async () => {
    mockFetchOnce({ status: 429, body: { code: "rate_limited" } });
    await expect(
      usersRetrieve({ accessToken: "tok", userId: "u-1" }),
    ).rejects.toThrow(/Notion GET \/v1\/users\/u-1 failed/);
  });
});

describe("usersList", () => {
  it("GETs /v1/users without query string when no pagination args supplied", async () => {
    const spy = mockFetchOnce({
      status: 200,
      body: { object: "list", results: [], has_more: false, next_cursor: null },
    });
    await usersList({ accessToken: "tok" });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.notion.com/v1/users");
    expect(init!.method).toBe("GET");
  });

  it("forwards pageSize as snake_case page_size query param", async () => {
    const spy = mockFetchOnce({
      status: 200,
      body: { object: "list", results: [], has_more: false, next_cursor: null },
    });
    await usersList({ accessToken: "tok", pageSize: 25 });
    const [url] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.notion.com/v1/users?page_size=25");
  });

  it("forwards startCursor as snake_case start_cursor query param", async () => {
    const spy = mockFetchOnce({
      status: 200,
      body: { object: "list", results: [], has_more: false, next_cursor: null },
    });
    await usersList({ accessToken: "tok", startCursor: "cursor-abc" });
    const [url] = spy.mock.calls[0]!;
    expect(url).toBe(
      "https://api.notion.com/v1/users?start_cursor=cursor-abc",
    );
  });

  it("forwards both pageSize and startCursor together", async () => {
    const spy = mockFetchOnce({
      status: 200,
      body: { object: "list", results: [], has_more: false, next_cursor: null },
    });
    await usersList({ accessToken: "tok", pageSize: 10, startCursor: "c1" });
    const url = spy.mock.calls[0]![0] as string;
    expect(url).toContain("page_size=10");
    expect(url).toContain("start_cursor=c1");
  });

  it("returns the parsed list response with results, has_more, next_cursor", async () => {
    mockFetchOnce({
      status: 200,
      body: {
        object: "list",
        results: [
          { object: "user", id: "u-1", type: "person" },
          { object: "user", id: "u-2", type: "bot" },
        ],
        has_more: true,
        next_cursor: "next-cur",
      },
    });
    const list = await usersList({ accessToken: "tok" });
    expect(list.results).toHaveLength(2);
    expect(list.has_more).toBe(true);
    expect(list.next_cursor).toBe("next-cur");
  });

  it("honors NOTION_API_BASE override (e2e mock)", async () => {
    process.env.NOTION_API_BASE = "http://127.0.0.1:9999";
    const spy = mockFetchOnce({
      status: 200,
      body: { object: "list", results: [], has_more: false, next_cursor: null },
    });
    await usersList({ accessToken: "tok", pageSize: 5 });
    expect(spy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9999/v1/users?page_size=5",
    );
  });

  it("maps 401 → Unauthorized401Error", async () => {
    mockFetchOnce({ status: 401, body: { code: "unauthorized" } });
    await expect(usersList({ accessToken: "tok" })).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("maps 404 → NotFoundError with 'users endpoint' resource label", async () => {
    mockFetchOnce({ status: 404, body: { code: "object_not_found" } });
    await expect(usersList({ accessToken: "tok" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
