/**
 * @jest-environment node
 *
 * Handler tests for integrations/slack/actions/files/uploadFile.ts
 * (Slack 2.4 Commit 3).
 *
 * Every external boundary is mocked:
 *   - Slack integration repo (token lookup)
 *   - Token decryption
 *   - Slack file API wrappers (filesGetUploadURLExternal,
 *     uploadBytesToSlack, filesCompleteUploadExternal)
 *   - The service-role Supabase client (used only by the v2_storage
 *     fetch path's storage adapter)
 *   - The global `fetch` (used by the signed_url fetch path inside
 *     core/files/fetchFileBytes)
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

const mockFilesGetUploadURLExternal = jest.fn();
jest.mock("@/integrations/slack/api/filesGetUploadURLExternal", () => ({
  filesGetUploadURLExternal: (...args: unknown[]) =>
    mockFilesGetUploadURLExternal(...args),
}));

const mockUploadBytesToSlack = jest.fn();
jest.mock("@/integrations/slack/api/_uploadBytesToSlack", () => ({
  uploadBytesToSlack: (...args: unknown[]) =>
    mockUploadBytesToSlack(...args),
}));

const mockFilesCompleteUploadExternal = jest.fn();
jest.mock("@/integrations/slack/api/filesCompleteUploadExternal", () => ({
  filesCompleteUploadExternal: (...args: unknown[]) =>
    mockFilesCompleteUploadExternal(...args),
}));

// Service-role client mock — only the v2_storage path reaches it.
const mockStorageDownload = jest.fn();
const mockSupabaseClient = {
  storage: {
    from: jest.fn(() => ({ download: mockStorageDownload })),
  },
};
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockSupabaseClient),
}));

import { SlackApiError } from "@/integrations/slack/api/errors";
import {
  SlackUploadConfigError,
  uploadFile,
} from "@/integrations/slack/actions/files/uploadFile";
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
  scopes: ["files:read", "files:write"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-12T00:00:00Z",
  updatedAt: "2026-05-12T00:00:00Z",
};

const slackFileResponse = {
  id: "F-NEW",
  name: "report.pdf",
  mimetype: "application/pdf",
  size: 4,
  url_private: "https://files.slack.com/files-pri/T0001-F-NEW/report.pdf",
  permalink: "https://acme.slack.com/files/U1/F-NEW/report.pdf",
  channels: ["C12345"],
};

function makeInput(
  config: Record<string, unknown>,
  overrides: Partial<ActionHandlerInput> = {},
): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "n-upload",
    config,
    triggerEvent: slackEvent,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockDecryptToken.mockReset();
  mockFilesGetUploadURLExternal.mockReset();
  mockUploadBytesToSlack.mockReset();
  mockFilesCompleteUploadExternal.mockReset();
  mockStorageDownload.mockReset();
  mockSupabaseClient.storage.from.mockClear();

  mockGetActiveForExecution.mockResolvedValue(integration);
  mockDecryptToken.mockReturnValue("xoxb-test-token");
  mockFilesGetUploadURLExternal.mockResolvedValue({
    uploadUrl: "https://files.slack.com/upload/v1/secret-abc",
    fileId: "F-NEW",
  });
  mockUploadBytesToSlack.mockResolvedValue(undefined);
  mockFilesCompleteUploadExternal.mockResolvedValue({
    files: [slackFileResponse],
  });
});

describe("upload_file — provider_url rejection", () => {
  it("throws SlackUploadConfigError BEFORE any Slack API call when file.kind === 'provider_url'", async () => {
    expect.assertions(7);
    try {
      await uploadFile(
        makeInput({
          channel: "C12345",
          file: {
            kind: "provider_url",
            name: "shared.pdf",
            mimeType: "application/pdf",
            url: "https://files.slack.com/files-pri/T1-F1/shared.pdf",
            provider: "slack",
          },
        }),
      );
    } catch (err) {
      expect(err).toBeInstanceOf(SlackUploadConfigError);
      const cfgErr = err as SlackUploadConfigError;
      expect(cfgErr.code).toBe("provider_url_unsupported");
      expect(cfgErr.message).toMatch(/provider_url/);
      expect(cfgErr.hint).toMatch(/v2_storage|signed_url/);
      expect(mockFilesGetUploadURLExternal).not.toHaveBeenCalled();
      expect(mockUploadBytesToSlack).not.toHaveBeenCalled();
      expect(mockFilesCompleteUploadExternal).not.toHaveBeenCalled();
    }
  });
});

describe("upload_file — v2_storage happy path", () => {
  it("downloads bytes from workflow-files, runs the Slack 3-step upload, returns FileRef(provider_url)", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    mockStorageDownload.mockResolvedValue({
      data: {
        arrayBuffer: async () =>
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
      },
      error: null,
    });

    const result = await uploadFile(
      makeInput({
        channel: "C12345",
        file: {
          kind: "v2_storage",
          name: "report.pdf",
          mimeType: "application/pdf",
          storagePath: "user-1/wf-1/run-1/n-upload/report.pdf",
        },
        title: "Q1 Report",
        initialComment: "Here's the report",
        threadTs: "1730000000.000123",
      }),
    );

    // 1. Storage adapter called against workflow-files bucket.
    expect(mockSupabaseClient.storage.from).toHaveBeenCalledWith(
      "workflow-files",
    );
    expect(mockStorageDownload).toHaveBeenCalledWith(
      "user-1/wf-1/run-1/n-upload/report.pdf",
    );

    // 2. Slack URL request — bot token + filename + actual byte length.
    expect(mockFilesGetUploadURLExternal).toHaveBeenCalledWith({
      botToken: "xoxb-test-token",
      filename: "report.pdf",
      length: 4,
    });

    // 3. Bytes POSTed to the Slack-issued URL with the FileRef mime
    //    type. The Uint8Array forwards verbatim.
    expect(mockUploadBytesToSlack).toHaveBeenCalledWith({
      uploadUrl: "https://files.slack.com/upload/v1/secret-abc",
      bytes: expect.any(Uint8Array),
      contentType: "application/pdf",
    });
    const calledBytes = mockUploadBytesToSlack.mock.calls[0]![0]
      .bytes as Uint8Array;
    expect(Array.from(calledBytes)).toEqual([1, 2, 3, 4]);

    // 4. Complete upload — channel + title + comment + thread_ts.
    expect(mockFilesCompleteUploadExternal).toHaveBeenCalledWith({
      botToken: "xoxb-test-token",
      files: [{ id: "F-NEW", title: "Q1 Report" }],
      channelId: "C12345",
      initialComment: "Here's the report",
      threadTs: "1730000000.000123",
    });

    // 5. Output — FileRef(provider_url) built via the builder.
    expect(result.output).toMatchObject({
      file: {
        kind: "provider_url",
        name: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4,
        provider: "slack",
        providerFileId: "F-NEW",
        url: slackFileResponse.url_private,
        metadata: { permalink: slackFileResponse.permalink },
      },
      fileId: "F-NEW",
      permalink: slackFileResponse.permalink,
      channelIds: ["C12345"],
    });

    // 6. Output MUST NOT carry bytes / base64 / content (CLAUDE.md rule #1).
    const outKeys = Object.keys(result.output);
    expect(outKeys).not.toContain("content");
    expect(outKeys).not.toContain("bytes");
    expect(outKeys).not.toContain("base64");
    expect(outKeys).not.toContain("data");
  });

  it("falls title back to file.name when caller omits title", async () => {
    const bytes = new Uint8Array([9, 9, 9]);
    mockStorageDownload.mockResolvedValue({
      data: {
        arrayBuffer: async () =>
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
      },
      error: null,
    });

    await uploadFile(
      makeInput({
        channel: "C12345",
        file: {
          kind: "v2_storage",
          name: "notes.txt",
          mimeType: "text/plain",
          storagePath: "user-1/wf-1/run-1/n-upload/notes.txt",
        },
      }),
    );

    expect(mockFilesCompleteUploadExternal).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [{ id: "F-NEW", title: "notes.txt" }],
      }),
    );
  });
});

describe("upload_file — signed_url happy path", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches bytes from the signed URL (no storage adapter), runs the Slack 3-step upload", async () => {
    const bytes = new Uint8Array([10, 20, 30]);
    globalThis.fetch = jest.fn(async () =>
      new Response(bytes, { status: 200 }),
    ) as unknown as typeof fetch;

    const result = await uploadFile(
      makeInput({
        channel: "C12345",
        file: {
          kind: "signed_url",
          name: "snapshot.bin",
          mimeType: "application/octet-stream",
          url: "https://signed.example.com/download/abc",
        },
      }),
    );

    // Storage adapter must NOT be consulted for signed_url.
    expect(mockStorageDownload).not.toHaveBeenCalled();
    expect(mockSupabaseClient.storage.from).not.toHaveBeenCalled();

    expect(mockFilesGetUploadURLExternal).toHaveBeenCalledWith({
      botToken: "xoxb-test-token",
      filename: "snapshot.bin",
      length: 3,
    });
    expect(mockUploadBytesToSlack).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadUrl: "https://files.slack.com/upload/v1/secret-abc",
        contentType: "application/octet-stream",
      }),
    );
    expect(result.output.file).toMatchObject({
      kind: "provider_url",
      provider: "slack",
      providerFileId: "F-NEW",
    });
  });
});

describe("upload_file — size guidance (advisory)", () => {
  it("warns when actual bytes exceed Slack's 25 MB guidance but does NOT reject", async () => {
    const big = new Uint8Array(26 * 1024 * 1024); // 26 MB > 25 MB Slack guidance.
    mockStorageDownload.mockResolvedValue({
      data: {
        arrayBuffer: async () =>
          big.buffer.slice(big.byteOffset, big.byteOffset + big.byteLength),
      },
      error: null,
    });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await uploadFile(
        makeInput({
          channel: "C12345",
          file: {
            kind: "v2_storage",
            name: "big.bin",
            mimeType: "application/octet-stream",
            storagePath: "user-1/wf-1/run-1/n-upload/big.bin",
          },
        }),
      );
      expect(result.output.fileId).toBe("F-NEW");
      expect(warnSpy).toHaveBeenCalled();
      const payloads = warnSpy.mock.calls.flat();
      const hit = payloads.find(
        (a) =>
          typeof a === "string" && a.includes("size_exceeds_guidance"),
      );
      expect(hit).toBeDefined();
      // Slack API path still proceeded — advisory, not enforced.
      expect(mockFilesGetUploadURLExternal).toHaveBeenCalled();
      expect(mockUploadBytesToSlack).toHaveBeenCalled();
      expect(mockFilesCompleteUploadExternal).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("upload_file — Slack API error propagation", () => {
  beforeEach(() => {
    const bytes = new Uint8Array([1, 2, 3]);
    mockStorageDownload.mockResolvedValue({
      data: {
        arrayBuffer: async () =>
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
      },
      error: null,
    });
  });

  function v2StorageInput(extra: Record<string, unknown> = {}) {
    return makeInput({
      channel: "C12345",
      file: {
        kind: "v2_storage",
        name: "x.pdf",
        mimeType: "application/pdf",
        storagePath: "user-1/wf-1/run-1/n-upload/x.pdf",
      },
      ...extra,
    });
  }

  it("propagates getUploadURLExternal failures (file_uploads_disabled) and never reaches step 2", async () => {
    mockFilesGetUploadURLExternal.mockRejectedValueOnce(
      new SlackApiError("file_uploads_disabled"),
    );
    await expect(uploadFile(v2StorageInput())).rejects.toMatchObject({
      slackErrorCode: "file_uploads_disabled",
    });
    expect(mockUploadBytesToSlack).not.toHaveBeenCalled();
    expect(mockFilesCompleteUploadExternal).not.toHaveBeenCalled();
  });

  it("propagates uploadBytesToSlack failures (upload_failed) and never reaches step 3", async () => {
    mockUploadBytesToSlack.mockRejectedValueOnce(
      new SlackApiError("upload_failed"),
    );
    await expect(uploadFile(v2StorageInput())).rejects.toMatchObject({
      slackErrorCode: "upload_failed",
    });
    expect(mockFilesCompleteUploadExternal).not.toHaveBeenCalled();
  });

  it("propagates completeUploadExternal failures (channel_not_found)", async () => {
    mockFilesCompleteUploadExternal.mockRejectedValueOnce(
      new SlackApiError("channel_not_found"),
    );
    await expect(uploadFile(v2StorageInput())).rejects.toMatchObject({
      slackErrorCode: "channel_not_found",
    });
  });
});

describe("upload_file — token / integration lookup", () => {
  it("throws a clear error when no Slack integration exists for the user/workspace", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const bytes = new Uint8Array([1, 2, 3]);
    mockStorageDownload.mockResolvedValue({
      data: {
        arrayBuffer: async () =>
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
      },
      error: null,
    });
    await expect(
      uploadFile(
        makeInput({
          channel: "C12345",
          file: {
            kind: "v2_storage",
            name: "x.pdf",
            mimeType: "application/pdf",
            storagePath: "user-1/wf-1/run-1/n-upload/x.pdf",
          },
        }),
      ),
    ).rejects.toThrow(/No active Slack integration found for workspace T0001/);
    expect(mockFilesGetUploadURLExternal).not.toHaveBeenCalled();
  });

  it("uses the trigger event's accountId (Slack team_id) for the integration lookup", async () => {
    const bytes = new Uint8Array([1]);
    mockStorageDownload.mockResolvedValue({
      data: {
        arrayBuffer: async () =>
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
      },
      error: null,
    });
    await uploadFile(
      makeInput({
        channel: "C12345",
        file: {
          kind: "v2_storage",
          name: "x.pdf",
          mimeType: "application/pdf",
          storagePath: "user-1/wf-1/run-1/n-upload/x.pdf",
        },
      }),
    );
    expect(mockGetActiveForExecution).toHaveBeenCalledWith(
      "acct-user-1",
      "slack",
      "T0001",
    );
  });
});

describe("upload_file — no leakage in errors / logs", () => {
  it("never logs the bytes payload or the Slack-issued upload URL across any console channel", async () => {
    const sentinel = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    mockStorageDownload.mockResolvedValue({
      data: {
        arrayBuffer: async () =>
          sentinel.buffer.slice(
            sentinel.byteOffset,
            sentinel.byteOffset + sentinel.byteLength,
          ),
      },
      error: null,
    });

    const calls: unknown[][] = [];
    const channels = ["log", "info", "warn", "error"] as const;
    const spies = channels.map((c) =>
      jest.spyOn(console, c).mockImplementation((...args: unknown[]) => {
        calls.push(args);
      }),
    );

    try {
      await uploadFile(
        makeInput({
          channel: "C12345",
          file: {
            kind: "v2_storage",
            name: "x.bin",
            mimeType: "application/octet-stream",
            storagePath: "user-1/wf-1/run-1/n-upload/x.bin",
          },
        }),
      );
      for (const args of calls) {
        for (const a of args) {
          const s = typeof a === "string" ? a : JSON.stringify(a);
          expect(s).not.toMatch(/deadbeef/i);
          expect(s).not.toContain(
            "https://files.slack.com/upload/v1/secret-abc",
          );
          expect(s).not.toContain("secret-abc");
        }
      }
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});
