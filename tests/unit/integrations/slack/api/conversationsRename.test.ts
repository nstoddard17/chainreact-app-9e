/**
 * @jest-environment node
 */
import { conversationsRename } from "@/integrations/slack/api/conversationsRename";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("conversationsRename", () => {
  it("POSTs channel + name and returns the renamed channel object", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, channel: { id: "C1", name: "renamed" } }),
        { status: 200 },
      ),
    );
    const result = await conversationsRename({
      botToken: "xoxb",
      channel: "C1",
      name: "renamed",
    });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://slack.com/api/conversations.rename");
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      channel: "C1",
      name: "renamed",
    });
    expect(result.channel).toMatchObject({ name: "renamed" });
  });

  it("throws SlackApiError on Slack-side failure (invalid_name)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "invalid_name" }), { status: 200 }),
    );
    await expect(
      conversationsRename({ botToken: "x", channel: "C1", name: "BAD!" }),
    ).rejects.toMatchObject({ slackErrorCode: "invalid_name" });
  });
});
