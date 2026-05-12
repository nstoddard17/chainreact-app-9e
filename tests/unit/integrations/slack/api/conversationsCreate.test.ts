/**
 * @jest-environment node
 */
import { conversationsCreate } from "@/integrations/slack/api/conversationsCreate";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.SLACK_API_BASE;
});

describe("conversationsCreate", () => {
  it("POSTs name + is_private (snake_case) and returns the channel object", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, channel: { id: "C1", name: "new-room", is_private: false } }),
        { status: 200 },
      ),
    );
    const result = await conversationsCreate({
      botToken: "xoxb",
      name: "new-room",
      isPrivate: false,
    });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://slack.com/api/conversations.create");
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      name: "new-room",
      is_private: false,
    });
    expect(result.channel).toMatchObject({ id: "C1" });
  });

  it("passes is_private=true for private channel creation", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, channel: { id: "CPRIV1", is_private: true } }),
        { status: 200 },
      ),
    );
    await conversationsCreate({ botToken: "x", name: "secret", isPrivate: true });
    expect(JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body)).toEqual({
      name: "secret",
      is_private: true,
    });
  });

  it("respects SLACK_API_BASE", async () => {
    process.env.SLACK_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, channel: { id: "C1" } }), { status: 200 }),
    );
    await conversationsCreate({ botToken: "x", name: "n", isPrivate: false });
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "http://127.0.0.1:9876/api/conversations.create",
    );
  });

  it("throws SlackApiError on Slack-side failure (name_taken)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "name_taken" }), { status: 200 }),
    );
    await expect(
      conversationsCreate({ botToken: "x", name: "n", isPrivate: false }),
    ).rejects.toMatchObject({ slackErrorCode: "name_taken" });
  });

  it("throws SlackApiError(name_taken) on ok=true with absent channel (defense in depth)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await expect(
      conversationsCreate({ botToken: "x", name: "n", isPrivate: false }),
    ).rejects.toMatchObject({ slackErrorCode: "name_taken" });
  });
});
