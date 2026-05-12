/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/reactionsAdd.
 */
import { reactionsAdd } from "@/integrations/slack/api/reactionsAdd";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("reactionsAdd", () => {
  it("POSTs to reactions.add with channel + timestamp + name (Slack's field names)", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await reactionsAdd({
      botToken: "xoxb-test",
      channel: "C1",
      timestamp: "1.0",
      name: "thumbsup",
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/reactions.add");
    const reqInit = init as { headers: Record<string, string>; body: string };
    expect(reqInit.headers.authorization).toBe("Bearer xoxb-test");
    expect(JSON.parse(reqInit.body)).toEqual({
      channel: "C1",
      timestamp: "1.0",
      name: "thumbsup",
    });
  });

  it("resolves with void on success", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const result = await reactionsAdd({
      botToken: "x",
      channel: "C1",
      timestamp: "1.0",
      name: "tada",
    });
    expect(result).toBeUndefined();
  });

  it("throws SlackApiError with the Slack code on already_reacted", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "already_reacted" }), { status: 200 }),
    );
    await expect(
      reactionsAdd({ botToken: "x", channel: "C1", timestamp: "1.0", name: "thumbsup" }),
    ).rejects.toMatchObject({ slackErrorCode: "already_reacted" });
  });

  it("throws SlackApiError on invalid_name", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "invalid_name" }), { status: 200 }),
    );
    await expect(
      reactionsAdd({ botToken: "x", channel: "C1", timestamp: "1.0", name: "not-a-real-emoji" }),
    ).rejects.toMatchObject({ slackErrorCode: "invalid_name" });
  });

  it("throws SlackApiError on not_in_channel (V2 surfaces directly; V1 auto-joined here)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "not_in_channel" }), { status: 200 }),
    );
    await expect(
      reactionsAdd({ botToken: "x", channel: "C1", timestamp: "1.0", name: "thumbsup" }),
    ).rejects.toMatchObject({ slackErrorCode: "not_in_channel" });
  });

  it("throws SlackApiError with http_<status> on non-2xx", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("rate limited", { status: 429 }),
    );
    await expect(
      reactionsAdd({ botToken: "x", channel: "C1", timestamp: "1.0", name: "thumbsup" }),
    ).rejects.toMatchObject({ slackErrorCode: "http_429" });
  });
});
