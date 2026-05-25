/**
 * @jest-environment node
 */
import { channelMessageReply } from "@/integrations/microsoft-teams/api/channelMessageReply";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
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

describe("channelMessageReply wrapper", () => {
  it("POSTs to /messages/{id}/replies with body envelope", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "reply-1", replyToId: "parent-1" },
    });

    await channelMessageReply({
      accessToken: "t",
      teamId: "team-1",
      channelId: "ch-1",
      messageId: "parent-1",
      contentType: "html",
      content: "<p>reply</p>",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/teams/team-1/channels/ch-1/messages/parent-1/replies",
    );
    expect(JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string)).toEqual({
      body: { contentType: "html", content: "<p>reply</p>" },
    });
  });

  it("URL-encodes all three id segments", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "r" } });

    await channelMessageReply({
      accessToken: "t",
      teamId: "team/1",
      channelId: "ch/1",
      messageId: "msg/1",
      contentType: "html",
      content: "hi",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/teams/team%2F1/channels/ch%2F1/messages/msg%2F1/replies",
    );
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      channelMessageReply({
        accessToken: "stale",
        teamId: "t",
        channelId: "c",
        messageId: "m",
        contentType: "html",
        content: "hi",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (parent missing)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText: '{"error":{"code":"NotFound","message":"message gone."}}',
    });

    await expect(
      channelMessageReply({
        accessToken: "t",
        teamId: "team-1",
        channelId: "ch-1",
        messageId: "gone",
        contentType: "html",
        content: "hi",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
