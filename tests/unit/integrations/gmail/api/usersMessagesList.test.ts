/**
 * @jest-environment node
 *
 * Tests for the Gmail users.messages.list API wrapper.
 */
import { usersMessagesList } from "@/integrations/gmail/api/usersMessagesList";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset?.();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.GMAIL_API_BASE;
});

function mockFetchOnce(response: { ok: boolean; status?: number; json: unknown }) {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(
        typeof response.json === "string"
          ? response.json
          : JSON.stringify(response.json),
        { status: response.status ?? (response.ok ? 200 : 500) },
      ),
    );
}

describe("usersMessagesList — request shape", () => {
  it("GETs the messages endpoint with Bearer auth", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { messages: [], resultSizeEstimate: 0 },
    });

    await usersMessagesList({
      accessToken: "ya29.access-token",
      q: "from:alice@example.com",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0]![0] as string;
    const init = fetchSpy.mock.calls[0]![1] as { method?: string; headers?: Record<string, string> };
    expect(url).toContain(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?",
    );
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({
      Authorization: "Bearer ya29.access-token",
    });
  });

  it("forwards q verbatim (no mutation)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { messages: [], resultSizeEstimate: 0 },
    });

    await usersMessagesList({
      accessToken: "x",
      q: 'from:alice@example.com subject:"hello world" has:attachment',
    });

    // URLSearchParams encodes spaces as `+` and `decodeURIComponent`
    // does NOT undo that. Parse the URL and read the q param
    // through searchParams.get, which handles both `+`→space and
    // `%XX` correctly.
    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("q")).toBe(
      'from:alice@example.com subject:"hello world" has:attachment',
    );
  });

  it("forwards maxResults when provided", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { messages: [] },
    });

    await usersMessagesList({ accessToken: "x", q: "is:unread", maxResults: 25 });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("maxResults=25");
  });

  it("forwards pageToken when provided", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { messages: [] },
    });

    await usersMessagesList({
      accessToken: "x",
      q: "is:unread",
      pageToken: "next-page-token-abc",
    });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(decodeURIComponent(url)).toContain("pageToken=next-page-token-abc");
  });

  it("omits empty / undefined params from the query string", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { messages: [] },
    });

    await usersMessagesList({
      accessToken: "x",
      q: "is:unread",
      pageToken: "",
    });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).not.toContain("pageToken=");
    expect(url).not.toContain("maxResults=");
  });

  it("returns parsed { messages, nextPageToken, resultSizeEstimate }", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        messages: [
          { id: "msg-1", threadId: "thr-1" },
          { id: "msg-2", threadId: "thr-2" },
        ],
        nextPageToken: "next-page",
        resultSizeEstimate: 42,
      },
    });

    const result = await usersMessagesList({ accessToken: "x", q: "is:unread" });

    expect(result).toEqual({
      messages: [
        { id: "msg-1", threadId: "thr-1" },
        { id: "msg-2", threadId: "thr-2" },
      ],
      nextPageToken: "next-page",
      resultSizeEstimate: 42,
    });
  });

  it("returns empty messages array when Gmail returns no `messages` field (no results)", async () => {
    mockFetchOnce({
      ok: true,
      json: { resultSizeEstimate: 0 },
    });

    const result = await usersMessagesList({ accessToken: "x", q: "is:unread" });

    expect(result.messages).toEqual([]);
    expect(result.nextPageToken).toBeUndefined();
    expect(result.resultSizeEstimate).toBe(0);
  });

  it("respects GMAIL_API_BASE override", async () => {
    process.env.GMAIL_API_BASE = "http://127.0.0.1:9877";
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { messages: [] },
    });

    await usersMessagesList({ accessToken: "x", q: "is:unread" });

    expect(fetchSpy.mock.calls[0]![0]).toContain(
      "http://127.0.0.1:9877/gmail/v1/users/me/messages",
    );
  });
});

describe("usersMessagesList — error handling", () => {
  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      json: { error: { code: 401, message: "invalid_token" } },
    });

    await expect(
      usersMessagesList({ accessToken: "stale", q: "is:unread" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("surfaces Google's error.message on 4xx", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: {
        error: { code: 400, message: "Invalid query syntax." },
      },
    });

    await expect(
      usersMessagesList({ accessToken: "x", q: "bad:syntax:::" }),
    ).rejects.toThrow(/Invalid query syntax/);
  });

  it("falls back to error.status when message is missing", async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      json: { error: { code: 403, status: "PERMISSION_DENIED" } },
    });

    await expect(
      usersMessagesList({ accessToken: "x", q: "is:unread" }),
    ).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it("falls back to HTTP status when response is not JSON", async () => {
    mockFetchOnce({ ok: false, status: 502, json: "Bad Gateway plain text" });

    await expect(
      usersMessagesList({ accessToken: "x", q: "is:unread" }),
    ).rejects.toThrow(/HTTP 502/);
  });
});
