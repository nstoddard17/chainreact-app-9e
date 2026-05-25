/**
 * @jest-environment node
 *
 * Tests for the Microsoft Graph me/messages/{id}/reply and /replyAll
 * API wrapper. Mocks global fetch and asserts URL selection on the
 * replyAll boolean, body shape, message-id URL encoding, and error
 * mapping (401 → Unauthorized401Error, other failures → generic Error
 * with Graph error code surfaced).
 */
import { replyMessage } from "@/integrations/microsoft-outlook/api/replyMessage";
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
  const status = opts.status ?? (opts.ok ? 202 : 400);
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(opts.bodyText ?? "", { status }));
}

describe("replyMessage wrapper", () => {
  it("POSTs to /reply when replyAll=false", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await replyMessage({
      accessToken: "ms-access",
      messageId: "AAMkAGI2abc",
      comment: "Got it",
      replyAll: false,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages/AAMkAGI2abc/reply",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer ms-access",
      "Content-Type": "application/json",
    });
  });

  it("POSTs to /replyAll when replyAll=true", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await replyMessage({
      accessToken: "ms-access",
      messageId: "AAMkAGI2abc",
      comment: "Acknowledged",
      replyAll: true,
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages/AAMkAGI2abc/replyAll",
    );
  });

  it("URL-encodes the message id", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await replyMessage({
      accessToken: "t",
      messageId: "abc/+def?ghi",
      comment: "x",
      replyAll: false,
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages/abc%2F%2Bdef%3Fghi/reply",
    );
  });

  it("wraps the body as { comment }", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await replyMessage({
      accessToken: "t",
      messageId: "id-1",
      comment: "Reply body here",
      replyAll: false,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({ comment: "Reply body here" });
  });

  it("sends an empty-string comment when handler passes one", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await replyMessage({
      accessToken: "t",
      messageId: "id-1",
      comment: "",
      replyAll: true,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({ comment: "" });
  });

  it("returns void on 202 Accepted", async () => {
    mockFetchOnce({ ok: true, status: 202 });

    const result = await replyMessage({
      accessToken: "t",
      messageId: "id-1",
      comment: "x",
      replyAll: false,
    });

    expect(result).toBeUndefined();
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      bodyText: '{"error":{"code":"InvalidAuthenticationToken"}}',
    });

    await expect(
      replyMessage({
        accessToken: "stale",
        messageId: "id-1",
        comment: "x",
        replyAll: false,
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("includes the endpoint path in the 401 message (reply vs replyAll)", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      replyMessage({
        accessToken: "stale",
        messageId: "id-1",
        comment: "x",
        replyAll: true,
      }),
    ).rejects.toThrow(/replyAll/);
  });

  it("surfaces Graph error.message on 404 (message gone between trigger and action)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText:
        '{"error":{"code":"ErrorItemNotFound","message":"The specified object was not found in the store."}}',
    });

    await expect(
      replyMessage({
        accessToken: "t",
        messageId: "id-1",
        comment: "x",
        replyAll: false,
      }),
    ).rejects.toThrow(/The specified object was not found/);
  });

  it("uses MICROSOFT_GRAPH_API_BASE override when set", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = mockFetchOnce({ ok: true });

    await replyMessage({
      accessToken: "t",
      messageId: "id-1",
      comment: "x",
      replyAll: false,
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1.0/me/messages/id-1/reply",
    );
  });
});
