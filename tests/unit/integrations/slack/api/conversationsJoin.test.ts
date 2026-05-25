/**
 * @jest-environment node
 */
import { conversationsJoin } from "@/integrations/slack/api/conversationsJoin";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("conversationsJoin", () => {
  it("POSTs the channel id and returns the joined channel object", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, channel: { id: "C1", name: "general" } }),
        { status: 200 },
      ),
    );
    const result = await conversationsJoin({ botToken: "xoxb", channel: "C1" });
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "https://slack.com/api/conversations.join",
    );
    expect(JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body)).toEqual({
      channel: "C1",
    });
    expect(result.channel).toMatchObject({ id: "C1" });
  });

  it("throws SlackApiError on logical failure (is_archived)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "is_archived" }), { status: 200 }),
    );
    await expect(
      conversationsJoin({ botToken: "x", channel: "C1" }),
    ).rejects.toMatchObject({ slackErrorCode: "is_archived" });
  });
});
