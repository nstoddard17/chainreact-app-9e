/**
 * @jest-environment node
 *
 * Tests for the Microsoft Graph me/messages/{id} API wrapper. The trigger
 * receiver (Commit 4) calls this to fetch the full message at notification
 * time. Slice 6 lands the wrapper in Commit 3 alongside sendMail so the
 * api/ folder ships in one piece.
 */
import { getMessage } from "@/integrations/microsoft-outlook/api/getMessage";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
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
  json?: unknown;
  bodyText?: string;
}) {
  const status = opts.status ?? (opts.ok ? 200 : 500);
  const body =
    opts.bodyText !== undefined
      ? opts.bodyText
      : opts.json !== undefined
        ? JSON.stringify(opts.json)
        : "";
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

describe("getMessage wrapper", () => {
  it("GETs {base}/v1.0/me/messages/{id} with Bearer token", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "msg-1", subject: "Hi" },
    });

    await getMessage({ accessToken: "t", messageId: "msg-1" });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages/msg-1",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ Authorization: "Bearer t" });
  });

  it("URL-encodes the messageId so '/' and '+' don't break the path", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "x" } });

    // Real Graph ids contain `=`, `+`, `/` from base64url so encoding matters.
    await getMessage({
      accessToken: "t",
      messageId: "AAMk+id/with=specials",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages/AAMk%2Bid%2Fwith%3Dspecials",
    );
  });

  it("returns the parsed Graph message JSON on 200", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        id: "msg-2",
        conversationId: "conv-1",
        subject: "Greetings",
        bodyPreview: "Hello",
        body: { contentType: "html", content: "<p>Hello</p>" },
        from: { emailAddress: { name: "Bob", address: "bob@x.com" } },
        toRecipients: [
          { emailAddress: { name: "Alice", address: "alice@x.com" } },
        ],
        receivedDateTime: "2026-05-08T10:00:00Z",
        hasAttachments: false,
        importance: "normal",
        webLink: "https://outlook.office.com/...",
      },
    });

    const result = await getMessage({ accessToken: "t", messageId: "msg-2" });

    expect(result.id).toBe("msg-2");
    expect(result.subject).toBe("Greetings");
    expect(result.body?.content).toBe("<p>Hello</p>");
    expect(result.from?.emailAddress?.address).toBe("bob@x.com");
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      bodyText: '{"error":{"code":"InvalidAuthenticationToken"}}',
    });

    await expect(
      getMessage({ accessToken: "stale", messageId: "x" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (deleted between notification and fetch)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText:
        '{"error":{"code":"ErrorItemNotFound","message":"The specified object was not found"}}',
    });

    await expect(
      getMessage({ accessToken: "t", messageId: "msg-gone" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("surfaces Graph error message on 4xx other than 404", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      bodyText: '{"error":{"code":"BadRequest","message":"Invalid id"}}',
    });

    await expect(
      getMessage({ accessToken: "t", messageId: "bad" }),
    ).rejects.toThrow(/Invalid id/);
  });

  it("uses MICROSOFT_GRAPH_API_BASE override when set", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "x" } });

    await getMessage({ accessToken: "t", messageId: "x" });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1.0/me/messages/x",
    );
  });
});
