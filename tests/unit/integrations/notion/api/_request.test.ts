/**
 * @jest-environment node
 *
 * Shared HTTP-helper tests. Verifies the headers + URL + error mapping
 * that every per-resource wrapper relies on.
 */
import { notionRequest } from "@/integrations/notion/api/_request";
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

describe("notionRequest — request shape", () => {
  it("sets Authorization, Notion-Version, and Content-Type for POST", async () => {
    const spy = mockFetchOnce({ status: 200, body: { ok: true } });
    await notionRequest({
      accessToken: "tok",
      method: "POST",
      path: "/v1/pages",
      body: { foo: "bar" },
      resourceForNotFound: "page-parent",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.notion.com/v1/pages");
    expect(init!.method).toBe("POST");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["Notion-Version"]).toBe("2022-06-28");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init!.body).toBe(JSON.stringify({ foo: "bar" }));
  });

  it("omits Content-Type for GET (no body)", async () => {
    const spy = mockFetchOnce({ status: 200, body: { ok: true } });
    await notionRequest({
      accessToken: "tok",
      method: "GET",
      path: "/v1/pages/p-1",
      resourceForNotFound: "page p-1",
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(spy.mock.calls[0]![1]!.body).toBeUndefined();
  });

  it("uses NOTION_API_BASE override when set", async () => {
    process.env.NOTION_API_BASE = "http://localhost:9879";
    const spy = mockFetchOnce({ status: 200, body: {} });
    await notionRequest({
      accessToken: "t",
      method: "GET",
      path: "/v1/users/me",
      resourceForNotFound: "me",
    });
    expect(spy.mock.calls[0]![0]).toBe("http://localhost:9879/v1/users/me");
  });
});

describe("notionRequest — error mapping", () => {
  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ status: 401, body: { object: "error", status: 401 } });
    await expect(
      notionRequest({
        accessToken: "t",
        method: "GET",
        path: "/v1/pages/p",
        resourceForNotFound: "page p",
      }),
    ).rejects.toThrow(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 with resource label + parsed message", async () => {
    mockFetchOnce({
      status: 404,
      body: {
        object: "error",
        status: 404,
        code: "object_not_found",
        message: "Could not find page with ID: p-1",
      },
    });
    expect.assertions(3);
    try {
      await notionRequest({
        accessToken: "t",
        method: "GET",
        path: "/v1/pages/p-1",
        resourceForNotFound: "page p-1",
      });
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
      const nf = err as NotFoundError;
      expect(nf.resource).toBe("page p-1");
      expect(nf.message).toContain("Could not find page with ID: p-1");
    }
  });

  it("throws generic Error with parsed message on other 4xx/5xx", async () => {
    mockFetchOnce({
      status: 400,
      body: {
        object: "error",
        status: 400,
        code: "validation_error",
        message: "body failed validation",
      },
    });
    await expect(
      notionRequest({
        accessToken: "t",
        method: "POST",
        path: "/v1/pages",
        body: { x: 1 },
        resourceForNotFound: "page-parent",
      }),
    ).rejects.toThrow(/POST \/v1\/pages failed: body failed validation/);
  });

  it("falls back to HTTP <status> when error body isn't JSON", async () => {
    mockFetchOnce({ status: 502, body: "<html>bad gateway</html>" });
    await expect(
      notionRequest({
        accessToken: "t",
        method: "POST",
        path: "/v1/search",
        body: {},
        resourceForNotFound: "search endpoint",
      }),
    ).rejects.toThrow(/HTTP 502/);
  });

  it("returns parsed JSON body on 2xx", async () => {
    mockFetchOnce({ status: 200, body: { object: "page", id: "p-1" } });
    const result = await notionRequest<{ id: string }>({
      accessToken: "t",
      method: "GET",
      path: "/v1/pages/p-1",
      resourceForNotFound: "page p-1",
    });
    expect(result).toEqual({ object: "page", id: "p-1" });
  });
});
