/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/chatScheduledMessagesList.
 */
import { chatScheduledMessagesList } from "@/integrations/slack/api/chatScheduledMessagesList";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("chatScheduledMessagesList", () => {
  it("POSTs to chat.scheduledMessages.list with an empty body when no params are provided", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          scheduled_messages: [
            { id: "Q1", channel_id: "C1", post_at: 1730000000, date_created: 1729000000, text: "hi" },
          ],
          has_more: false,
        }),
        { status: 200 },
      ),
    );

    const result = await chatScheduledMessagesList({ botToken: "xoxb-test" });

    expect(result.messages).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.scheduledMessages.list");
    expect(JSON.parse((init as { body: string }).body)).toEqual({});
  });

  it("forwards optional channel/limit/oldest/latest/cursor params", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, scheduled_messages: [], has_more: false }),
        { status: 200 },
      ),
    );
    await chatScheduledMessagesList({
      botToken: "x",
      channel: "C1",
      limit: 50,
      oldest: "1.0",
      latest: "2.0",
      cursor: "next-cursor",
    });
    expect(JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body)).toEqual({
      channel: "C1",
      limit: 50,
      oldest: "1.0",
      latest: "2.0",
      cursor: "next-cursor",
    });
  });

  it("passes through Slack's raw scheduled-message shape (snake_case keys)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          scheduled_messages: [
            {
              id: "Q1",
              channel_id: "C1",
              post_at: 1730000000,
              date_created: 1729000000,
              text: "hello",
            },
          ],
          has_more: false,
        }),
        { status: 200 },
      ),
    );
    const result = await chatScheduledMessagesList({ botToken: "x" });
    expect(result.messages[0]).toEqual({
      id: "Q1",
      channel_id: "C1",
      post_at: 1730000000,
      date_created: 1729000000,
      text: "hello",
    });
  });

  it("surfaces nextCursor when Slack returns response_metadata.next_cursor", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          scheduled_messages: [],
          has_more: true,
          response_metadata: { next_cursor: "cursor-page-2" },
        }),
        { status: 200 },
      ),
    );
    const result = await chatScheduledMessagesList({ botToken: "x" });
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("cursor-page-2");
  });

  it("normalizes an empty-string cursor to null", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          scheduled_messages: [],
          has_more: false,
          response_metadata: { next_cursor: "" },
        }),
        { status: 200 },
      ),
    );
    const result = await chatScheduledMessagesList({ botToken: "x" });
    expect(result.nextCursor).toBeNull();
  });

  it("throws SlackApiError on a Slack-side failure", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "invalid_cursor" }), { status: 200 }),
    );
    await expect(
      chatScheduledMessagesList({ botToken: "x", cursor: "bad" }),
    ).rejects.toMatchObject({ slackErrorCode: "invalid_cursor" });
  });
});
