/**
 * @jest-environment node
 *
 * Handler tests for integrations/gmail/actions/getAttachment.ts
 * (Gmail 2.3 Commit 5).
 *
 * Every external boundary is mocked:
 *   - refreshAndRetry (routes the inner apiCall through to a fake token)
 *   - usersMessagesGet (metadata fetch — format=full)
 *   - usersMessagesAttachmentsGet (byte fetch — wire shape)
 *   - stageFileToStorage (P-S3 staging)
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

const mockUsersMessagesGet = jest.fn();
jest.mock("@/integrations/gmail/api/usersMessagesGet", () => ({
  usersMessagesGet: (...args: unknown[]) => mockUsersMessagesGet(...args),
}));

const mockUsersMessagesAttachmentsGet = jest.fn();
jest.mock("@/integrations/gmail/api/usersMessagesAttachmentsGet", () => ({
  usersMessagesAttachmentsGet: (...args: unknown[]) =>
    mockUsersMessagesAttachmentsGet(...args),
}));

const mockStageFileToStorage = jest.fn();
jest.mock("@/services/files/stageFileToStorage", () => ({
  stageFileToStorage: (...args: unknown[]) => mockStageFileToStorage(...args),
}));

import { getAttachment } from "@/integrations/gmail/actions/getAttachment";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const gmailEvent: TriggerEvent = {
  provider: "gmail",
  eventType: "new_attachment",
  eventId: "attachment:msg-1",
  occurredAt: "2026-05-14T00:00:00Z",
  providerAccountId: "alice@example.com",
  payload: { id: "msg-1" },
};

const nonGmailEvent: TriggerEvent = {
  provider: "slack",
  eventType: "slack.message.channel",
  eventId: "Ev1",
  occurredAt: "2026-05-14T00:00:00Z",
  providerAccountId: "T0001",
  payload: {},
};

const stagedRef = {
  kind: "v2_storage" as const,
  name: "report.pdf",
  mimeType: "application/pdf",
  sizeBytes: 5,
  storagePath: "user-1/wf-1/run-1/n-get/report.pdf",
  provider: "gmail",
  expiresAt: "2026-05-15T00:00:00Z",
  metadata: { messageId: "msg-1", attachmentId: "att-1" },
};

const stagedRecord = {
  id: "wf-file-1",
  userId: "user-1",
  workflowId: "wf-1",
  runId: "run-1",
  nodeId: "n-get",
  storagePath: stagedRef.storagePath,
  fileName: "report.pdf",
  mimeType: "application/pdf",
  sizeBytes: 5,
  expiresAt: stagedRef.expiresAt,
  metadata: stagedRef.metadata,
  createdAt: "2026-05-14T00:00:00Z",
  updatedAt: "2026-05-14T00:00:00Z",
};

function makeMessageWithAttachment(opts: {
  attachmentId?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  nested?: boolean;
} = {}) {
  const att = {
    mimeType: opts.mimeType ?? "application/pdf",
    filename: opts.filename ?? "report.pdf",
    body: {
      attachmentId: opts.attachmentId ?? "att-1",
      size: opts.size ?? 5,
    },
  };
  return {
    id: "msg-1",
    threadId: "thr-1",
    labelIds: ["INBOX"],
    snippet: "",
    internalDate: "0",
    sizeEstimate: 4096,
    payload: {
      mimeType: "multipart/mixed",
      headers: [{ name: "From", value: "alice@example.com" }],
      parts: opts.nested
        ? [
            {
              mimeType: "multipart/alternative",
              filename: "",
              parts: [{ mimeType: "text/plain", filename: "" }],
            },
            {
              mimeType: "multipart/mixed",
              filename: "",
              parts: [att],
            },
          ]
        : [att],
    },
  };
}

function makeInput(
  config: Record<string, unknown> = { messageId: "msg-1", attachmentId: "att-1" },
  overrides: Partial<ActionHandlerInput> = {},
): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "n-get",
    config,
    triggerEvent: gmailEvent,
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersMessagesGet.mockReset();
  mockUsersMessagesAttachmentsGet.mockReset();
  mockStageFileToStorage.mockReset();

  // refreshAndRetry forwards to apiCall("test-token").
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) =>
      i.apiCall("test-token"),
  );

  mockUsersMessagesGet.mockResolvedValue(makeMessageWithAttachment());
  mockUsersMessagesAttachmentsGet.mockResolvedValue({
    // "hello" base64url-encoded (no padding).
    data: "aGVsbG8",
    size: 5,
  });
  mockStageFileToStorage.mockResolvedValue({
    ref: stagedRef,
    record: stagedRecord,
  });
});

describe("get_attachment — happy path", () => {
  it("fetches metadata with format=full, then bytes, stages via stageFileToStorage, returns FileRef(v2_storage)", async () => {
    const result = await getAttachment(makeInput());

    // 1. usersMessagesGet was called with format=full.
    expect(mockUsersMessagesGet).toHaveBeenCalledTimes(1);
    expect(mockUsersMessagesGet.mock.calls[0]![0]).toMatchObject({
      accessToken: "test-token",
      messageId: "msg-1",
      format: "full",
    });

    // 2. usersMessagesAttachmentsGet was called with the same ids.
    expect(mockUsersMessagesAttachmentsGet).toHaveBeenCalledTimes(1);
    expect(mockUsersMessagesAttachmentsGet.mock.calls[0]![0]).toMatchObject({
      accessToken: "test-token",
      messageId: "msg-1",
      attachmentId: "att-1",
    });

    // 3. Bytes were decoded internally — staging received a real
    //    Uint8Array with the right contents ("hello" → 5 bytes).
    expect(mockStageFileToStorage).toHaveBeenCalledTimes(1);
    const stageArg = mockStageFileToStorage.mock.calls[0]![0];
    expect(stageArg.userId).toBe("user-1");
    expect(stageArg.workflowId).toBe("wf-1");
    expect(stageArg.runId).toBe("run-1");
    expect(stageArg.nodeId).toBe("n-get");
    expect(stageArg.fileName).toBe("report.pdf");
    expect(stageArg.mimeType).toBe("application/pdf");
    expect(stageArg.sizeBytes).toBe(5);
    expect(stageArg.provider).toBe("gmail");
    expect(stageArg.bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(stageArg.bytes as Uint8Array)).toEqual([
      0x68, 0x65, 0x6c, 0x6c, 0x6f,
    ]);

    // 4. Output is { file: FileRef, messageId, attachmentId, fileName,
    //    mimeType, sizeBytes }.
    expect(result.output).toEqual({
      file: stagedRef,
      messageId: "msg-1",
      attachmentId: "att-1",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 5,
    });
  });

  it("locates a nested attachment via the shared extractAttachmentMetadata walk", async () => {
    mockUsersMessagesGet.mockResolvedValueOnce(
      makeMessageWithAttachment({ nested: true }),
    );

    await getAttachment(makeInput());

    expect(mockUsersMessagesAttachmentsGet).toHaveBeenCalledTimes(1);
    expect(mockStageFileToStorage).toHaveBeenCalledTimes(1);
  });

  it("stage metadata contains ONLY messageId + attachmentId (Gmail 2.3 plan §9 metadata policy)", async () => {
    await getAttachment(makeInput());

    const stageArg = mockStageFileToStorage.mock.calls[0]![0];
    expect(stageArg.metadata).toEqual({
      messageId: "msg-1",
      attachmentId: "att-1",
    });
    // Defense-in-depth: assert no PII / headers / addresses / tokens.
    const metaKeys = Object.keys(stageArg.metadata as Record<string, unknown>);
    for (const forbidden of [
      "from",
      "to",
      "subject",
      "headers",
      "accessToken",
      "token",
      "snippet",
    ]) {
      expect(metaKeys).not.toContain(forbidden);
    }
  });

  it("output contains no inline-byte keys (defense in depth — `data`, `content`, `base64`, `bytes`)", async () => {
    const result = await getAttachment(makeInput());
    const keys = Object.keys(result.output);
    expect(keys).not.toContain("data");
    expect(keys).not.toContain("content");
    expect(keys).not.toContain("base64");
    expect(keys).not.toContain("bytes");
  });

  it("falls back to the part's reported size when the bytes endpoint omits `size`", async () => {
    mockUsersMessagesAttachmentsGet.mockResolvedValueOnce({ data: "aGVsbG8" });
    // part-level size from makeMessageWithAttachment default = 5
    const result = await getAttachment(makeInput());
    expect(result.output).toMatchObject({ sizeBytes: 5 });
    expect(mockStageFileToStorage.mock.calls[0]![0].sizeBytes).toBe(5);
  });

  it("routes refreshAndRetry to a Gmail trigger's accountId when present", async () => {
    await getAttachment(makeInput());
    for (const call of mockRefreshAndRetry.mock.calls) {
      expect(call[0]).toMatchObject({
        provider: "gmail",
      providerAccountId: "alice@example.com",
      });
    }
  });

  it("routes refreshAndRetry with accountId=null when triggerEvent is not Gmail", async () => {
    mockRefreshAndRetry.mockClear();
    await getAttachment(
      makeInput(undefined, { triggerEvent: nonGmailEvent }),
    );
    for (const call of mockRefreshAndRetry.mock.calls) {
      expect(call[0]).toMatchObject({
        provider: "gmail",
      providerAccountId: null,
      });
    }
  });
});

describe("get_attachment — error surface", () => {
  it("throws (before byte fetch) when the id is not found AND the message has multiple attachments (ambiguous)", async () => {
    // Two attachments + a non-matching id -> genuinely unresolvable (the single-attachment
    // fallback can't disambiguate). Gmail attachment ids are unstable across gets, so the
    // fallback only applies when there is exactly one attachment.
    mockUsersMessagesGet.mockResolvedValueOnce({
      id: "msg-1",
      threadId: "thr-1",
      labelIds: ["INBOX"],
      snippet: "",
      internalDate: "0",
      sizeEstimate: 4096,
      payload: {
        mimeType: "multipart/mixed",
        headers: [{ name: "From", value: "alice@example.com" }],
        parts: [
          { mimeType: "application/pdf", filename: "a.pdf", body: { attachmentId: "att-a", size: 3 } },
          { mimeType: "application/pdf", filename: "b.pdf", body: { attachmentId: "att-b", size: 4 } },
        ],
      },
    });

    await expect(
      getAttachment(
        makeInput({ messageId: "msg-1", attachmentId: "att-missing" }),
      ),
    ).rejects.toThrow(/attachment not found/i);

    // Did NOT proceed to the byte fetch or stage.
    expect(mockUsersMessagesAttachmentsGet).not.toHaveBeenCalled();
    expect(mockStageFileToStorage).not.toHaveBeenCalled();
  });

  it("falls back to the SOLE attachment (using this get's id) when the caller's id is stale (unstable Gmail ids)", async () => {
    // Gmail returns a DIFFERENT attachmentId per get; the single attachment here has
    // "fresh-att" while the caller passes a stale "stale-att". With exactly one attachment
    // the target is unambiguous -> fetch it using the FRESH id from this get.
    mockUsersMessagesGet.mockResolvedValueOnce(
      makeMessageWithAttachment({ attachmentId: "fresh-att" }),
    );

    const result = await getAttachment(
      makeInput({ messageId: "msg-1", attachmentId: "stale-att" }),
    );

    // Bytes fetched with the FRESH id from this get, not the caller's stale id.
    expect(mockUsersMessagesAttachmentsGet).toHaveBeenCalledTimes(1);
    expect(mockUsersMessagesAttachmentsGet.mock.calls[0]![0]).toMatchObject({
      messageId: "msg-1",
      attachmentId: "fresh-att",
    });
    expect(mockStageFileToStorage).toHaveBeenCalledTimes(1);
    // Output echoes the caller-supplied id for correlation.
    expect(result.output).toMatchObject({ messageId: "msg-1", attachmentId: "stale-att", fileName: "report.pdf" });
  });

  it("throws when the message has no parts at all (attachment can't exist)", async () => {
    mockUsersMessagesGet.mockResolvedValueOnce({
      id: "msg-1",
      threadId: "thr-1",
      labelIds: [],
      snippet: "",
      internalDate: "0",
      sizeEstimate: 0,
      payload: { mimeType: "text/plain", headers: [], parts: undefined },
    });

    await expect(getAttachment(makeInput())).rejects.toThrow(
      /attachment not found/i,
    );
    expect(mockUsersMessagesAttachmentsGet).not.toHaveBeenCalled();
    expect(mockStageFileToStorage).not.toHaveBeenCalled();
  });

  it("propagates metadata-fetch errors", async () => {
    mockUsersMessagesGet.mockRejectedValueOnce(new Error("messages.get failed"));
    await expect(getAttachment(makeInput())).rejects.toThrow(
      /messages\.get failed/,
    );
    expect(mockUsersMessagesAttachmentsGet).not.toHaveBeenCalled();
    expect(mockStageFileToStorage).not.toHaveBeenCalled();
  });

  it("propagates byte-fetch errors", async () => {
    mockUsersMessagesAttachmentsGet.mockRejectedValueOnce(
      new Error("attachments.get failed"),
    );
    await expect(getAttachment(makeInput())).rejects.toThrow(
      /attachments\.get failed/,
    );
    expect(mockStageFileToStorage).not.toHaveBeenCalled();
  });

  it("propagates stageFileToStorage errors", async () => {
    mockStageFileToStorage.mockRejectedValueOnce(
      new Error("workflow_files.insert failed: duplicate storage_path"),
    );
    await expect(getAttachment(makeInput())).rejects.toThrow(
      /duplicate storage_path/,
    );
  });

  it("rejects invalid configs at parse time (.strict)", async () => {
    await expect(
      getAttachment(makeInput({ messageId: "msg-1" })), // missing attachmentId
    ).rejects.toThrow();
    await expect(
      getAttachment(
        makeInput({
          messageId: "msg-1",
          attachmentId: "att-1",
          saveToVariable: true, // V1 field
        }),
      ),
    ).rejects.toThrow();
  });
});
