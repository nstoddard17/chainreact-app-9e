/**
 * @jest-environment node
 *
 * Tests for the Microsoft Graph POST /me/messages/{id}/move API wrapper.
 * Graph returns 201 Created with the moved-message envelope; wrapper
 * parses + returns the new id for the handler's output (Outlook re-keys
 * on move).
 */
import { moveMessage } from "@/integrations/microsoft-outlook/api/moveMessage";
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
  const status = opts.status ?? (opts.ok ? 201 : 400);
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(opts.bodyText ?? "{}", { status }));
}

describe("moveMessage wrapper", () => {
  it("POSTs to /v1.0/me/messages/{id}/move with Bearer + JSON content-type", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: '{"id":"new-id"}',
    });

    await moveMessage({
      accessToken: "ms-access",
      messageId: "AAMkAGI2",
      destinationId: "deleteditems",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages/AAMkAGI2/move",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer ms-access",
      "Content-Type": "application/json",
    });
  });

  it("URL-encodes the messageId", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: '{"id":"new-id"}',
    });

    await moveMessage({
      accessToken: "t",
      messageId: "AAMk/with=odd+chars",
      destinationId: "inbox",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages/AAMk%2Fwith%3Dodd%2Bchars/move",
    );
  });

  it("serializes the destinationId into the request body", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: '{"id":"new-id"}',
    });

    await moveMessage({
      accessToken: "t",
      messageId: "msg-1",
      destinationId: "deleteditems",
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({ destinationId: "deleteditems" });
  });

  it("returns the parsed moved-message envelope on 201 Created", async () => {
    mockFetchOnce({
      ok: true,
      status: 201,
      bodyText: JSON.stringify({
        id: "moved-42",
        parentFolderId: "folder-abc",
      }),
    });

    const moved = await moveMessage({
      accessToken: "t",
      messageId: "msg-1",
      destinationId: "folder-abc",
    });

    expect(moved.id).toBe("moved-42");
    expect(moved.parentFolderId).toBe("folder-abc");
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      moveMessage({
        accessToken: "stale",
        messageId: "msg-1",
        destinationId: "inbox",
      }),
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
      moveMessage({
        accessToken: "t",
        messageId: "missing",
        destinationId: "inbox",
      }),
    ).rejects.toThrow(/not found in the store/);
  });

  it("falls back to HTTP status when error body is non-JSON", async () => {
    mockFetchOnce({
      ok: false,
      status: 503,
      bodyText: "<html>upstream timeout</html>",
    });

    await expect(
      moveMessage({
        accessToken: "t",
        messageId: "msg-1",
        destinationId: "inbox",
      }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("uses MICROSOFT_GRAPH_API_BASE override when set", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: '{"id":"new-id"}',
    });

    await moveMessage({
      accessToken: "t",
      messageId: "msg-1",
      destinationId: "inbox",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1.0/me/messages/msg-1/move",
    );
  });

  it("propagates non-401 4xx errors with surfaceGraphError messages", async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      bodyText:
        '{"error":{"code":"ErrorAccessDenied","message":"Access is denied. Check credentials and try again."}}',
    });

    await expect(
      moveMessage({
        accessToken: "t",
        messageId: "msg-1",
        destinationId: "inbox",
      }),
    ).rejects.toThrow(/Access is denied/);
  });
});
