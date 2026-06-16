/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/conversationsReplies.
 */
import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { conversationsReplies } from "@/integrations/slack/api/conversationsReplies";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("conversationsReplies", () => {
  it("POSTs to conversations.replies with channel + ts", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          messages: [
            { ts: "1.0", text: "parent" },
            { ts: "1.1", text: "reply", thread_ts: "1.0" },
          ],
          has_more: false,
        }),
        { status: 200 },
      ),
    );

    const result = await conversationsReplies({
      botToken: SLACK_TOKEN_PLACEHOLDER,
      channel: "C1",
      ts: "1.0",
    });

    expect(result.messages).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/conversations.replies");
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      channel: "C1",
      ts: "1.0",
    });
  });

  it("forwards optional pagination params (limit, oldest, latest, cursor)", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, messages: [], has_more: false }),
        { status: 200 },
      ),
    );
    await conversationsReplies({
      botToken: "x",
      channel: "C1",
      ts: "1.0",
      limit: 25,
      oldest: "0.5",
      latest: "2.0",
      cursor: "cursor-1",
    });
    expect(JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body)).toEqual({
      channel: "C1",
      ts: "1.0",
      limit: 25,
      oldest: "0.5",
      latest: "2.0",
      cursor: "cursor-1",
    });
  });

  it("surfaces nextCursor when Slack returns response_metadata.next_cursor", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          messages: [],
          has_more: true,
          response_metadata: { next_cursor: "cursor-next" },
        }),
        { status: 200 },
      ),
    );
    const result = await conversationsReplies({ botToken: "x", channel: "C1", ts: "1.0" });
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("cursor-next");
  });

  it("throws SlackApiError on thread_not_found", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "thread_not_found" }), { status: 200 }),
    );
    await expect(
      conversationsReplies({ botToken: "x", channel: "C1", ts: "1.0" }),
    ).rejects.toMatchObject({ slackErrorCode: "thread_not_found" });
  });
});
