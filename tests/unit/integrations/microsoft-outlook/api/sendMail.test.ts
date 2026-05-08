/**
 * @jest-environment node
 *
 * Tests for the Microsoft Graph me/sendMail API wrapper. Mocks global
 * fetch and asserts URL, headers, body shape, and error mapping (401 →
 * Unauthorized401Error, other failures → generic Error with Graph error
 * code surfaced).
 */
import { sendMail } from "@/integrations/microsoft-outlook/api/sendMail";
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
  return jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(opts.bodyText ?? "", { status }),
  );
}

const SAMPLE_MESSAGE = {
  subject: "Hello",
  body: { contentType: "Text" as const, content: "Hi there" },
  toRecipients: [{ emailAddress: { address: "alice@example.test" } }],
  importance: "normal" as const,
};

describe("sendMail wrapper", () => {
  it("POSTs to {base}/v1.0/me/sendMail with Bearer token + JSON content-type", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await sendMail({
      accessToken: "ms-access-1",
      message: SAMPLE_MESSAGE,
      saveToSentItems: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/sendMail",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer ms-access-1",
      "Content-Type": "application/json",
    });
  });

  it("serializes the message + saveToSentItems flag in the body", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await sendMail({
      accessToken: "t",
      message: {
        subject: "Subj",
        body: { contentType: "HTML", content: "<b>hi</b>" },
        toRecipients: [{ emailAddress: { address: "a@x.com" } }],
        ccRecipients: [{ emailAddress: { address: "c@x.com" } }],
        bccRecipients: [{ emailAddress: { address: "b@x.com" } }],
        importance: "high",
      },
      saveToSentItems: true,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({
      message: {
        subject: "Subj",
        body: { contentType: "HTML", content: "<b>hi</b>" },
        toRecipients: [{ emailAddress: { address: "a@x.com" } }],
        ccRecipients: [{ emailAddress: { address: "c@x.com" } }],
        bccRecipients: [{ emailAddress: { address: "b@x.com" } }],
        importance: "high",
      },
      saveToSentItems: true,
    });
  });

  it("omits saveToSentItems from the body when undefined", async () => {
    const fetchSpy = mockFetchOnce({ ok: true });

    await sendMail({ accessToken: "t", message: SAMPLE_MESSAGE });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.saveToSentItems).toBeUndefined();
  });

  it("returns void on 202 Accepted (Graph sends no body)", async () => {
    mockFetchOnce({ ok: true, status: 202 });

    const result = await sendMail({
      accessToken: "t",
      message: SAMPLE_MESSAGE,
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
      sendMail({ accessToken: "stale", message: SAMPLE_MESSAGE }),
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
      sendMail({ accessToken: "t", message: SAMPLE_MESSAGE }),
    ).rejects.toThrow(/Invalid recipient address/);
  });

  it("surfaces Graph error.code when error.message is missing", async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      bodyText: '{"error":{"code":"ErrorAccessDenied"}}',
    });

    await expect(
      sendMail({ accessToken: "t", message: SAMPLE_MESSAGE }),
    ).rejects.toThrow(/ErrorAccessDenied/);
  });

  it("falls back to HTTP status when error body is non-JSON", async () => {
    mockFetchOnce({
      ok: false,
      status: 503,
      bodyText: "<html>upstream timeout</html>",
    });

    await expect(
      sendMail({ accessToken: "t", message: SAMPLE_MESSAGE }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("uses MICROSOFT_GRAPH_API_BASE override when set", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = mockFetchOnce({ ok: true });

    await sendMail({ accessToken: "t", message: SAMPLE_MESSAGE });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1.0/me/sendMail",
    );
  });
});
