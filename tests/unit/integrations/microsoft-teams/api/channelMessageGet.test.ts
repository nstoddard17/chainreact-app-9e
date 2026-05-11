/**
 * @jest-environment node
 */
import { channelMessageGet } from "@/integrations/microsoft-teams/api/channelMessageGet";
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

describe("channelMessageGet wrapper", () => {
  it("GETs the channel-messages-by-id URL with Bearer token", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "msg-1", body: { contentType: "html", content: "hi" } },
    });

    await channelMessageGet({
      accessToken: "t",
      teamId: "team-1",
      channelId: "ch-1",
      messageId: "msg-1",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/teams/team-1/channels/ch-1/messages/msg-1",
    );
    expect(fetchSpy.mock.calls[0]![1]!.method).toBe("GET");
    expect(fetchSpy.mock.calls[0]![1]!.headers).toEqual({
      Authorization: "Bearer t",
    });
  });

  it("URL-encodes all three id segments", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "m" } });

    await channelMessageGet({
      accessToken: "t",
      teamId: "team/1",
      channelId: "ch/1",
      messageId: "msg+1=x",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/teams/team%2F1/channels/ch%2F1/messages/msg%2B1%3Dx",
    );
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      channelMessageGet({
        accessToken: "stale",
        teamId: "t",
        channelId: "c",
        messageId: "m",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (message deleted)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText: '{"error":{"code":"NotFound","message":"deleted"}}',
    });

    await expect(
      channelMessageGet({
        accessToken: "t",
        teamId: "team-1",
        channelId: "ch-1",
        messageId: "gone",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
