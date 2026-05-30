/**
 * @jest-environment node
 *
 * Handler tests for integrations/slack/actions/files/downloadFile.ts
 * (Slack 2.4 Commit 4).
 *
 * Every external boundary is mocked:
 *   - Slack integration repo (token lookup)
 *   - Token decryption
 *   - filesInfo wrapper
 *   - global `fetch` (used to download bytes from Slack)
 *   - stageFileToStorage service
 */

const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

const mockFilesInfo = jest.fn();
jest.mock("@/integrations/slack/api/filesInfo", () => ({
  filesInfo: (...args: unknown[]) => mockFilesInfo(...args),
}));

const mockStageFileToStorage = jest.fn();
jest.mock("@/services/files/stageFileToStorage", () => ({
  stageFileToStorage: (...args: unknown[]) =>
    mockStageFileToStorage(...args),
}));

import { downloadFile } from "@/integrations/slack/actions/files/downloadFile";
import { SlackApiError } from "@/integrations/slack/api/errors";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const slackEvent: TriggerEvent = {
  provider: "slack",
  eventType: "slack.message.channel",
  eventId: "Ev1",
  occurredAt: "2026-05-12T00:00:00Z",
  providerAccountId: "T0001",
  payload: { channel: "C-trigger" },
};

const integration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "slack",
  providerAccountId: "T0001",
  displayName: "Acme",
  accessTokenEncrypted: "ENCRYPTED_TOKEN",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["files:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-12T00:00:00Z",
  updatedAt: "2026-05-12T00:00:00Z",
};

const SECRET_URL_PRIVATE_DOWNLOAD =
  "https://files.slack.com/files-pri/T0001-FABC/download/secret-tok123/report.pdf";

const slackFile = {
  id: "FABC123",
  name: "report.pdf",
  mimetype: "application/pdf",
  size: 4,
  url_private: "https://files.slack.com/files-pri/T0001-FABC/report.pdf",
  url_private_download: SECRET_URL_PRIVATE_DOWNLOAD,
  permalink: "https://acme.slack.com/files/U1/FABC/report.pdf",
  user: "U1",
};

const stagedRecord = {
  id: "wf-file-1",
  userId: "user-1",
  workflowId: "wf-1",
  runId: "run-1",
  nodeId: "n-download",
  storagePath: "user-1/wf-1/run-1/n-download/report.pdf",
  fileName: "report.pdf",
  mimeType: "application/pdf",
  sizeBytes: 4,
  expiresAt: "2026-05-13T00:00:00Z",
  metadata: { permalink: slackFile.permalink, slackUserId: "U1" },
  createdAt: "2026-05-12T00:00:00Z",
  updatedAt: "2026-05-12T00:00:00Z",
};

const stagedRef = {
  kind: "v2_storage" as const,
  name: "report.pdf",
  mimeType: "application/pdf",
  sizeBytes: 4,
  storagePath: "user-1/wf-1/run-1/n-download/report.pdf",
  provider: "slack",
  expiresAt: "2026-05-13T00:00:00Z",
  metadata: { permalink: slackFile.permalink, slackUserId: "U1" },
};

function makeInput(
  config: Record<string, unknown> = { fileId: "FABC123" },
  overrides: Partial<ActionHandlerInput> = {},
): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "n-download",
    config,
    triggerEvent: slackEvent,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockDecryptToken.mockReset();
  mockFilesInfo.mockReset();
  mockStageFileToStorage.mockReset();

  mockGetActiveForExecution.mockResolvedValue(integration);
  mockDecryptToken.mockReturnValue("xoxb-test-token");
  mockFilesInfo.mockResolvedValue({ file: slackFile, comments: [] });
  mockStageFileToStorage.mockResolvedValue({
    ref: stagedRef,
    record: stagedRecord,
  });
});

describe("download_file — happy path", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches bytes with the bot bearer, stages via stageFileToStorage, returns FileRef(v2_storage)", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchSpy = jest.fn(async () =>
      new Response(bytes, { status: 200 }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    const result = await downloadFile(makeInput());

    // 1. files.info called with the file id + bot token.
    expect(mockFilesInfo).toHaveBeenCalledWith({
      botToken: "xoxb-test-token",
      fileId: "FABC123",
    });

    // 2. Bytes fetched with Authorization: Bearer <bot token>.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchSpy as unknown as jest.Mock).mock.calls[0]!;
    expect(String(url)).toBe(SECRET_URL_PRIVATE_DOWNLOAD);
    expect(init?.method).toBe("GET");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer xoxb-test-token");

    // 3. stageFileToStorage called with name/mime/size + run scope +
    //    provider="slack" + metadata.
    expect(mockStageFileToStorage).toHaveBeenCalledWith({
      userId: "user-1",
      workflowId: "wf-1",
      runId: "run-1",
      nodeId: "n-download",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      bytes: expect.any(Uint8Array),
      sizeBytes: 4,
      provider: "slack",
      metadata: { permalink: slackFile.permalink, slackUserId: "U1" },
    });
    const calledBytes = mockStageFileToStorage.mock.calls[0]![0]
      .bytes as Uint8Array;
    expect(Array.from(calledBytes)).toEqual([1, 2, 3, 4]);

    // 4. Output is { file: FileRef(v2_storage), fileId, fileName, mimeType, sizeBytes }.
    expect(result.output).toEqual({
      file: stagedRef,
      fileId: "FABC123",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4,
    });

    // 5. No bytes / base64 / content / data in output (CLAUDE.md rule #1).
    const keys = Object.keys(result.output);
    expect(keys).not.toContain("content");
    expect(keys).not.toContain("bytes");
    expect(keys).not.toContain("base64");
    expect(keys).not.toContain("data");
  });

  it("falls back to url_private when url_private_download is absent", async () => {
    mockFilesInfo.mockResolvedValueOnce({
      file: { ...slackFile, url_private_download: undefined },
      comments: [],
    });
    const bytes = new Uint8Array([9]);
    const fetchSpy = jest.fn(async () =>
      new Response(bytes, { status: 200 }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await downloadFile(makeInput());

    const [url] = (fetchSpy as unknown as jest.Mock).mock.calls[0]!;
    expect(String(url)).toBe(slackFile.url_private);
  });
});

describe("download_file — error surface", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws SlackApiError('file_no_download_url') when both url_private_download and url_private are missing", async () => {
    mockFilesInfo.mockResolvedValueOnce({
      file: {
        ...slackFile,
        url_private: undefined,
        url_private_download: undefined,
      },
      comments: [],
    });
    await expect(downloadFile(makeInput())).rejects.toMatchObject({
      slackErrorCode: "file_no_download_url",
    });
    // No fetch attempted; no stage attempted.
    expect(mockStageFileToStorage).not.toHaveBeenCalled();
  });

  it("propagates filesInfo errors (file_not_found / file_deleted) verbatim", async () => {
    mockFilesInfo.mockRejectedValueOnce(new SlackApiError("file_not_found"));
    await expect(downloadFile(makeInput())).rejects.toMatchObject({
      slackErrorCode: "file_not_found",
    });

    mockFilesInfo.mockRejectedValueOnce(new SlackApiError("file_deleted"));
    await expect(downloadFile(makeInput())).rejects.toMatchObject({
      slackErrorCode: "file_deleted",
    });
  });

  it("throws SlackApiError('http_<status>') on non-2xx without leaking the URL or the bot token", async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response("forbidden body with token=secret", { status: 403 }),
    ) as unknown as typeof fetch;

    try {
      await downloadFile(makeInput());
      throw new Error("expected throw");
    } catch (err) {
      expect((err as SlackApiError).slackErrorCode).toBe("http_403");
      const msg = (err as Error).message;
      expect(msg).not.toContain("secret-tok123");
      expect(msg).not.toContain("files.slack.com");
      expect(msg).not.toContain("xoxb-test-token");
      expect(msg).not.toContain("token=secret");
    }
    expect(mockStageFileToStorage).not.toHaveBeenCalled();
  });

  it("throws SlackApiError('file_download_transport_error') on fetch rejection without leaking the URL or token", async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error(
        `ECONNRESET while GETing ${SECRET_URL_PRIVATE_DOWNLOAD} with token=xoxb-test-token`,
      );
    }) as unknown as typeof fetch;

    try {
      await downloadFile(makeInput());
      throw new Error("expected throw");
    } catch (err) {
      expect((err as SlackApiError).slackErrorCode).toBe(
        "file_download_transport_error",
      );
      const msg = (err as Error).message;
      expect(msg).not.toContain("secret-tok123");
      expect(msg).not.toContain(SECRET_URL_PRIVATE_DOWNLOAD);
      expect(msg).not.toContain("xoxb-test-token");
      expect(msg).not.toContain("ECONNRESET");
    }
  });

  it("propagates stageFileToStorage errors", async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response(new Uint8Array([1]), { status: 200 }),
    ) as unknown as typeof fetch;
    mockStageFileToStorage.mockRejectedValueOnce(
      new Error("workflow_files.insert failed: duplicate storage_path"),
    );
    await expect(downloadFile(makeInput())).rejects.toThrow(
      /duplicate storage_path/,
    );
  });

  it("throws a clear error when no Slack integration exists for the workspace", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(downloadFile(makeInput())).rejects.toThrow(
      /No active Slack integration found for workspace T0001/,
    );
    expect(mockFilesInfo).not.toHaveBeenCalled();
  });
});

describe("download_file — no leakage in logs", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("never logs the URL or the bot token across any console channel during a happy path", async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }),
    ) as unknown as typeof fetch;

    const calls: unknown[][] = [];
    const channels = ["log", "info", "warn", "error"] as const;
    const spies = channels.map((c) =>
      jest.spyOn(console, c).mockImplementation((...args: unknown[]) => {
        calls.push(args);
      }),
    );

    try {
      await downloadFile(makeInput());
      for (const args of calls) {
        for (const a of args) {
          const s = typeof a === "string" ? a : JSON.stringify(a);
          expect(s).not.toContain(SECRET_URL_PRIVATE_DOWNLOAD);
          expect(s).not.toContain("secret-tok123");
          expect(s).not.toContain("xoxb-test-token");
        }
      }
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});
