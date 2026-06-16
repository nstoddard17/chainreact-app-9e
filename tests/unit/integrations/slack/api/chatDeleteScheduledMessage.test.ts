/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/chatDeleteScheduledMessage.
 */
import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { chatDeleteScheduledMessage } from "@/integrations/slack/api/chatDeleteScheduledMessage";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("chatDeleteScheduledMessage", () => {
  it("POSTs to chat.deleteScheduledMessage with channel + scheduled_message_id", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await chatDeleteScheduledMessage({
      botToken: SLACK_TOKEN_PLACEHOLDER,
      channel: "C1",
      scheduledMessageId: "Q1234ABCD",
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.deleteScheduledMessage");
    const reqInit = init as { headers: Record<string, string>; body: string };
    expect(reqInit.headers.authorization).toBe(`Bearer ${SLACK_TOKEN_PLACEHOLDER}`);
    expect(JSON.parse(reqInit.body)).toEqual({
      channel: "C1",
      scheduled_message_id: "Q1234ABCD",
    });
  });

  it("resolves with void on success — Slack returns no useful body", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const result = await chatDeleteScheduledMessage({
      botToken: "x",
      channel: "C1",
      scheduledMessageId: "Q1",
    });
    expect(result).toBeUndefined();
  });

  it("throws SlackApiError on invalid_scheduled_message_id", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, error: "invalid_scheduled_message_id" }),
        { status: 200 },
      ),
    );
    await expect(
      chatDeleteScheduledMessage({ botToken: "x", channel: "C1", scheduledMessageId: "Q1" }),
    ).rejects.toMatchObject({ slackErrorCode: "invalid_scheduled_message_id" });
  });

  it("throws SlackApiError with http_<status> on non-2xx", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("server error", { status: 500 }),
    );
    await expect(
      chatDeleteScheduledMessage({ botToken: "x", channel: "C1", scheduledMessageId: "Q1" }),
    ).rejects.toMatchObject({ slackErrorCode: "http_500" });
  });
});
