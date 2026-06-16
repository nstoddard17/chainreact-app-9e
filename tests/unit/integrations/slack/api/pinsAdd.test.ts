/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/pinsAdd.
 */
import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { pinsAdd } from "@/integrations/slack/api/pinsAdd";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("pinsAdd", () => {
  it("POSTs to pins.add with channel + timestamp", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await pinsAdd({
      botToken: SLACK_TOKEN_PLACEHOLDER,
      channel: "C1",
      timestamp: "1.0",
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/pins.add");
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      channel: "C1",
      timestamp: "1.0",
    });
  });

  it("resolves with void on success", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const result = await pinsAdd({ botToken: "x", channel: "C1", timestamp: "1.0" });
    expect(result).toBeUndefined();
  });

  it("throws SlackApiError on already_pinned", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "already_pinned" }), { status: 200 }),
    );
    await expect(
      pinsAdd({ botToken: "x", channel: "C1", timestamp: "1.0" }),
    ).rejects.toMatchObject({ slackErrorCode: "already_pinned" });
  });

  it("throws SlackApiError on permission_denied", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "permission_denied" }), { status: 200 }),
    );
    await expect(
      pinsAdd({ botToken: "x", channel: "C1", timestamp: "1.0" }),
    ).rejects.toMatchObject({ slackErrorCode: "permission_denied" });
  });
});
