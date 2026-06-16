/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/authTest (V2-READY-29 — health probe).
 */
import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { authTest } from "@/integrations/slack/api/authTest";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.SLACK_API_BASE;
});

describe("authTest — request shape", () => {
  it("POSTs to /api/auth.test with an empty body and Bearer token", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, team_id: "T1", user_id: "U1", url: "https://x.slack.com" }),
        { status: 200 },
      ),
    );

    await authTest({ botToken: SLACK_TOKEN_PLACEHOLDER });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://slack.com/api/auth.test");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${SLACK_TOKEN_PLACEHOLDER}`);
    expect(JSON.parse((init as { body: string }).body)).toEqual({});
  });

  it("respects SLACK_API_BASE override for e2e mocks", async () => {
    process.env.SLACK_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await authTest({ botToken: "x" });

    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "http://127.0.0.1:9876/api/auth.test",
    );
  });
});

describe("authTest — verdict only, no leak", () => {
  it("returns { ok: true } and discards the success body (no team_id/user_id)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, team_id: "T_SECRET", user_id: "U_SECRET", url: "https://leak.slack.com" }),
        { status: 200 },
      ),
    );

    const result = await authTest({ botToken: "x" });

    expect(result).toEqual({ ok: true });
    // Defense: nothing from the body escapes through the result object.
    expect(JSON.stringify(result)).not.toContain("T_SECRET");
    expect(JSON.stringify(result)).not.toContain("U_SECRET");
    expect(JSON.stringify(result)).not.toContain("leak.slack.com");
  });
});

describe("authTest — failure surfaces SlackApiError", () => {
  it("throws SlackApiError with the logical code on ok:false (invalid_auth)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "invalid_auth" }), { status: 200 }),
    );
    await expect(authTest({ botToken: "x" })).rejects.toMatchObject({
      slackErrorCode: "invalid_auth",
    });
  });

  it("throws SlackApiError(token_revoked) when Slack returns it logically", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "token_revoked" }), { status: 200 }),
    );
    await expect(authTest({ botToken: "x" })).rejects.toMatchObject({
      slackErrorCode: "token_revoked",
    });
  });

  it("throws SlackApiError(http_401) on a bare non-2xx", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("unauthorized", { status: 401 }),
    );
    await expect(authTest({ botToken: "x" })).rejects.toMatchObject({
      slackErrorCode: "http_401",
    });
  });
});
