/**
 * @jest-environment node
 */
import { conversationsSetPurpose } from "@/integrations/slack/api/conversationsSetPurpose";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("conversationsSetPurpose", () => {
  it("POSTs channel + purpose and returns the updated channel object", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          channel: { id: "C1", purpose: { value: "New purpose" } },
        }),
        { status: 200 },
      ),
    );
    const result = await conversationsSetPurpose({
      botToken: "x",
      channel: "C1",
      purpose: "New purpose",
    });
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "https://slack.com/api/conversations.setPurpose",
    );
    expect(JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body)).toEqual({
      channel: "C1",
      purpose: "New purpose",
    });
    expect((result.channel as { purpose?: unknown }).purpose).toMatchObject({
      value: "New purpose",
    });
  });

  it("throws SlackApiError on logical failure", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, error: "channel_not_found" }),
        { status: 200 },
      ),
    );
    await expect(
      conversationsSetPurpose({ botToken: "x", channel: "C1", purpose: "p" }),
    ).rejects.toMatchObject({ slackErrorCode: "channel_not_found" });
  });
});
