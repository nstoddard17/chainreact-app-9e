/**
 * @jest-environment node
 *
 * Tests for the Microsoft Graph DELETE /me/messages/{id} API wrapper
 * (permanent-delete semantics — irreversible).
 */
import { deleteMessage } from "@/integrations/microsoft-outlook/api/deleteMessage";
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
  const status = opts.status ?? (opts.ok ? 204 : 400);
  // Response constructor rejects non-null bodies for null-body statuses
  // (204 / 205 / 304 per fetch spec). Force null body for those.
  const isNullBodyStatus = status === 204 || status === 205 || status === 304;
  const body: string | null = isNullBodyStatus ? null : (opts.bodyText ?? "");
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

describe("deleteMessage wrapper", () => {
  it("DELETEs /v1.0/me/messages/{id} with Bearer token", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await deleteMessage({
      accessToken: "ms-access",
      messageId: "AAMkAGI2",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages/AAMkAGI2",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("DELETE");
    expect(init.headers).toEqual({
      Authorization: "Bearer ms-access",
    });
  });

  it("URL-encodes the messageId", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await deleteMessage({
      accessToken: "t",
      messageId: "AAMk/with=odd+chars",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages/AAMk%2Fwith%3Dodd%2Bchars",
    );
  });

  it("does NOT send a request body or Content-Type header", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await deleteMessage({
      accessToken: "t",
      messageId: "msg-1",
    });

    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.body).toBeUndefined();
    expect(
      (init.headers as Record<string, string>)["Content-Type"],
    ).toBeUndefined();
  });

  it("resolves to void on 204 No Content (the Graph success case)", async () => {
    mockFetchOnce({ ok: true, status: 204 });

    await expect(
      deleteMessage({ accessToken: "t", messageId: "msg-1" }),
    ).resolves.toBeUndefined();
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      deleteMessage({ accessToken: "stale", messageId: "msg-1" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("surfaces Graph error.message on 404 ErrorItemNotFound", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText:
        '{"error":{"code":"ErrorItemNotFound","message":"The specified object was not found in the store."}}',
    });

    await expect(
      deleteMessage({ accessToken: "t", messageId: "missing" }),
    ).rejects.toThrow(/not found in the store/);
  });

  it("surfaces Graph error.message on 403 ErrorAccessDenied", async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      bodyText:
        '{"error":{"code":"ErrorAccessDenied","message":"Access is denied. Check credentials and try again."}}',
    });

    await expect(
      deleteMessage({ accessToken: "t", messageId: "msg-1" }),
    ).rejects.toThrow(/Access is denied/);
  });

  it("falls back to HTTP status when error body is non-JSON", async () => {
    mockFetchOnce({
      ok: false,
      status: 503,
      bodyText: "<html>upstream timeout</html>",
    });

    await expect(
      deleteMessage({ accessToken: "t", messageId: "msg-1" }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("uses MICROSOFT_GRAPH_API_BASE override when set", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = mockFetchOnce({ ok: true });

    await deleteMessage({ accessToken: "t", messageId: "msg-1" });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1.0/me/messages/msg-1",
    );
  });
});
