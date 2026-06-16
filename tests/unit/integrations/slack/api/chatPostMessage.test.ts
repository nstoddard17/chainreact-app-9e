/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/chatPostMessage.
 *
 * Mocks global fetch. Verifies:
 *   - URL + method + body + auth header
 *   - Successful response is parsed into the typed shape
 *   - Slack `ok: false` payloads throw SlackApiError with the slack code
 *   - Non-2xx HTTP throws SlackApiError with `http_<status>`
 *   - Malformed-but-ok responses throw `malformed_response`
 */
import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import {
  SlackApiError,
  chatPostMessage,
} from "@/integrations/slack/api/chatPostMessage";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("chatPostMessage", () => {
  it("POSTs to chat.postMessage with the bot token and JSON body", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          ts: "1730000000.000123",
          channel: "C123",
          message: { text: "hi", user: "U_BOT" },
        }),
        { status: 200 },
      ),
    );

    const result = await chatPostMessage({
      botToken: SLACK_TOKEN_PLACEHOLDER,
      channel: "C123",
      text: "hi",
    });

    expect(result).toEqual({
      ts: "1730000000.000123",
      channel: "C123",
      message: { text: "hi", user: "U_BOT" },
    });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const reqInit = init as {
      method: string;
      headers: Record<string, string>;
      body: string;
    };
    expect(reqInit.method).toBe("POST");
    expect(reqInit.headers.authorization).toBe(`Bearer ${SLACK_TOKEN_PLACEHOLDER}`);
    expect(JSON.parse(reqInit.body)).toEqual({
      channel: "C123",
      text: "hi",
    });
  });

  it("throws SlackApiError with the Slack error code when ok=false", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "channel_not_found" }), {
        status: 200,
      }),
    );
    await expect(
      chatPostMessage({ botToken: "x", channel: "C", text: "t" }),
    ).rejects.toMatchObject({
      name: "SlackApiError",
      slackErrorCode: "channel_not_found",
    });
  });

  it("throws SlackApiError 'unknown_error' when ok=false but error is missing", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 200 }));
    await expect(
      chatPostMessage({ botToken: "x", channel: "C", text: "t" }),
    ).rejects.toMatchObject({ slackErrorCode: "unknown_error" });
  });

  it("throws SlackApiError with http_<status> on non-2xx responses", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }));
    await expect(
      chatPostMessage({ botToken: "x", channel: "C", text: "t" }),
    ).rejects.toMatchObject({ slackErrorCode: "http_429" });
  });

  it("throws SlackApiError 'malformed_response' when ok=true but ts/channel/message is missing", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, ts: "1.0" }), { status: 200 }),
    );
    await expect(
      chatPostMessage({ botToken: "x", channel: "C", text: "t" }),
    ).rejects.toMatchObject({ slackErrorCode: "malformed_response" });
  });

  it("SlackApiError has the right name (so callers can branch with instanceof)", () => {
    const e = new SlackApiError("foo");
    expect(e).toBeInstanceOf(SlackApiError);
    expect(e.name).toBe("SlackApiError");
  });

  it("uses SLACK_API_BASE override when set (e2e mock surface)", async () => {
    process.env.SLACK_API_BASE = "http://localhost:9876";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          ts: "1.0",
          channel: "C",
          message: { text: "x" },
        }),
        { status: 200 },
      ),
    );
    await chatPostMessage({ botToken: "x", channel: "C", text: "t" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:9876/api/chat.postMessage",
      expect.any(Object),
    );
    delete process.env.SLACK_API_BASE;
  });

  it("defaults to slack.com when SLACK_API_BASE is unset (production-safe)", async () => {
    delete process.env.SLACK_API_BASE;
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          ts: "1.0",
          channel: "C",
          message: { text: "x" },
        }),
        { status: 200 },
      ),
    );
    await chatPostMessage({ botToken: "x", channel: "C", text: "t" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://slack.com/api/chat.postMessage",
      expect.any(Object),
    );
  });

  it("forwards thread_ts to Slack when provided (Slack 2.1 expansion)", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          ts: "2.0",
          channel: "C1",
          message: { text: "reply", thread_ts: "1.0" },
        }),
        { status: 200 },
      ),
    );
    await chatPostMessage({
      botToken: "xoxb",
      channel: "C1",
      text: "reply",
      threadTs: "1.0",
    });
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      channel: "C1",
      text: "reply",
      thread_ts: "1.0",
    });
  });

  it("omits the thread_ts key entirely when threadTs is undefined (no parent-message side effects)", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          ts: "1.0",
          channel: "C1",
          message: { text: "hi" },
        }),
        { status: 200 },
      ),
    );
    await chatPostMessage({ botToken: "x", channel: "C1", text: "hi" });
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toEqual({ channel: "C1", text: "hi" });
    expect("thread_ts" in body).toBe(false);
  });

  it("forwards blocks to Slack when provided (Slack 2.1 Commit 7 — Block Kit)", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          ts: "1.0",
          channel: "C1",
          message: { blocks: [{ type: "section", text: { type: "mrkdwn", text: "hi" } }] },
        }),
        { status: 200 },
      ),
    );
    const blocks = [{ type: "section", text: { type: "mrkdwn", text: "hi" } }];
    await chatPostMessage({
      botToken: "xoxb",
      channel: "C1",
      blocks,
      text: "fallback for notifications",
    });
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toEqual({
      channel: "C1",
      text: "fallback for notifications",
      blocks,
    });
  });

  it("omits text when only blocks is provided (Block Kit without notification fallback)", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          ts: "1.0",
          channel: "C1",
          message: { blocks: [{ type: "divider" }] },
        }),
        { status: 200 },
      ),
    );
    const blocks = [{ type: "divider" }];
    await chatPostMessage({ botToken: "xoxb", channel: "C1", blocks });
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toEqual({ channel: "C1", blocks });
    expect("text" in body).toBe(false);
  });

  it("throws SlackApiError 'missing_text_or_blocks' when neither text nor blocks is provided (defense-in-depth)", async () => {
    // Slack would also reject this server-side, but we throw locally
    // with a clearer code so the engine surfaces it as a config-shape
    // problem instead of as a Slack API failure.
    await expect(
      chatPostMessage({ botToken: "xoxb", channel: "C1" }),
    ).rejects.toMatchObject({ slackErrorCode: "missing_text_or_blocks" });
  });

  it("throws 'missing_text_or_blocks' when text is empty string AND blocks is empty array", async () => {
    await expect(
      chatPostMessage({ botToken: "xoxb", channel: "C1", text: "", blocks: [] }),
    ).rejects.toMatchObject({ slackErrorCode: "missing_text_or_blocks" });
  });

  it("does NOT throw missing_text_or_blocks when blocks is non-empty even if text is absent", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, ts: "1.0", channel: "C1", message: { blocks: [{ type: "divider" }] } }),
        { status: 200 },
      ),
    );
    await expect(
      chatPostMessage({ botToken: "xoxb", channel: "C1", blocks: [{ type: "divider" }] }),
    ).resolves.toBeDefined();
  });
});
