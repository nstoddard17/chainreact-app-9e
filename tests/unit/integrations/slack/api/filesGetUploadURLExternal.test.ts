/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/filesGetUploadURLExternal (Slack 2.4 Commit 2).
 */
import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { filesGetUploadURLExternal } from "@/integrations/slack/api/filesGetUploadURLExternal";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.SLACK_API_BASE;
});

describe("filesGetUploadURLExternal — request shape", () => {
  it("POSTs to /api/files.getUploadURLExternal with filename + length (length stringified per Slack docs)", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          upload_url: "https://files.slack.com/upload/v1/abc",
          file_id: "F0001",
        }),
        { status: 200 },
      ),
    );

    await filesGetUploadURLExternal({
      botToken: SLACK_TOKEN_PLACEHOLDER,
      filename: "report.pdf",
      length: 4096,
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://slack.com/api/files.getUploadURLExternal",
    );
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${SLACK_TOKEN_PLACEHOLDER}`);
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      filename: "report.pdf",
      length: "4096",
    });
  });

  it("forwards snippetType as snippet_type when supplied", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          upload_url: "https://x.test/u",
          file_id: "F1",
        }),
        { status: 200 },
      ),
    );
    await filesGetUploadURLExternal({
      botToken: "x",
      filename: "snippet.md",
      length: 12,
      snippetType: "markdown",
    });
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      filename: "snippet.md",
      length: "12",
      snippet_type: "markdown",
    });
  });

  it("respects SLACK_API_BASE override for e2e mocks", async () => {
    process.env.SLACK_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          upload_url: "http://127.0.0.1:9876/upload/abc",
          file_id: "F1",
        }),
        { status: 200 },
      ),
    );
    await filesGetUploadURLExternal({
      botToken: "x",
      filename: "x.txt",
      length: 1,
    });
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "http://127.0.0.1:9876/api/files.getUploadURLExternal",
    );
  });
});

describe("filesGetUploadURLExternal — happy path", () => {
  it("returns uploadUrl + fileId from the Slack response", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          upload_url: "https://files.slack.com/upload/v1/xyz",
          file_id: "F0042",
        }),
        { status: 200 },
      ),
    );
    const result = await filesGetUploadURLExternal({
      botToken: "x",
      filename: "report.pdf",
      length: 4096,
    });
    expect(result).toEqual({
      uploadUrl: "https://files.slack.com/upload/v1/xyz",
      fileId: "F0042",
    });
  });
});

describe("filesGetUploadURLExternal — error preservation", () => {
  it("throws SlackApiError with the Slack code on logical failure (file_uploads_disabled)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, error: "file_uploads_disabled" }),
        { status: 200 },
      ),
    );
    await expect(
      filesGetUploadURLExternal({
        botToken: "x",
        filename: "x.txt",
        length: 1,
      }),
    ).rejects.toMatchObject({ slackErrorCode: "file_uploads_disabled" });
  });

  it("throws SlackApiError with http_<status> on non-2xx (401 missing scope)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("unauthorized", { status: 401 }),
    );
    await expect(
      filesGetUploadURLExternal({
        botToken: "x",
        filename: "x.txt",
        length: 1,
      }),
    ).rejects.toMatchObject({ slackErrorCode: "http_401" });
  });

  it("throws SlackApiError(malformed_response) when Slack returns ok=true but omits upload_url or file_id (defense in depth)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, file_id: "F1" }),
        { status: 200 },
      ),
    );
    await expect(
      filesGetUploadURLExternal({
        botToken: "x",
        filename: "x.txt",
        length: 1,
      }),
    ).rejects.toMatchObject({ slackErrorCode: "malformed_response" });
  });
});
