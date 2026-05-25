/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/chatDelete.
 */
import { chatDelete } from "@/integrations/slack/api/chatDelete";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("chatDelete", () => {
  it("POSTs to chat.delete with channel + ts", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, channel: "C1", ts: "1.0" }),
        { status: 200 },
      ),
    );

    const result = await chatDelete({
      botToken: "xoxb-test",
      channel: "C1",
      ts: "1.0",
    });

    expect(result).toEqual({ channel: "C1", ts: "1.0" });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.delete");
    const reqInit = init as { headers: Record<string, string>; body: string };
    expect(reqInit.headers.authorization).toBe("Bearer xoxb-test");
    expect(JSON.parse(reqInit.body)).toEqual({ channel: "C1", ts: "1.0" });
  });

  it("throws SlackApiError with the Slack error code on cant_delete_message", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "cant_delete_message" }), { status: 200 }),
    );
    await expect(
      chatDelete({ botToken: "x", channel: "C1", ts: "1.0" }),
    ).rejects.toMatchObject({ slackErrorCode: "cant_delete_message" });
  });

  it("throws SlackApiError 'malformed_response' when channel or ts is missing in the ok response", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, channel: "C1" }), { status: 200 }),
    );
    await expect(
      chatDelete({ botToken: "x", channel: "C1", ts: "1.0" }),
    ).rejects.toMatchObject({ slackErrorCode: "malformed_response" });
  });

  it("throws SlackApiError with http_<status> on non-2xx responses", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("server error", { status: 500 }),
    );
    await expect(
      chatDelete({ botToken: "x", channel: "C1", ts: "1.0" }),
    ).rejects.toMatchObject({ slackErrorCode: "http_500" });
  });
});
