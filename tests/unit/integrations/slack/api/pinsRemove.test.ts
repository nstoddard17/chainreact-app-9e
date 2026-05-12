/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/pinsRemove.
 */
import { pinsRemove } from "@/integrations/slack/api/pinsRemove";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("pinsRemove", () => {
  it("POSTs to pins.remove with channel + timestamp", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await pinsRemove({
      botToken: "xoxb-test",
      channel: "C1",
      timestamp: "1.0",
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/pins.remove");
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      channel: "C1",
      timestamp: "1.0",
    });
  });

  it("resolves with void on success", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const result = await pinsRemove({ botToken: "x", channel: "C1", timestamp: "1.0" });
    expect(result).toBeUndefined();
  });

  it("throws SlackApiError on not_pinned", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "not_pinned" }), { status: 200 }),
    );
    await expect(
      pinsRemove({ botToken: "x", channel: "C1", timestamp: "1.0" }),
    ).rejects.toMatchObject({ slackErrorCode: "not_pinned" });
  });

  it("throws SlackApiError on message_not_found", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "message_not_found" }), { status: 200 }),
    );
    await expect(
      pinsRemove({ botToken: "x", channel: "C1", timestamp: "1.0" }),
    ).rejects.toMatchObject({ slackErrorCode: "message_not_found" });
  });
});
