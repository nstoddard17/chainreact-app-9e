/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/usersInfo (Slack 2.3 Commit 4).
 */
import { usersInfo } from "@/integrations/slack/api/usersInfo";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.SLACK_API_BASE;
});

describe("usersInfo — request shape", () => {
  it("POSTs to /api/users.info with the user id in the body", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          user: { id: "U1", name: "alice", real_name: "Alice Anderson" },
        }),
        { status: 200 },
      ),
    );

    await usersInfo({ botToken: "xoxb-test", user: "U1" });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://slack.com/api/users.info");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer xoxb-test");
    expect(JSON.parse((init as { body: string }).body)).toEqual({ user: "U1" });
  });

  it("respects SLACK_API_BASE override for e2e mocks", async () => {
    process.env.SLACK_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, user: { id: "U1", name: "alice" } }),
        { status: 200 },
      ),
    );

    await usersInfo({ botToken: "x", user: "U1" });

    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "http://127.0.0.1:9876/api/users.info",
    );
  });
});

describe("usersInfo — happy path", () => {
  it("returns Slack's user object verbatim (snake_case preserved)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          user: {
            id: "U1",
            name: "alice",
            real_name: "Alice Anderson",
            is_admin: false,
            is_owner: false,
            is_bot: false,
            tz: "America/Los_Angeles",
            profile: {
              display_name: "Alice",
              image_192: "https://example.com/avatar.png",
              title: "Engineer",
            },
          },
        }),
        { status: 200 },
      ),
    );

    const result = await usersInfo({ botToken: "x", user: "U1" });
    expect(result.user).toMatchObject({
      id: "U1",
      name: "alice",
      real_name: "Alice Anderson",
      profile: expect.objectContaining({ display_name: "Alice" }),
    });
  });
});

describe("usersInfo — error preservation", () => {
  it("throws SlackApiError on logical failure (user_not_found)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, error: "user_not_found" }),
        { status: 200 },
      ),
    );
    await expect(
      usersInfo({ botToken: "x", user: "U1" }),
    ).rejects.toMatchObject({ slackErrorCode: "user_not_found" });
  });

  it("throws SlackApiError with http_<status> on non-2xx", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("unauthorized", { status: 401 }),
    );
    await expect(
      usersInfo({ botToken: "x", user: "U1" }),
    ).rejects.toMatchObject({ slackErrorCode: "http_401" });
  });

  it("throws SlackApiError(user_not_found) on ok=true with absent user (defense in depth)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await expect(
      usersInfo({ botToken: "x", user: "U1" }),
    ).rejects.toMatchObject({ slackErrorCode: "user_not_found" });
  });
});
