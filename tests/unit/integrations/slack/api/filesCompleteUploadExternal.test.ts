/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/filesCompleteUploadExternal (Slack 2.4 Commit 2).
 */
import { filesCompleteUploadExternal } from "@/integrations/slack/api/filesCompleteUploadExternal";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.SLACK_API_BASE;
});

const slackFileRecord = {
  id: "F0001",
  name: "report.pdf",
  mimetype: "application/pdf",
  filetype: "pdf",
  size: 4096,
  url_private: "https://files.slack.com/files-pri/T1-F0001/report.pdf",
  url_private_download:
    "https://files.slack.com/files-pri/T1-F0001/download/report.pdf",
  permalink: "https://example.slack.com/files/U1/F0001/report.pdf",
  channels: ["C1"],
};

describe("filesCompleteUploadExternal — request shape", () => {
  it("POSTs to /api/files.completeUploadExternal with files + channel_id", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, files: [slackFileRecord] }),
        { status: 200 },
      ),
    );

    await filesCompleteUploadExternal({
      botToken: "xoxb-test",
      files: [{ id: "F0001", title: "Q1 Report" }],
      channelId: "C1",
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://slack.com/api/files.completeUploadExternal",
    );
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer xoxb-test");
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      files: [{ id: "F0001", title: "Q1 Report" }],
      channel_id: "C1",
    });
  });

  it("omits title from the per-file entry when not supplied", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, files: [slackFileRecord] }),
        { status: 200 },
      ),
    );
    await filesCompleteUploadExternal({
      botToken: "x",
      files: [{ id: "F0001" }],
      channelId: "C1",
    });
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      files: [{ id: "F0001" }],
      channel_id: "C1",
    });
  });

  it("forwards initial_comment and thread_ts when supplied", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, files: [slackFileRecord] }),
        { status: 200 },
      ),
    );
    await filesCompleteUploadExternal({
      botToken: "x",
      files: [{ id: "F0001" }],
      channelId: "C1",
      initialComment: "Here's the report",
      threadTs: "1730000000.000123",
    });
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      files: [{ id: "F0001" }],
      channel_id: "C1",
      initial_comment: "Here's the report",
      thread_ts: "1730000000.000123",
    });
  });

  it("respects SLACK_API_BASE override for e2e mocks", async () => {
    process.env.SLACK_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, files: [slackFileRecord] }),
        { status: 200 },
      ),
    );
    await filesCompleteUploadExternal({
      botToken: "x",
      files: [{ id: "F1" }],
      channelId: "C1",
    });
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "http://127.0.0.1:9876/api/files.completeUploadExternal",
    );
  });
});

describe("filesCompleteUploadExternal — happy path", () => {
  it("returns the Slack files array verbatim (snake_case keys preserved for upload_file to project into FileRef)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, files: [slackFileRecord] }),
        { status: 200 },
      ),
    );
    const result = await filesCompleteUploadExternal({
      botToken: "x",
      files: [{ id: "F0001" }],
      channelId: "C1",
    });
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toEqual(slackFileRecord);
  });
});

describe("filesCompleteUploadExternal — defensive + error preservation", () => {
  it("throws SlackApiError('no_file') without calling Slack when files array is empty", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    await expect(
      filesCompleteUploadExternal({
        botToken: "x",
        files: [],
        channelId: "C1",
      }),
    ).rejects.toMatchObject({ slackErrorCode: "no_file" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws SlackApiError with the Slack code on logical failure (channel_not_found)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, error: "channel_not_found" }),
        { status: 200 },
      ),
    );
    await expect(
      filesCompleteUploadExternal({
        botToken: "x",
        files: [{ id: "F1" }],
        channelId: "C-missing",
      }),
    ).rejects.toMatchObject({ slackErrorCode: "channel_not_found" });
  });

  it("throws SlackApiError with http_<status> on non-2xx (429 rate limit)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("rate limited", { status: 429 }),
    );
    await expect(
      filesCompleteUploadExternal({
        botToken: "x",
        files: [{ id: "F1" }],
        channelId: "C1",
      }),
    ).rejects.toMatchObject({ slackErrorCode: "http_429" });
  });

  it("throws SlackApiError('malformed_response') when Slack returns ok=true with empty files (defense in depth)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, files: [] }), { status: 200 }),
    );
    await expect(
      filesCompleteUploadExternal({
        botToken: "x",
        files: [{ id: "F1" }],
        channelId: "C1",
      }),
    ).rejects.toMatchObject({ slackErrorCode: "malformed_response" });
  });
});
