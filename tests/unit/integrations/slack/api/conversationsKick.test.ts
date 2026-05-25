/**
 * @jest-environment node
 */
import { conversationsKick } from "@/integrations/slack/api/conversationsKick";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("conversationsKick", () => {
  it("POSTs channel + user and resolves void on ok=true", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await conversationsKick({ botToken: "xoxb", channel: "C1", user: "U1" });
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "https://slack.com/api/conversations.kick",
    );
    expect(JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body)).toEqual({
      channel: "C1",
      user: "U1",
    });
  });

  it("throws SlackApiError on logical failure (cant_kick_self)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "cant_kick_self" }), { status: 200 }),
    );
    await expect(
      conversationsKick({ botToken: "x", channel: "C1", user: "U1" }),
    ).rejects.toMatchObject({ slackErrorCode: "cant_kick_self" });
  });
});
