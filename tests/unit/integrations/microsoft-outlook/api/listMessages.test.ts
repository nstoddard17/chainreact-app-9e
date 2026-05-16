/**
 * @jest-environment node
 *
 * Tests for the Microsoft Graph GET /me/messages API wrapper.
 * Owns the $filter vs $search mutual-exclusion routing; the spec
 * verifies URL construction for all four (no-query/query) × (no-folder/
 * folder) combinations plus header + scope semantics.
 */
import { listMessages } from "@/integrations/microsoft-outlook/api/listMessages";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

beforeEach(() => {
  delete process.env.MICROSOFT_GRAPH_API_BASE;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MICROSOFT_GRAPH_API_BASE;
});

function mockFetchOnce(opts: {
  ok: boolean;
  status?: number;
  bodyText?: string;
}) {
  const status = opts.status ?? (opts.ok ? 200 : 400);
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(opts.bodyText ?? '{"value":[]}', { status }),
    );
}

function parseUrl(callArg: string | URL): URL {
  return new URL(typeof callArg === "string" ? callArg : callArg.toString());
}

describe("listMessages wrapper — URL construction", () => {
  it("GETs /v1.0/me/messages when no folderId is supplied", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listMessages({
      accessToken: "t",
      maxResults: 10,
    });

    const url = parseUrl(fetchSpy.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/v1.0/me/messages");
  });

  it("GETs /v1.0/me/mailFolders/{folderId}/messages when folderId is supplied", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listMessages({
      accessToken: "t",
      folderId: "inbox",
      maxResults: 10,
    });

    const url = parseUrl(fetchSpy.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/v1.0/me/mailFolders/inbox/messages");
  });

  it("URL-encodes a custom folderId with special chars", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listMessages({
      accessToken: "t",
      folderId: "AAMk/with=odd+chars",
      maxResults: 10,
    });

    const url = parseUrl(fetchSpy.mock.calls[0]![0] as string);
    expect(url.pathname).toBe(
      "/v1.0/me/mailFolders/AAMk%2Fwith%3Dodd%2Bchars/messages",
    );
  });

  it("always includes the $select whitelist", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listMessages({
      accessToken: "t",
      maxResults: 5,
    });

    const url = parseUrl(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("$select")).toBe(
      "id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,hasAttachments,importance,isRead",
    );
  });

  it("sets ConsistencyLevel: eventual header unconditionally", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listMessages({
      accessToken: "t",
      maxResults: 10,
    });

    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.headers).toEqual({
      Authorization: "Bearer t",
      ConsistencyLevel: "eventual",
    });
  });
});

describe("listMessages wrapper — $filter path (no query)", () => {
  it("includes $top, $orderby, NO $filter when no dates supplied", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listMessages({
      accessToken: "t",
      maxResults: 7,
    });

    const url = parseUrl(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("$top")).toBe("7");
    expect(url.searchParams.get("$orderby")).toBe("receivedDateTime desc");
    expect(url.searchParams.get("$filter")).toBeNull();
    expect(url.searchParams.get("$search")).toBeNull();
  });

  it("includes server-side $filter ge for startDate alone", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listMessages({
      accessToken: "t",
      startDate: "2026-05-01T00:00:00.000Z",
      maxResults: 10,
    });

    const url = parseUrl(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("$filter")).toBe(
      "receivedDateTime ge 2026-05-01T00:00:00.000Z",
    );
    expect(url.searchParams.get("$orderby")).toBe("receivedDateTime desc");
  });

  it("includes server-side $filter le for endDate alone", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listMessages({
      accessToken: "t",
      endDate: "2026-05-31T23:59:59.000Z",
      maxResults: 10,
    });

    const url = parseUrl(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("$filter")).toBe(
      "receivedDateTime le 2026-05-31T23:59:59.000Z",
    );
  });

  it("combines both date filters with ' and '", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listMessages({
      accessToken: "t",
      startDate: "2026-05-01T00:00:00.000Z",
      endDate: "2026-05-31T23:59:59.000Z",
      maxResults: 10,
    });

    const url = parseUrl(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("$filter")).toBe(
      "receivedDateTime ge 2026-05-01T00:00:00.000Z and receivedDateTime le 2026-05-31T23:59:59.000Z",
    );
  });

  it("clamps $top to <= 50 defensively", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listMessages({
      accessToken: "t",
      maxResults: 1000 as unknown as number,
    });

    const url = parseUrl(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("$top")).toBe("50");
  });

  it("clamps $top to >= 1 defensively", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listMessages({
      accessToken: "t",
      maxResults: 0 as unknown as number,
    });

    const url = parseUrl(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("$top")).toBe("1");
  });
});

describe("listMessages wrapper — $search path (with query)", () => {
  it("uses $search and NOT $filter or $orderby", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listMessages({
      accessToken: "t",
      query: "invoice",
      maxResults: 10,
    });

    const url = parseUrl(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("$search")).toBe('"invoice"');
    expect(url.searchParams.get("$filter")).toBeNull();
    expect(url.searchParams.get("$orderby")).toBeNull();
  });

  it("fetches $top = maxResults * 3 for client-side filtering headroom", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listMessages({
      accessToken: "t",
      query: "invoice",
      maxResults: 10,
    });

    const url = parseUrl(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("$top")).toBe("30");
  });

  it("caps $top at 100 even when maxResults * 3 exceeds it", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listMessages({
      accessToken: "t",
      query: "invoice",
      maxResults: 50,
    });

    const url = parseUrl(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("$top")).toBe("100");
  });

  it("ignores server-side date filters when query is set (handler applies client-side)", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listMessages({
      accessToken: "t",
      query: "invoice",
      startDate: "2026-05-01T00:00:00.000Z",
      endDate: "2026-05-31T23:59:59.000Z",
      maxResults: 10,
    });

    const url = parseUrl(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("$search")).toBe('"invoice"');
    expect(url.searchParams.get("$filter")).toBeNull();
  });

  it("trims surrounding whitespace inside the $search value", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listMessages({
      accessToken: "t",
      query: "   invoice with spaces   ",
      maxResults: 10,
    });

    const url = parseUrl(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("$search")).toBe('"invoice with spaces"');
  });
});

describe("listMessages wrapper — response + error mapping", () => {
  it("returns the parsed { value } on 200 OK", async () => {
    mockFetchOnce({
      ok: true,
      bodyText: JSON.stringify({
        value: [
          { id: "msg-1", subject: "One" },
          { id: "msg-2", subject: "Two" },
        ],
      }),
    });

    const result = await listMessages({
      accessToken: "t",
      maxResults: 10,
    });

    expect(result.value).toHaveLength(2);
    expect(result.value[0]!.id).toBe("msg-1");
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      listMessages({ accessToken: "stale", maxResults: 10 }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("surfaces Graph error.message on 4xx", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      bodyText:
        '{"error":{"code":"BadRequest","message":"Invalid filter clause."}}',
    });

    await expect(
      listMessages({ accessToken: "t", maxResults: 10 }),
    ).rejects.toThrow(/Invalid filter clause/);
  });

  it("falls back to HTTP status when error body is non-JSON", async () => {
    mockFetchOnce({
      ok: false,
      status: 503,
      bodyText: "<html>upstream timeout</html>",
    });

    await expect(
      listMessages({ accessToken: "t", maxResults: 10 }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("uses MICROSOFT_GRAPH_API_BASE override when set", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = mockFetchOnce({ ok: true });

    await listMessages({ accessToken: "t", maxResults: 10 });

    const url = parseUrl(fetchSpy.mock.calls[0]![0] as string);
    expect(url.origin).toBe("http://127.0.0.1:9876");
    expect(url.pathname).toBe("/v1.0/me/messages");
  });
});
