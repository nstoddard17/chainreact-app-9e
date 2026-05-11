/**
 * @jest-environment node
 */
import { channelMessageSend } from "@/integrations/microsoft-teams/api/channelMessageSend";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

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
  const status = opts.status ?? (opts.ok ? 201 : 500);
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

describe("channelMessageSend wrapper", () => {
  it("POSTs to teams/channels/messages with Bearer token + JSON body", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "msg-1", createdDateTime: "2026-05-10T00:00:00Z" },
    });

    await channelMessageSend({
      accessToken: "t",
      teamId: "team-1",
      channelId: "ch-1",
      contentType: "html",
      content: "<p>hi</p>",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/teams/team-1/channels/ch-1/messages",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer t",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      body: { contentType: "html", content: "<p>hi</p>" },
    });
  });

  it("URL-encodes team and channel ids with edge chars", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "m" } });

    await channelMessageSend({
      accessToken: "t",
      teamId: "team+id/with=chars",
      channelId: "19:abc def@thread.tacv2",
      contentType: "text",
      content: "hi",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/teams/team%2Bid%2Fwith%3Dchars/channels/19%3Aabc%20def%40thread.tacv2/messages",
    );
  });

  it("forwards contentType=text verbatim (no auto-conversion)", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "m" } });

    await channelMessageSend({
      accessToken: "t",
      teamId: "team-1",
      channelId: "ch-1",
      contentType: "text",
      content: "plain & safe",
    });

    expect(JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string)).toEqual({
      body: { contentType: "text", content: "plain & safe" },
    });
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      channelMessageSend({
        accessToken: "stale",
        teamId: "t",
        channelId: "c",
        contentType: "html",
        content: "hi",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (team or channel missing)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText: '{"error":{"code":"NotFound","message":"Channel not found."}}',
    });

    await expect(
      channelMessageSend({
        accessToken: "t",
        teamId: "team-1",
        channelId: "gone",
        contentType: "html",
        content: "hi",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("surfaces Graph error message on other 4xx failures", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      bodyText:
        '{"error":{"code":"BadRequest","message":"Invalid contentType."}}',
    });

    await expect(
      channelMessageSend({
        accessToken: "t",
        teamId: "team-1",
        channelId: "ch-1",
        contentType: "html",
        content: "hi",
      }),
    ).rejects.toThrow(/Invalid contentType/);
  });

  it("honors MICROSOFT_GRAPH_API_BASE env override (e2e)", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9878";
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "m" } });

    await channelMessageSend({
      accessToken: "t",
      teamId: "team-1",
      channelId: "ch-1",
      contentType: "html",
      content: "hi",
    });

    expect(fetchSpy.mock.calls[0]![0]).toContain("http://127.0.0.1:9878/");
  });
});
