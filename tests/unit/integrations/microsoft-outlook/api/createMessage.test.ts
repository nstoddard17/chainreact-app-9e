/**
 * @jest-environment node
 *
 * Tests for the Microsoft Graph POST /me/messages (create-draft) API
 * wrapper. Unlike sendMail (202 No Content), this endpoint returns 201
 * Created with the new draft's envelope including the draft id +
 * webLink — wrapper parses + returns it for the handler to map to the
 * action output.
 */
import { createMessage } from "@/integrations/microsoft-outlook/api/createMessage";
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

const BASE_MESSAGE = {
  subject: "Draft hello",
  body: { contentType: "Text" as const, content: "Hi there" },
  toRecipients: [{ emailAddress: { address: "alice@example.test" } }],
  importance: "normal" as const,
};

describe("createMessage wrapper", () => {
  it("POSTs to /v1.0/me/messages with Bearer + JSON content-type", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: '{"id":"draft-1"}',
    });

    await createMessage({
      accessToken: "ms-access",
      message: BASE_MESSAGE,
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer ms-access",
      "Content-Type": "application/json",
    });
  });

  it("serializes the message body and omits cc/bcc when absent", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: '{"id":"draft-1"}',
    });

    await createMessage({
      accessToken: "t",
      message: BASE_MESSAGE,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({
      subject: "Draft hello",
      body: { contentType: "Text", content: "Hi there" },
      toRecipients: [{ emailAddress: { address: "alice@example.test" } }],
      importance: "normal",
    });
    expect(body.ccRecipients).toBeUndefined();
    expect(body.bccRecipients).toBeUndefined();
  });

  it("includes ccRecipients + bccRecipients when supplied", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: '{"id":"draft-1"}',
    });
    const cc = [{ emailAddress: { address: "c@x.com" } }];
    const bcc = [{ emailAddress: { address: "b@x.com" } }];

    await createMessage({
      accessToken: "t",
      message: {
        ...BASE_MESSAGE,
        ccRecipients: cc,
        bccRecipients: bcc,
      },
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.ccRecipients).toEqual(cc);
    expect(body.bccRecipients).toEqual(bcc);
  });

  it("preserves HTML contentType on the message body", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: '{"id":"draft-1"}',
    });

    await createMessage({
      accessToken: "t",
      message: {
        ...BASE_MESSAGE,
        body: { contentType: "HTML", content: "<b>hi</b>" },
      },
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.body).toEqual({ contentType: "HTML", content: "<b>hi</b>" });
  });

  it("returns the parsed draft envelope on 201 Created", async () => {
    mockFetchOnce({
      ok: true,
      status: 201,
      bodyText: JSON.stringify({
        id: "draft-42",
        subject: "Draft hello",
        webLink: "https://outlook.office.com/owa/?ItemID=draft-42",
        createdDateTime: "2026-05-08T12:00:00Z",
      }),
    });

    const draft = await createMessage({
      accessToken: "t",
      message: BASE_MESSAGE,
    });

    expect(draft.id).toBe("draft-42");
    expect(draft.subject).toBe("Draft hello");
    expect(draft.webLink).toBe(
      "https://outlook.office.com/owa/?ItemID=draft-42",
    );
    expect(draft.createdDateTime).toBe("2026-05-08T12:00:00Z");
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      createMessage({ accessToken: "stale", message: BASE_MESSAGE }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("surfaces Graph error.message on 4xx (e.g. 403 from missing Mail.ReadWrite)", async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      bodyText:
        '{"error":{"code":"ErrorAccessDenied","message":"Access is denied. Check credentials and try again."}}',
    });

    await expect(
      createMessage({ accessToken: "t", message: BASE_MESSAGE }),
    ).rejects.toThrow(/Access is denied/);
  });

  it("falls back to HTTP status when error body is non-JSON", async () => {
    mockFetchOnce({
      ok: false,
      status: 503,
      bodyText: "<html>upstream timeout</html>",
    });

    await expect(
      createMessage({ accessToken: "t", message: BASE_MESSAGE }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("uses MICROSOFT_GRAPH_API_BASE override when set", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: '{"id":"draft-1"}',
    });

    await createMessage({ accessToken: "t", message: BASE_MESSAGE });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1.0/me/messages",
    );
  });
});
