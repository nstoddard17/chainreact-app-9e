/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/conversationsHistory.
 */
import { conversationsHistory } from "@/integrations/slack/api/conversationsHistory";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("conversationsHistory", () => {
  it("POSTs to conversations.history with channel only when no extras are provided", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          messages: [{ ts: "1.0", text: "hello" }],
          has_more: false,
        }),
        { status: 200 },
      ),
    );

    const result = await conversationsHistory({
      botToken: "xoxb-test",
      channel: "C1",
    });

    expect(result).toEqual({
      messages: [{ ts: "1.0", text: "hello" }],
      hasMore: false,
      nextCursor: null,
    });
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toEqual({ channel: "C1" });
  });

  it("forwards optional params (limit, oldest, latest, cursor) to Slack", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, messages: [], has_more: false }),
        { status: 200 },
      ),
    );
    await conversationsHistory({
      botToken: "x",
      channel: "C1",
      limit: 50,
      oldest: "1.0",
      latest: "2.0",
      cursor: "next-cursor",
    });
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      channel: "C1",
      limit: 50,
      oldest: "1.0",
      latest: "2.0",
      cursor: "next-cursor",
    });
  });

  it("surfaces nextCursor when Slack returns response_metadata.next_cursor", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          messages: [],
          has_more: true,
          response_metadata: { next_cursor: "cursor-page-2" },
        }),
        { status: 200 },
      ),
    );
    const result = await conversationsHistory({ botToken: "x", channel: "C1" });
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("cursor-page-2");
  });

  it("normalizes an empty-string cursor to null (Slack returns '' at the end of pagination)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          messages: [],
          has_more: false,
          response_metadata: { next_cursor: "" },
        }),
        { status: 200 },
      ),
    );
    const result = await conversationsHistory({ botToken: "x", channel: "C1" });
    expect(result.nextCursor).toBeNull();
  });

  it("returns an empty messages array when Slack returns no messages", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const result = await conversationsHistory({ botToken: "x", channel: "C1" });
    expect(result.messages).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("throws SlackApiError on Slack-side failure (channel_not_found)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "channel_not_found" }), { status: 200 }),
    );
    await expect(
      conversationsHistory({ botToken: "x", channel: "C1" }),
    ).rejects.toMatchObject({ slackErrorCode: "channel_not_found" });
  });
});
