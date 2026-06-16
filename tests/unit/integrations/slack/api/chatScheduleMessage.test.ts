/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/chatScheduleMessage.
 */
import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { chatScheduleMessage } from "@/integrations/slack/api/chatScheduleMessage";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("chatScheduleMessage", () => {
  it("POSTs to chat.scheduleMessage with channel + text + post_at", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          channel: "C1",
          scheduled_message_id: "Q1234ABCD",
          post_at: 1730000000,
        }),
        { status: 200 },
      ),
    );

    const result = await chatScheduleMessage({
      botToken: SLACK_TOKEN_PLACEHOLDER,
      channel: "C1",
      text: "hello",
      postAt: 1730000000,
    });

    expect(result).toEqual({
      channel: "C1",
      scheduledMessageId: "Q1234ABCD",
      postAt: 1730000000,
    });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.scheduleMessage");
    const reqInit = init as { headers: Record<string, string>; body: string };
    expect(reqInit.headers.authorization).toBe(`Bearer ${SLACK_TOKEN_PLACEHOLDER}`);
    expect(JSON.parse(reqInit.body)).toEqual({
      channel: "C1",
      text: "hello",
      post_at: 1730000000,
    });
  });

  it("includes thread_ts when threadTs is provided", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          channel: "C1",
          scheduled_message_id: "Q1",
          post_at: 1730000000,
        }),
        { status: 200 },
      ),
    );
    await chatScheduleMessage({
      botToken: "x",
      channel: "C1",
      text: "reply",
      postAt: 1730000000,
      threadTs: "1.0",
    });
    expect(JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body))
      .toEqual({
        channel: "C1",
        text: "reply",
        post_at: 1730000000,
        thread_ts: "1.0",
      });
  });

  it("omits thread_ts entirely when threadTs is undefined", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          channel: "C1",
          scheduled_message_id: "Q1",
          post_at: 1730000000,
        }),
        { status: 200 },
      ),
    );
    await chatScheduleMessage({
      botToken: "x",
      channel: "C1",
      text: "hi",
      postAt: 1730000000,
    });
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body);
    expect("thread_ts" in body).toBe(false);
  });

  it("throws SlackApiError with the Slack code on time_in_past", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "time_in_past" }), { status: 200 }),
    );
    await expect(
      chatScheduleMessage({ botToken: "x", channel: "C1", text: "x", postAt: 1 }),
    ).rejects.toMatchObject({ slackErrorCode: "time_in_past" });
  });

  it("throws SlackApiError 'malformed_response' when ok response is missing required fields", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, channel: "C1", scheduled_message_id: "Q1" }),
        { status: 200 },
      ),
    );
    await expect(
      chatScheduleMessage({ botToken: "x", channel: "C1", text: "x", postAt: 1730000000 }),
    ).rejects.toMatchObject({ slackErrorCode: "malformed_response" });
  });

  it("throws SlackApiError with http_<status> on non-2xx", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("rate limited", { status: 429 }),
    );
    await expect(
      chatScheduleMessage({ botToken: "x", channel: "C1", text: "x", postAt: 1730000000 }),
    ).rejects.toMatchObject({ slackErrorCode: "http_429" });
  });
});
