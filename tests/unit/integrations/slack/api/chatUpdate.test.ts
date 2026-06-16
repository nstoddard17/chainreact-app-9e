/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/chatUpdate.
 */
import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { chatUpdate } from "@/integrations/slack/api/chatUpdate";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("chatUpdate", () => {
  it("POSTs to chat.update with channel + ts + text and returns the typed shape", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, channel: "C1", ts: "1.0", text: "edited" }),
        { status: 200 },
      ),
    );

    const result = await chatUpdate({
      botToken: SLACK_TOKEN_PLACEHOLDER,
      channel: "C1",
      ts: "1.0",
      text: "edited",
    });

    expect(result).toEqual({ channel: "C1", ts: "1.0", text: "edited" });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.update");
    const reqInit = init as { headers: Record<string, string>; body: string };
    expect(reqInit.headers.authorization).toBe(`Bearer ${SLACK_TOKEN_PLACEHOLDER}`);
    expect(JSON.parse(reqInit.body)).toEqual({ channel: "C1", ts: "1.0", text: "edited" });
  });

  it("throws SlackApiError with the Slack error code when ok=false", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "cant_update_message" }), { status: 200 }),
    );
    await expect(
      chatUpdate({ botToken: "x", channel: "C1", ts: "1.0", text: "x" }),
    ).rejects.toMatchObject({ slackErrorCode: "cant_update_message" });
  });

  it("throws SlackApiError 'malformed_response' when ok=true but channel/ts/text is missing", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, channel: "C1", ts: "1.0" }), { status: 200 }),
    );
    await expect(
      chatUpdate({ botToken: "x", channel: "C1", ts: "1.0", text: "x" }),
    ).rejects.toMatchObject({ slackErrorCode: "malformed_response" });
  });

  it("throws SlackApiError with http_<status> on non-2xx responses", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("rate limited", { status: 429 }),
    );
    await expect(
      chatUpdate({ botToken: "x", channel: "C1", ts: "1.0", text: "x" }),
    ).rejects.toMatchObject({ slackErrorCode: "http_429" });
  });

  it("uses SLACK_API_BASE override when set", async () => {
    process.env.SLACK_API_BASE = "http://localhost:9876";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, channel: "C1", ts: "1.0", text: "x" }),
        { status: 200 },
      ),
    );
    await chatUpdate({ botToken: "x", channel: "C1", ts: "1.0", text: "x" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:9876/api/chat.update",
      expect.any(Object),
    );
    delete process.env.SLACK_API_BASE;
  });

  it("preserves an empty text field on success (Slack edit-to-empty is rejected upstream but the wrapper does not block)", async () => {
    // chatUpdate's schema enforces non-empty in the action handler, but the
    // wrapper itself should pass through whatever Slack returns.
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, channel: "C1", ts: "1.0", text: "" }), { status: 200 }),
    );
    const result = await chatUpdate({ botToken: "x", channel: "C1", ts: "1.0", text: "" });
    expect(result.text).toBe("");
  });
});
