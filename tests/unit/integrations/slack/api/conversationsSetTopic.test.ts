/**
 * @jest-environment node
 */
import { conversationsSetTopic } from "@/integrations/slack/api/conversationsSetTopic";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("conversationsSetTopic", () => {
  it("POSTs channel + topic and returns the updated channel object", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          channel: { id: "C1", topic: { value: "New topic" } },
        }),
        { status: 200 },
      ),
    );
    const result = await conversationsSetTopic({
      botToken: "x",
      channel: "C1",
      topic: "New topic",
    });
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "https://slack.com/api/conversations.setTopic",
    );
    expect(JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body)).toEqual({
      channel: "C1",
      topic: "New topic",
    });
    expect((result.channel as { topic?: unknown }).topic).toMatchObject({ value: "New topic" });
  });

  it("forwards an empty topic to clear", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, channel: { id: "C1", topic: { value: "" } } }),
        { status: 200 },
      ),
    );
    await conversationsSetTopic({ botToken: "x", channel: "C1", topic: "" });
    expect(JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body)).toEqual({
      channel: "C1",
      topic: "",
    });
  });

  it("throws SlackApiError on Slack-side failure (channel_not_found)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, error: "channel_not_found" }),
        { status: 200 },
      ),
    );
    await expect(
      conversationsSetTopic({ botToken: "x", channel: "C1", topic: "t" }),
    ).rejects.toMatchObject({ slackErrorCode: "channel_not_found" });
  });
});
