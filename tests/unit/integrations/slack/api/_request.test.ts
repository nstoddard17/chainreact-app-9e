/**
 * @jest-environment node
 *
 * Tests for `integrations/slack/api/_request.ts` — `slackApiRequest`.
 *
 * V2-READY-27: a non-2xx response that carries Slack's JSON envelope
 * ({ ok:false, error:"<code>" }) now surfaces the LOGICAL code (the truth) so
 * the option-source classifier can tell a revoked token (reconnect) from a
 * transient/scope failure. Non-JSON / bodyless non-2xx still falls back to
 * `http_<status>` (the pre-V2-READY-27 contract every wrapper test relies on).
 */

import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { slackApiRequest } from "@/integrations/slack/api/_request";
import { SlackApiError } from "@/integrations/slack/api/errors";

function mockFetchOnce(body: string | null, status: number): void {
  jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

async function call(): Promise<unknown> {
  return slackApiRequest("conversations.list", SLACK_TOKEN_PLACEHOLDER, {});
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("slackApiRequest — success", () => {
  it("returns the parsed body on HTTP 200 + ok:true", async () => {
    mockFetchOnce(JSON.stringify({ ok: true, channels: [] }), 200);
    await expect(call()).resolves.toEqual({ ok: true, channels: [] });
  });

  it("throws the logical code on HTTP 200 + ok:false (unchanged)", async () => {
    mockFetchOnce(JSON.stringify({ ok: false, error: "missing_scope" }), 200);
    await expect(call()).rejects.toMatchObject({ slackErrorCode: "missing_scope" });
  });
});

describe("slackApiRequest — non-2xx logical-code preservation (V2-READY-27)", () => {
  it.each([
    ["token_revoked", 401],
    ["invalid_auth", 401],
    ["account_inactive", 403],
    ["missing_scope", 403],
  ])(
    "surfaces the logical code '%s' when a %i body carries the Slack envelope",
    async (code, status) => {
      mockFetchOnce(JSON.stringify({ ok: false, error: code }), status);
      await expect(call()).rejects.toMatchObject({ slackErrorCode: code });
    },
  );

  it("never surfaces the raw body — only the logical code", async () => {
    mockFetchOnce(
      JSON.stringify({ ok: false, error: "token_revoked", team: "T0SECRET", needed: "x" }),
      401,
    );
    let thrown: unknown;
    try {
      await call();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(SlackApiError);
    expect((thrown as SlackApiError).slackErrorCode).toBe("token_revoked");
    expect((thrown as SlackApiError).slackErrorCode).not.toContain("T0SECRET");
  });
});

describe("slackApiRequest — non-2xx fallback to http_<status> (backward compatible)", () => {
  it.each([
    ["plain-text body", "rate limited", 429, "http_429"],
    ["plain-text auth body", "unauthorized", 401, "http_401"],
    ["plain-text forbidden body", "forbidden", 403, "http_403"],
    ["server error body", "server error", 500, "http_500"],
  ])("%s → %s", async (_label, body, status, expected) => {
    mockFetchOnce(body, status);
    await expect(call()).rejects.toMatchObject({ slackErrorCode: expected });
  });

  it("falls back when the non-2xx JSON has no error string", async () => {
    mockFetchOnce(JSON.stringify({ ok: false }), 403);
    await expect(call()).rejects.toMatchObject({ slackErrorCode: "http_403" });
  });

  it("falls back when the non-2xx body is empty", async () => {
    mockFetchOnce("", 401);
    await expect(call()).rejects.toMatchObject({ slackErrorCode: "http_401" });
  });
});
