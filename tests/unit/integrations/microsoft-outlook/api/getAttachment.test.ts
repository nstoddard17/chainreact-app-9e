/**
 * @jest-environment node
 *
 * Tests for the Microsoft Graph GET /me/messages/{id}/attachments/{attId}
 * wrapper. Returns the discriminated-union envelope (fileAttachment vs
 * itemAttachment vs referenceAttachment); subtype dispatch lives in the
 * handler.
 */
import { getAttachment } from "@/integrations/microsoft-outlook/api/getAttachment";
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
    .mockResolvedValueOnce(new Response(opts.bodyText ?? "{}", { status }));
}

describe("getAttachment wrapper", () => {
  it("GETs /v1.0/me/messages/{id}/attachments/{attId} with Bearer", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: JSON.stringify({
        "@odata.type": "#microsoft.graph.fileAttachment",
        id: "att-1",
        name: "x.txt",
        contentType: "text/plain",
        size: 5,
        contentBytes: Buffer.from("hello").toString("base64"),
      }),
    });

    await getAttachment({
      accessToken: "tok",
      messageId: "AAMk",
      attachmentId: "att-1",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages/AAMk/attachments/att-1",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ Authorization: "Bearer tok" });
  });

  it("URL-encodes both messageId and attachmentId", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: JSON.stringify({
        "@odata.type": "#microsoft.graph.fileAttachment",
        id: "att/odd",
        name: "x",
        contentType: "text/plain",
        size: 1,
        contentBytes: "x",
      }),
    });

    await getAttachment({
      accessToken: "t",
      messageId: "msg/with=odd",
      attachmentId: "att/odd",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages/msg%2Fwith%3Dodd/attachments/att%2Fodd",
    );
  });

  it("returns the fileAttachment envelope with contentBytes preserved (base64 passthrough)", async () => {
    const base64Body = Buffer.from("Hello, World").toString("base64");
    mockFetchOnce({
      ok: true,
      bodyText: JSON.stringify({
        "@odata.type": "#microsoft.graph.fileAttachment",
        id: "att-1",
        name: "hello.txt",
        contentType: "text/plain",
        size: 12,
        contentBytes: base64Body,
      }),
    });

    const result = await getAttachment({
      accessToken: "t",
      messageId: "msg",
      attachmentId: "att-1",
    });

    expect(result["@odata.type"]).toBe("#microsoft.graph.fileAttachment");
    if (result["@odata.type"] === "#microsoft.graph.fileAttachment") {
      expect(result.contentBytes).toBe(base64Body);
    }
  });

  it("returns the itemAttachment envelope when Graph emits the embedded-message subtype", async () => {
    mockFetchOnce({
      ok: true,
      bodyText: JSON.stringify({
        "@odata.type": "#microsoft.graph.itemAttachment",
        id: "att-item-1",
        name: "Forwarded message",
        contentType: "message/rfc822",
        size: 500,
        item: { "@odata.type": "#microsoft.graph.message" },
      }),
    });

    const result = await getAttachment({
      accessToken: "t",
      messageId: "msg",
      attachmentId: "att-item-1",
    });

    expect(result["@odata.type"]).toBe("#microsoft.graph.itemAttachment");
  });

  it("returns the referenceAttachment envelope", async () => {
    mockFetchOnce({
      ok: true,
      bodyText: JSON.stringify({
        "@odata.type": "#microsoft.graph.referenceAttachment",
        id: "att-ref-1",
        name: "OneDrive file",
        contentType: "application/octet-stream",
        size: 1024,
        sourceUrl: "https://onedrive.example/file",
      }),
    });

    const result = await getAttachment({
      accessToken: "t",
      messageId: "msg",
      attachmentId: "att-ref-1",
    });

    expect(result["@odata.type"]).toBe("#microsoft.graph.referenceAttachment");
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      getAttachment({
        accessToken: "stale",
        messageId: "msg",
        attachmentId: "att",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("surfaces Graph error.message on 404", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText:
        '{"error":{"code":"ErrorItemNotFound","message":"Attachment not found."}}',
    });

    await expect(
      getAttachment({
        accessToken: "t",
        messageId: "msg",
        attachmentId: "missing",
      }),
    ).rejects.toThrow(/Attachment not found/);
  });

  it("falls back to HTTP status on non-JSON error body", async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      bodyText: "<html>upstream</html>",
    });

    await expect(
      getAttachment({
        accessToken: "t",
        messageId: "msg",
        attachmentId: "att",
      }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("uses MICROSOFT_GRAPH_API_BASE override when set", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: JSON.stringify({
        "@odata.type": "#microsoft.graph.fileAttachment",
        id: "att",
        name: "x",
        contentType: "text/plain",
        size: 1,
        contentBytes: "x",
      }),
    });

    await getAttachment({
      accessToken: "t",
      messageId: "msg",
      attachmentId: "att",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1.0/me/messages/msg/attachments/att",
    );
  });
});
