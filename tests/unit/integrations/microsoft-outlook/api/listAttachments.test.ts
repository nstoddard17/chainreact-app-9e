/**
 * @jest-environment node
 *
 * Tests for the Microsoft Graph GET /me/messages/{id}/attachments
 * wrapper. Returns attachment metadata; subtype dispatch lives in the
 * handler.
 */
import { listAttachments } from "@/integrations/microsoft-outlook/api/listAttachments";
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

describe("listAttachments wrapper", () => {
  it("GETs /v1.0/me/messages/{id}/attachments with Bearer", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listAttachments({
      accessToken: "tok",
      messageId: "AAMkAGI2",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages/AAMkAGI2/attachments",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({
      Authorization: "Bearer tok",
    });
  });

  it("URL-encodes the messageId", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listAttachments({
      accessToken: "t",
      messageId: "AAMk/with=odd+chars",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages/AAMk%2Fwith%3Dodd%2Bchars/attachments",
    );
  });

  it("returns the parsed { value } on 200 OK", async () => {
    mockFetchOnce({
      ok: true,
      bodyText: JSON.stringify({
        value: [
          {
            id: "att-1",
            name: "report.pdf",
            contentType: "application/pdf",
            size: 1234,
            isInline: false,
            "@odata.type": "#microsoft.graph.fileAttachment",
          },
          {
            id: "att-2",
            name: "embedded.png",
            isInline: true,
            "@odata.type": "#microsoft.graph.fileAttachment",
          },
        ],
      }),
    });

    const result = await listAttachments({
      accessToken: "t",
      messageId: "msg-1",
    });

    expect(result.value).toHaveLength(2);
    expect(result.value[0]!.id).toBe("att-1");
    expect(result.value[1]!.isInline).toBe(true);
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      listAttachments({ accessToken: "stale", messageId: "msg-1" }),
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
      listAttachments({ accessToken: "t", messageId: "missing" }),
    ).rejects.toThrow(/not found in the store/);
  });

  it("falls back to HTTP status when error body is non-JSON", async () => {
    mockFetchOnce({
      ok: false,
      status: 503,
      bodyText: "<html>upstream</html>",
    });

    await expect(
      listAttachments({ accessToken: "t", messageId: "msg-1" }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("uses MICROSOFT_GRAPH_API_BASE override when set", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = mockFetchOnce({ ok: true });

    await listAttachments({ accessToken: "t", messageId: "msg-1" });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1.0/me/messages/msg-1/attachments",
    );
  });

  it("does not include a request body or Content-Type header (GET)", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await listAttachments({ accessToken: "t", messageId: "msg-1" });

    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.body).toBeUndefined();
    expect(
      (init.headers as Record<string, string>)["Content-Type"],
    ).toBeUndefined();
  });
});
