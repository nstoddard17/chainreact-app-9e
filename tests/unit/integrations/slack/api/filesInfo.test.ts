/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/filesInfo (Slack 2.4 Commit 2).
 */
import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { filesInfo } from "@/integrations/slack/api/filesInfo";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.SLACK_API_BASE;
});

const fileRecord = {
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
  user: "U1",
  is_public: false,
  is_external: false,
  num_comments: 0,
};

describe("filesInfo — request shape", () => {
  it("POSTs form-encoded file id — Slack rejects a JSON body here with invalid_arguments", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, file: fileRecord }),
        { status: 200 },
      ),
    );

    await filesInfo({ botToken: SLACK_TOKEN_PLACEHOLDER, fileId: "F0001" });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://slack.com/api/files.info");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${SLACK_TOKEN_PLACEHOLDER}`);
    // form-encoded transport: files.info rejects application/json.
    expect(headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect((init as { body: string }).body).toBe("file=F0001");
  });

  it("forwards count when supplied (used by get_file_info's includeComments) — form-encoded", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, file: fileRecord, comments: [] }),
        { status: 200 },
      ),
    );
    await filesInfo({ botToken: "x", fileId: "F0001", count: 100 });
    const [, init] = fetchSpy.mock.calls[0]!;
    expect((init as { body: string }).body).toBe("file=F0001&count=100");
  });

  it("respects SLACK_API_BASE override for e2e mocks", async () => {
    process.env.SLACK_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, file: fileRecord }),
        { status: 200 },
      ),
    );
    await filesInfo({ botToken: "x", fileId: "F0001" });
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "http://127.0.0.1:9876/api/files.info",
    );
  });
});

describe("filesInfo — happy path", () => {
  it("returns Slack's file object verbatim (snake_case preserved)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, file: fileRecord }),
        { status: 200 },
      ),
    );
    const result = await filesInfo({ botToken: "x", fileId: "F0001" });
    expect(result.file).toEqual(fileRecord);
    expect(result.comments).toEqual([]);
  });

  it("returns comments verbatim when Slack includes them", async () => {
    const comments = [
      { id: "Fc1", user: "U1", comment: "hi", timestamp: "1730000000.000100" },
      { id: "Fc2", user: "U2", comment: "yo", timestamp: "1730000001.000200" },
    ];
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, file: fileRecord, comments }),
        { status: 200 },
      ),
    );
    const result = await filesInfo({
      botToken: "x",
      fileId: "F0001",
      count: 100,
    });
    expect(result.comments).toEqual(comments);
  });

  it("defaults comments to [] when Slack omits the field", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, file: fileRecord }),
        { status: 200 },
      ),
    );
    const result = await filesInfo({ botToken: "x", fileId: "F0001" });
    expect(result.comments).toEqual([]);
  });
});

describe("filesInfo — error preservation", () => {
  it("throws SlackApiError with the Slack code on logical failure (file_not_found)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, error: "file_not_found" }),
        { status: 200 },
      ),
    );
    await expect(
      filesInfo({ botToken: "x", fileId: "F-missing" }),
    ).rejects.toMatchObject({ slackErrorCode: "file_not_found" });
  });

  it("throws SlackApiError with the Slack code on file_deleted", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, error: "file_deleted" }),
        { status: 200 },
      ),
    );
    await expect(
      filesInfo({ botToken: "x", fileId: "F0001" }),
    ).rejects.toMatchObject({ slackErrorCode: "file_deleted" });
  });

  it("throws SlackApiError with http_<status> on non-2xx", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("forbidden", { status: 403 }),
    );
    await expect(
      filesInfo({ botToken: "x", fileId: "F0001" }),
    ).rejects.toMatchObject({ slackErrorCode: "http_403" });
  });

  it("throws SlackApiError('file_not_found') when Slack returns ok=true but omits the file field (defense in depth)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await expect(
      filesInfo({ botToken: "x", fileId: "F0001" }),
    ).rejects.toMatchObject({ slackErrorCode: "file_not_found" });
  });
});
