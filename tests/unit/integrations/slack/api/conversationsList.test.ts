/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/conversationsList (Slack 2.3 Commit 2).
 */
import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { conversationsList } from "@/integrations/slack/api/conversationsList";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.SLACK_API_BASE;
});

describe("conversationsList — request shape", () => {
  it("POSTs to /api/conversations.list with empty body when no options are passed", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, channels: [] }), { status: 200 }),
    );

    await conversationsList({ botToken: SLACK_TOKEN_PLACEHOLDER });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://slack.com/api/conversations.list");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${SLACK_TOKEN_PLACEHOLDER}`);
    expect(headers["content-type"]).toMatch(/application\/json/);
    expect(JSON.parse((init as { body: string }).body)).toEqual({});
  });

  it("forwards types + excludeArchived + limit + cursor as snake_case body fields", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, channels: [] }), { status: 200 }),
    );

    await conversationsList({
      botToken: "x",
      types: "public_channel,private_channel",
      excludeArchived: true,
      limit: 50,
      cursor: "cursor-page-2",
    });

    expect(JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body)).toEqual({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 50,
      cursor: "cursor-page-2",
    });
  });

  it("respects SLACK_API_BASE override for e2e mocks", async () => {
    process.env.SLACK_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, channels: [] }), { status: 200 }),
    );

    await conversationsList({ botToken: "xoxb" });

    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "http://127.0.0.1:9876/api/conversations.list",
    );
  });
});

describe("conversationsList — pagination", () => {
  it("surfaces nextCursor + hasMore=true when Slack returns response_metadata.next_cursor", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          channels: [{ id: "C1", name: "general" }],
          response_metadata: { next_cursor: "cursor-page-2" },
        }),
        { status: 200 },
      ),
    );

    const result = await conversationsList({ botToken: "x" });

    expect(result.channels).toEqual([{ id: "C1", name: "general" }]);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("cursor-page-2");
  });

  it("normalizes an empty-string cursor to null + hasMore=false (Slack convention at end of pagination)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          channels: [],
          response_metadata: { next_cursor: "" },
        }),
        { status: 200 },
      ),
    );

    const result = await conversationsList({ botToken: "x" });
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("treats absent response_metadata as the final page (hasMore=false, nextCursor=null)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, channels: [] }), { status: 200 }),
    );

    const result = await conversationsList({ botToken: "x" });
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("treats missing channels array as empty (defense in depth)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const result = await conversationsList({ botToken: "x" });
    expect(result.channels).toEqual([]);
  });
});

describe("conversationsList — error preservation", () => {
  it("throws SlackApiError with the Slack code on logical failure", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, error: "missing_scope" }),
        { status: 200 },
      ),
    );
    await expect(conversationsList({ botToken: "x" })).rejects.toMatchObject({
      slackErrorCode: "missing_scope",
    });
  });

  it("throws SlackApiError with http_<status> on non-2xx (rate limit / token problem)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("rate limited", { status: 429 }),
    );
    await expect(conversationsList({ botToken: "x" })).rejects.toMatchObject({
      slackErrorCode: "http_429",
    });
  });
});
