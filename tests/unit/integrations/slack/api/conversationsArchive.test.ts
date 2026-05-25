/**
 * @jest-environment node
 */
import { conversationsArchive } from "@/integrations/slack/api/conversationsArchive";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("conversationsArchive", () => {
  it("POSTs to conversations.archive with the channel id", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await conversationsArchive({ botToken: "xoxb", channel: "C1" });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://slack.com/api/conversations.archive");
    expect(JSON.parse((init as { body: string }).body)).toEqual({ channel: "C1" });
  });

  it("resolves void on ok=true (no body to surface)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await expect(
      conversationsArchive({ botToken: "x", channel: "C1" }),
    ).resolves.toBeUndefined();
  });

  it("throws SlackApiError on Slack-side failure (already_archived)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, error: "already_archived" }),
        { status: 200 },
      ),
    );
    await expect(
      conversationsArchive({ botToken: "x", channel: "C1" }),
    ).rejects.toMatchObject({ slackErrorCode: "already_archived" });
  });
});
