/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/conversationsInfo (Slack 2.3 Commit 2).
 */
import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { conversationsInfo } from "@/integrations/slack/api/conversationsInfo";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.SLACK_API_BASE;
});

describe("conversationsInfo — request shape", () => {
  it("POSTs to /api/conversations.info with the channel id in the body", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          channel: { id: "C1", name: "general", is_private: false },
        }),
        { status: 200 },
      ),
    );

    await conversationsInfo({ botToken: SLACK_TOKEN_PLACEHOLDER, channel: "C1" });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://slack.com/api/conversations.info");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${SLACK_TOKEN_PLACEHOLDER}`);
    expect(JSON.parse((init as { body: string }).body)).toEqual({ channel: "C1" });
  });

  it("respects SLACK_API_BASE override for e2e mocks", async () => {
    process.env.SLACK_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, channel: { id: "C1", name: "general" } }),
        { status: 200 },
      ),
    );

    await conversationsInfo({ botToken: "x", channel: "C1" });

    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "http://127.0.0.1:9876/api/conversations.info",
    );
  });
});

describe("conversationsInfo — happy path", () => {
  it("returns Slack's channel object verbatim (snake_case keys preserved)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          channel: {
            id: "C1",
            name: "general",
            is_private: false,
            is_archived: false,
            num_members: 42,
            topic: { value: "Topic text", creator: "U1", last_set: 1730000000 },
            purpose: { value: "Purpose text", creator: "U1", last_set: 1730000000 },
            created: 1730000000,
          },
        }),
        { status: 200 },
      ),
    );

    const result = await conversationsInfo({ botToken: "x", channel: "C1" });
    expect(result.channel).toEqual({
      id: "C1",
      name: "general",
      is_private: false,
      is_archived: false,
      num_members: 42,
      topic: { value: "Topic text", creator: "U1", last_set: 1730000000 },
      purpose: { value: "Purpose text", creator: "U1", last_set: 1730000000 },
      created: 1730000000,
    });
  });
});

describe("conversationsInfo — error preservation", () => {
  it("throws SlackApiError with the Slack code on logical failure (channel_not_found)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, error: "channel_not_found" }),
        { status: 200 },
      ),
    );
    await expect(
      conversationsInfo({ botToken: "x", channel: "C1" }),
    ).rejects.toMatchObject({ slackErrorCode: "channel_not_found" });
  });

  it("throws SlackApiError with http_<status> on non-2xx", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("unauthorized", { status: 401 }),
    );
    await expect(
      conversationsInfo({ botToken: "x", channel: "C1" }),
    ).rejects.toMatchObject({ slackErrorCode: "http_401" });
  });

  it("throws SlackApiError(channel_not_found) when Slack returns ok=true but omits the channel field (defense in depth)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await expect(
      conversationsInfo({ botToken: "x", channel: "C1" }),
    ).rejects.toMatchObject({ slackErrorCode: "channel_not_found" });
  });
});
