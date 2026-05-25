/**
 * @jest-environment node
 */
import { conversationsLeave } from "@/integrations/slack/api/conversationsLeave";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("conversationsLeave", () => {
  it("POSTs the channel id and resolves void on ok=true", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await conversationsLeave({ botToken: "xoxb", channel: "C1" });
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "https://slack.com/api/conversations.leave",
    );
    expect(JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body)).toEqual({
      channel: "C1",
    });
  });

  it("throws SlackApiError on logical failure (not_in_channel)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "not_in_channel" }), { status: 200 }),
    );
    await expect(
      conversationsLeave({ botToken: "x", channel: "C1" }),
    ).rejects.toMatchObject({ slackErrorCode: "not_in_channel" });
  });
});
