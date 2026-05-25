/**
 * @jest-environment node
 *
 * Tests for the Microsoft Graph me/messages/{id}/forward API wrapper.
 * Asserts URL construction, body shape (omit-when-absent for cc and
 * comment), error mapping, and message-id URL encoding.
 */
import { forwardMessage } from "@/integrations/microsoft-outlook/api/forwardMessage";
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

const ONE_TO = [{ emailAddress: { address: "alice@example.test" } }];

describe("forwardMessage wrapper", () => {
  it("POSTs to /v1.0/me/messages/{id}/forward with Bearer + JSON content-type", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await forwardMessage({
      accessToken: "ms-access",
      messageId: "AAMkAGI2abc",
      toRecipients: ONE_TO,
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages/AAMkAGI2abc/forward",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer ms-access",
      "Content-Type": "application/json",
    });
  });

  it("URL-encodes the message id", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await forwardMessage({
      accessToken: "t",
      messageId: "abc/+def",
      toRecipients: ONE_TO,
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages/abc%2F%2Bdef/forward",
    );
  });

  it("includes toRecipients in the body and omits ccRecipients + comment when absent", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await forwardMessage({
      accessToken: "t",
      messageId: "id-1",
      toRecipients: ONE_TO,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({ toRecipients: ONE_TO });
    expect(body.ccRecipients).toBeUndefined();
    expect(body.comment).toBeUndefined();
  });

  it("includes ccRecipients when provided", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });
    const cc = [{ emailAddress: { address: "carol@example.test" } }];

    await forwardMessage({
      accessToken: "t",
      messageId: "id-1",
      toRecipients: ONE_TO,
      ccRecipients: cc,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.ccRecipients).toEqual(cc);
  });

  it("includes comment when provided (even when empty string)", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await forwardMessage({
      accessToken: "t",
      messageId: "id-1",
      toRecipients: ONE_TO,
      comment: "",
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.comment).toBe("");
  });

  it("includes comment text when supplied", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await forwardMessage({
      accessToken: "t",
      messageId: "id-1",
      toRecipients: ONE_TO,
      comment: "FYI",
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.comment).toBe("FYI");
  });

  it("returns void on 202 Accepted", async () => {
    mockFetchOnce({ ok: true, status: 202 });

    const result = await forwardMessage({
      accessToken: "t",
      messageId: "id-1",
      toRecipients: ONE_TO,
    });

    expect(result).toBeUndefined();
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      forwardMessage({
        accessToken: "stale",
        messageId: "id-1",
        toRecipients: ONE_TO,
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("surfaces Graph error.message on 4xx failures", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      bodyText:
        '{"error":{"code":"ErrorInvalidRecipients","message":"Invalid recipient address"}}',
    });

    await expect(
      forwardMessage({
        accessToken: "t",
        messageId: "id-1",
        toRecipients: ONE_TO,
      }),
    ).rejects.toThrow(/Invalid recipient address/);
  });

  it("uses MICROSOFT_GRAPH_API_BASE override when set", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = mockFetchOnce({ ok: true });

    await forwardMessage({
      accessToken: "t",
      messageId: "id-1",
      toRecipients: ONE_TO,
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1.0/me/messages/id-1/forward",
    );
  });
});
