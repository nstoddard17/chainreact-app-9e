/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/usersList (Slack 2.3 Commit 4).
 */
import { usersList } from "@/integrations/slack/api/usersList";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.SLACK_API_BASE;
});

describe("usersList — request shape", () => {
  it("POSTs to /api/users.list with empty body when no options are passed", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, members: [] }), { status: 200 }),
    );

    await usersList({ botToken: "xoxb" });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://slack.com/api/users.list");
    expect(init?.method).toBe("POST");
    expect(JSON.parse((init as { body: string }).body)).toEqual({});
  });

  it("forwards optional limit + cursor as body fields", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, members: [] }), { status: 200 }),
    );

    await usersList({
      botToken: "x",
      limit: 50,
      cursor: "cursor-page-2",
    });

    expect(JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body)).toEqual({
      limit: 50,
      cursor: "cursor-page-2",
    });
  });

  it("respects SLACK_API_BASE override for e2e mocks", async () => {
    process.env.SLACK_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, members: [] }), { status: 200 }),
    );

    await usersList({ botToken: "x" });
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "http://127.0.0.1:9876/api/users.list",
    );
  });
});

describe("usersList — pagination", () => {
  it("renames Slack's `members` field to `users` in the result", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          members: [
            { id: "U1", name: "alice" },
            { id: "U2", name: "bob" },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await usersList({ botToken: "x" });
    expect(result.users).toEqual([
      { id: "U1", name: "alice" },
      { id: "U2", name: "bob" },
    ]);
  });

  it("surfaces nextCursor + hasMore=true when Slack returns response_metadata.next_cursor", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          members: [{ id: "U1" }],
          response_metadata: { next_cursor: "cursor-page-2" },
        }),
        { status: 200 },
      ),
    );

    const result = await usersList({ botToken: "x" });
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("cursor-page-2");
  });

  it("normalizes an empty-string cursor to null + hasMore=false (end of pagination)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          members: [],
          response_metadata: { next_cursor: "" },
        }),
        { status: 200 },
      ),
    );

    const result = await usersList({ botToken: "x" });
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("treats absent response_metadata as the final page", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, members: [] }), { status: 200 }),
    );

    const result = await usersList({ botToken: "x" });
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("treats missing members array as empty (defense in depth)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const result = await usersList({ botToken: "x" });
    expect(result.users).toEqual([]);
  });
});

describe("usersList — error preservation", () => {
  it("throws SlackApiError on logical failure (missing_scope)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, error: "missing_scope" }),
        { status: 200 },
      ),
    );
    await expect(usersList({ botToken: "x" })).rejects.toMatchObject({
      slackErrorCode: "missing_scope",
    });
  });

  it("throws SlackApiError with http_<status> on non-2xx (rate limit / token problem)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("rate limited", { status: 429 }),
    );
    await expect(usersList({ botToken: "x" })).rejects.toMatchObject({
      slackErrorCode: "http_429",
    });
  });
});
