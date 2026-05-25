/**
 * @jest-environment node
 */
import { conversationsUnarchive } from "@/integrations/slack/api/conversationsUnarchive";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("conversationsUnarchive", () => {
  it("POSTs to conversations.unarchive with the channel id", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await conversationsUnarchive({ botToken: "xoxb", channel: "C1" });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://slack.com/api/conversations.unarchive");
    expect(JSON.parse((init as { body: string }).body)).toEqual({ channel: "C1" });
  });

  it("throws SlackApiError on Slack-side failure (not_archived)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "not_archived" }), { status: 200 }),
    );
    await expect(
      conversationsUnarchive({ botToken: "x", channel: "C1" }),
    ).rejects.toMatchObject({ slackErrorCode: "not_archived" });
  });
});
