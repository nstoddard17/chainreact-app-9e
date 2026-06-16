/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/conversationsOpen.
 */
import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { conversationsOpen } from "@/integrations/slack/api/conversationsOpen";
import { SlackApiError } from "@/integrations/slack/api/errors";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("conversationsOpen", () => {
  it("POSTs to conversations.open with the bot token and JSON body", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, channel: { id: "D-DM-123" } }),
        { status: 200 },
      ),
    );

    const result = await conversationsOpen({
      botToken: SLACK_TOKEN_PLACEHOLDER,
      users: "U1",
    });

    expect(result).toEqual({ channelId: "D-DM-123" });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/conversations.open");
    const reqInit = init as { method: string; headers: Record<string, string>; body: string };
    expect(reqInit.method).toBe("POST");
    expect(reqInit.headers.authorization).toBe(`Bearer ${SLACK_TOKEN_PLACEHOLDER}`);
    expect(JSON.parse(reqInit.body)).toEqual({ users: "U1" });
  });

  it("throws SlackApiError with the Slack error code when ok=false", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "user_not_found" }), { status: 200 }),
    );
    await expect(
      conversationsOpen({ botToken: "x", users: "U1" }),
    ).rejects.toMatchObject({ name: "SlackApiError", slackErrorCode: "user_not_found" });
  });

  it("throws SlackApiError 'malformed_response' when ok=true but channel.id is missing", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await expect(
      conversationsOpen({ botToken: "x", users: "U1" }),
    ).rejects.toMatchObject({ slackErrorCode: "malformed_response" });
  });

  it("throws SlackApiError with http_<status> on non-2xx responses", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("rate limited", { status: 429 }),
    );
    await expect(
      conversationsOpen({ botToken: "x", users: "U1" }),
    ).rejects.toMatchObject({ slackErrorCode: "http_429" });
  });

  it("uses SLACK_API_BASE override when set (e2e mock surface)", async () => {
    process.env.SLACK_API_BASE = "http://localhost:9876";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, channel: { id: "D1" } }), { status: 200 }),
    );
    await conversationsOpen({ botToken: "x", users: "U1" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:9876/api/conversations.open",
      expect.any(Object),
    );
    delete process.env.SLACK_API_BASE;
  });

  it("SlackApiError class export is the canonical one", () => {
    expect(new SlackApiError("foo")).toBeInstanceOf(SlackApiError);
  });
});
