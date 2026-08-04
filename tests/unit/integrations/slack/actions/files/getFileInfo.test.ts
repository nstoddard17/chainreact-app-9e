/**
 * @jest-environment node
 *
 * Handler tests for integrations/slack/actions/files/getFileInfo.ts
 * (Slack 2.4 Commit 4).
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

import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { getFileInfo } from "@/integrations/slack/actions/files/getFileInfo";
import { SlackApiError } from "@/integrations/slack/api/errors";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import { SlackGetFileInfoConfigSchema } from "@/integrations/slack/actions/files/getFileInfo.schema";

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

// Slack's `created` is unix seconds.
const slackFile = {
  id: "FABC123",
  name: "report.pdf",
  title: "Q1 Report",
  mimetype: "application/pdf",
  filetype: "pdf",
  size: 4096,
  url_private: "https://files.slack.com/files-pri/T0001-FABC/report.pdf",
  url_private_download:
    "https://files.slack.com/files-pri/T0001-FABC/download/report.pdf",
  permalink: "https://acme.slack.com/files/U1/FABC/report.pdf",
  permalink_public: "https://slack-files.com/T0001-FABC-aaaa",
  user: "U1",
  channels: ["C1", "C2"],
  is_public: false,
  is_external: false,
  created: 1762848000, // 2025-11-11T08:00:00Z
  num_comments: 2,
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
    nodeId: "n-info",
    config,
    triggerEvent: slackEvent,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockDecryptToken.mockReset();
  mockFilesInfo.mockReset();

  mockGetActiveForExecution.mockResolvedValue(integration);
  mockDecryptToken.mockReturnValue(SLACK_TOKEN_PLACEHOLDER);
  mockFilesInfo.mockResolvedValue({ file: slackFile, comments: [] });
});

describe("get_file_info — happy path", () => {
  it("calls filesInfo with the file id (no count when includeComments omitted) and returns FileRef(provider_url) + projected metadata", async () => {
    const result = await getFileInfo(makeInput());

    expect(mockFilesInfo).toHaveBeenCalledWith({
      botToken: SLACK_TOKEN_PLACEHOLDER,
      fileId: "FABC123",
    });

    expect(result.output).toMatchObject({
      file: {
        kind: "provider_url",
        name: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4096,
        url: slackFile.url_private,
        provider: "slack",
        providerFileId: "FABC123",
        metadata: { permalink: slackFile.permalink },
      },
      fileId: "FABC123",
      fileName: "report.pdf",
      title: "Q1 Report",
      fileType: "pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      permalink: slackFile.permalink,
      permalinkPublic: slackFile.permalink_public,
      uploaderId: "U1",
      channels: ["C1", "C2"],
      isPublic: false,
      isExternal: false,
      // Slack epoch 1762848000 → 2025-11-11T08:00:00.000Z
      createdAt: "2025-11-11T08:00:00.000Z",
      commentsCount: 2,
      comments: [],
    });

    // No bytes / base64 / content / data anywhere.
    const keys = Object.keys(result.output);
    expect(keys).not.toContain("content");
    expect(keys).not.toContain("bytes");
    expect(keys).not.toContain("base64");
    expect(keys).not.toContain("data");
  });

  it("forwards count=100 to filesInfo when includeComments=true and surfaces returned comments", async () => {
    const comments = [
      { id: "Fc1", user: "U1", comment: "hi", timestamp: "1.0" },
      { id: "Fc2", user: "U2", comment: "yo", timestamp: "2.0" },
    ];
    mockFilesInfo.mockResolvedValueOnce({ file: slackFile, comments });

    const result = await getFileInfo(
      makeInput({ fileId: "FABC123", includeComments: true }),
    );

    expect(mockFilesInfo).toHaveBeenCalledWith({
      botToken: SLACK_TOKEN_PLACEHOLDER,
      fileId: "FABC123",
      count: 100,
    });
    expect(result.output.comments).toEqual(comments);
  });

  it("returns comments=[] when includeComments=false (even if Slack happened to include some)", async () => {
    const comments = [
      { id: "Fc1", user: "U1", comment: "hi", timestamp: "1.0" },
    ];
    mockFilesInfo.mockResolvedValueOnce({ file: slackFile, comments });

    const result = await getFileInfo(
      makeInput({ fileId: "FABC123", includeComments: false }),
    );
    expect(result.output.comments).toEqual([]);
  });
});

describe("get_file_info — Slack API + defense", () => {
  it("propagates filesInfo file_not_found", async () => {
    mockFilesInfo.mockRejectedValueOnce(new SlackApiError("file_not_found"));
    await expect(getFileInfo(makeInput())).rejects.toMatchObject({
      slackErrorCode: "file_not_found",
    });
  });

  it("propagates filesInfo file_deleted", async () => {
    mockFilesInfo.mockRejectedValueOnce(new SlackApiError("file_deleted"));
    await expect(getFileInfo(makeInput())).rejects.toMatchObject({
      slackErrorCode: "file_deleted",
    });
  });

  it("throws SlackApiError('malformed_response') when Slack returns a file object missing name/mimetype/url_private", async () => {
    mockFilesInfo.mockResolvedValueOnce({
      file: { id: "FABC123" },
      comments: [],
    });
    await expect(getFileInfo(makeInput())).rejects.toMatchObject({
      slackErrorCode: "malformed_response",
    });
  });

  it("throws a clear error when no Slack integration exists for the workspace", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(getFileInfo(makeInput())).rejects.toThrow(
      /No active Slack integration found for workspace T0001/,
    );
    expect(mockFilesInfo).not.toHaveBeenCalled();
  });
});

describe("get_file_info — edge metadata", () => {
  it("projects null for fields Slack omitted (title, permalinkPublic, createdAt, uploader)", async () => {
    mockFilesInfo.mockResolvedValueOnce({
      file: {
        id: "FABC123",
        name: "x.txt",
        mimetype: "text/plain",
        url_private: "https://files.slack.com/files-pri/T1-FABC/x.txt",
      },
      comments: [],
    });
    const result = await getFileInfo(makeInput());
    expect(result.output).toMatchObject({
      fileName: "x.txt",
      title: null,
      fileType: null,
      sizeBytes: null,
      permalink: null,
      permalinkPublic: null,
      uploaderId: null,
      channels: [],
      isPublic: false,
      isExternal: false,
      createdAt: null,
      commentsCount: 0,
    });
    // FileRef built without `metadata.permalink` (since permalink was absent).
    expect(
      (result.output.file as { metadata?: unknown }).metadata,
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling getFileInfo.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Schema tests for integrations/slack/actions/files/getFileInfo.schema.ts
// (Slack 2.4 Commit 4).
// ---------------------------------------------------------------------------

describe("SlackGetFileInfoConfigSchema — happy path", () => {
  it("accepts a valid F-prefixed file id", () => {
    expect(
      SlackGetFileInfoConfigSchema.safeParse({ fileId: "F12345" }).success,
    ).toBe(true);
  });

  it("accepts includeComments=true", () => {
    expect(
      SlackGetFileInfoConfigSchema.safeParse({
        fileId: "F12345",
        includeComments: true,
      }).success,
    ).toBe(true);
  });

  it("accepts includeComments=false", () => {
    expect(
      SlackGetFileInfoConfigSchema.safeParse({
        fileId: "F12345",
        includeComments: false,
      }).success,
    ).toBe(true);
  });
});

describe("SlackGetFileInfoConfigSchema — required + format", () => {
  it("rejects when fileId is missing", () => {
    expect(
      SlackGetFileInfoConfigSchema.safeParse({ includeComments: true }).success,
    ).toBe(false);
  });

  it("rejects lowercase / wrong-prefix file ids", () => {
    for (const id of ["f12345", "Fabc", "C12345", "U12345"]) {
      expect(
        SlackGetFileInfoConfigSchema.safeParse({ fileId: id }).success,
      ).toBe(false);
    }
  });

  it("rejects includeComments as a non-boolean", () => {
    expect(
      SlackGetFileInfoConfigSchema.safeParse({
        fileId: "F12345",
        includeComments: "yes",
      }).success,
    ).toBe(false);
  });
});

describe("SlackGetFileInfoConfigSchema — strict mode (V1 rot rejection)", () => {
  it("rejects a workspace selector field (V1 rot)", () => {
    expect(
      SlackGetFileInfoConfigSchema.safeParse({
        fileId: "F12345",
        workspace: "T0001",
      }).success,
    ).toBe(false);
  });

  it("rejects an asUser toggle (V1 rot — bot-token only in V2)", () => {
    expect(
      SlackGetFileInfoConfigSchema.safeParse({
        fileId: "F12345",
        asUser: true,
      }).success,
    ).toBe(false);
  });

  it("rejects V1's fileIdManual / fileSource dual-source picker", () => {
    expect(
      SlackGetFileInfoConfigSchema.safeParse({
        fileId: "F12345",
        fileIdManual: "F99999",
      }).success,
    ).toBe(false);
    expect(
      SlackGetFileInfoConfigSchema.safeParse({
        fileId: "F12345",
        fileSource: "manual",
      }).success,
    ).toBe(false);
  });
});
