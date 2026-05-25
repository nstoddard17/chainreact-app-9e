/**
 * @jest-environment node
 */
import { conversationsInvite } from "@/integrations/slack/api/conversationsInvite";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("conversationsInvite", () => {
  it("POSTs channel + comma-joined users and returns the channel object", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, channel: { id: "C1" } }),
        { status: 200 },
      ),
    );
    const result = await conversationsInvite({
      botToken: "xoxb",
      channel: "C1",
      users: "U1,U2,U3",
    });
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "https://slack.com/api/conversations.invite",
    );
    expect(JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body)).toEqual({
      channel: "C1",
      users: "U1,U2,U3",
    });
    expect(result.channel).toMatchObject({ id: "C1" });
  });

  it("throws SlackApiError on logical failure (already_in_channel)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, error: "already_in_channel" }),
        { status: 200 },
      ),
    );
    await expect(
      conversationsInvite({ botToken: "x", channel: "C1", users: "U1" }),
    ).rejects.toMatchObject({ slackErrorCode: "already_in_channel" });
  });

  it("throws SlackApiError(channel_not_found) on ok=true with absent channel (defense)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await expect(
      conversationsInvite({ botToken: "x", channel: "C1", users: "U1" }),
    ).rejects.toMatchObject({ slackErrorCode: "channel_not_found" });
  });
});
