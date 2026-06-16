/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/reactionsRemove.
 */
import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { reactionsRemove } from "@/integrations/slack/api/reactionsRemove";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("reactionsRemove", () => {
  it("POSTs to reactions.remove with channel + timestamp + name", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await reactionsRemove({
      botToken: SLACK_TOKEN_PLACEHOLDER,
      channel: "C1",
      timestamp: "1.0",
      name: "thumbsup",
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/reactions.remove");
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      channel: "C1",
      timestamp: "1.0",
      name: "thumbsup",
    });
  });

  it("resolves with void on success", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const result = await reactionsRemove({
      botToken: "x",
      channel: "C1",
      timestamp: "1.0",
      name: "thumbsup",
    });
    expect(result).toBeUndefined();
  });

  it("throws SlackApiError on no_reaction (bot hadn't reacted)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "no_reaction" }), { status: 200 }),
    );
    await expect(
      reactionsRemove({ botToken: "x", channel: "C1", timestamp: "1.0", name: "thumbsup" }),
    ).rejects.toMatchObject({ slackErrorCode: "no_reaction" });
  });

  it("throws SlackApiError on message_not_found", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "message_not_found" }), { status: 200 }),
    );
    await expect(
      reactionsRemove({ botToken: "x", channel: "C1", timestamp: "1.0", name: "thumbsup" }),
    ).rejects.toMatchObject({ slackErrorCode: "message_not_found" });
  });
});
