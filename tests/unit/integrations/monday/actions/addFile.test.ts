/**
 * @jest-environment node
 *
 * MONDAY-4 add_file — FileRef consumer. Resolves a FileRef to bytes
 * (Slack upload_file pattern) and multipart-uploads to Monday.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { FileRef } from "@/contracts/file";

const mockRefreshAndRetry = jest.fn();
const mockFetchFileBytes = jest.fn();
const mockAddFileToColumn = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/core/files/fetchFileBytes", () => ({
  fetchFileBytes: (...args: unknown[]) => mockFetchFileBytes(...args),
  WORKFLOW_FILES_BUCKET: "workflow-files",
}));

jest.mock("@/integrations/_shared/monday/api/addFileToColumn", () => ({
  addFileToColumn: (...args: unknown[]) => mockAddFileToColumn(...args),
}));

import { addFile, MondayAddFileConfigError } from "@/integrations/monday/actions/files/addFile";
import { AddFileConfigSchema } from "@/integrations/monday/actions/files/addFile.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockFetchFileBytes.mockReset();
  mockAddFileToColumn.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "monday",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-24T00:00:00Z",
    accountId: "alice@example.com",
    payload: {},
  };
}

const v2StorageRef: FileRef = {
  kind: "v2_storage",
  name: "report.pdf",
  mimeType: "application/pdf",
  storagePath: "u/wf/run/node/report.pdf",
};
const signedUrlRef: FileRef = {
  kind: "signed_url",
  name: "image.png",
  mimeType: "image/png",
  url: "https://signed.example/file",
};
const providerUrlRef: FileRef = {
  kind: "provider_url",
  name: "x.pdf",
  mimeType: "application/pdf",
  url: "https://provider.example/file",
  provider: "slack",
};

describe("add_file schema", () => {
  it("requires itemId + columnId + file (FileRef)", () => {
    expect(() =>
      AddFileConfigSchema.parse({
        itemId: "i",
        columnId: "files",
        file: v2StorageRef,
      }),
    ).not.toThrow();
    expect(() =>
      AddFileConfigSchema.parse({ itemId: "i", columnId: "files" }),
    ).toThrow();
  });

  it("uses 'file' as the FileRef field name (V2 convention)", () => {
    const parsed = AddFileConfigSchema.parse({
      itemId: "i",
      columnId: "files",
      file: signedUrlRef,
    });
    expect(parsed.file.kind).toBe("signed_url");
  });
});

describe("add_file handler — FileRef arms", () => {
  it("REJECTS provider_url with a structured config error + hint", async () => {
    let caught: unknown;
    try {
      await addFile({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { itemId: "1", columnId: "files", file: providerUrlRef },
        triggerEvent: trigger(),
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MondayAddFileConfigError);
    expect((caught as MondayAddFileConfigError).code).toBe(
      "provider_url_unsupported",
    );
    expect((caught as MondayAddFileConfigError).hint).toMatch(/stage bytes/i);
    expect(mockFetchFileBytes).not.toHaveBeenCalled();
    expect(mockAddFileToColumn).not.toHaveBeenCalled();
  });

  it("v2_storage → fetchFileBytes with a storage adapter, then multipart upload", async () => {
    mockFetchFileBytes.mockResolvedValueOnce({
      bytes: new Uint8Array([1, 2, 3]),
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 3,
    });
    mockAddFileToColumn.mockResolvedValueOnce({
      id: "asset-1",
      name: "report.pdf",
      url: "https://monday.example/asset-1",
    });
    await addFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "1", columnId: "files", file: v2StorageRef },
      triggerEvent: trigger(),
    });
    // storage adapter passed for v2_storage.
    expect(mockFetchFileBytes.mock.calls[0]![1].storage).toBeDefined();
    const callArg = mockAddFileToColumn.mock.calls[0]![0];
    expect(callArg.itemId).toBe("1");
    expect(callArg.columnId).toBe("files");
    expect(callArg.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("signed_url → fetchFileBytes with NO storage adapter", async () => {
    mockFetchFileBytes.mockResolvedValueOnce({
      bytes: new Uint8Array([9]),
      name: "image.png",
      mimeType: "image/png",
      sizeBytes: 1,
    });
    mockAddFileToColumn.mockResolvedValueOnce({
      id: "asset-2",
      name: "image.png",
      url: null,
    });
    await addFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "1", columnId: "files", file: signedUrlRef },
      triggerEvent: trigger(),
    });
    expect(mockFetchFileBytes.mock.calls[0]![1].storage).toBeUndefined();
  });

  it("filename override takes precedence over the FileRef name", async () => {
    mockFetchFileBytes.mockResolvedValueOnce({
      bytes: new Uint8Array([1]),
      name: "original.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
    });
    mockAddFileToColumn.mockResolvedValueOnce({
      id: "a",
      name: "renamed.pdf",
      url: null,
    });
    await addFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        itemId: "1",
        columnId: "files",
        file: v2StorageRef,
        filename: "renamed.pdf",
      },
      triggerEvent: trigger(),
    });
    expect(mockAddFileToColumn.mock.calls[0]![0].fileName).toBe("renamed.pdf");
  });

  it("output: fileId/fileName/fileUrl/itemId/columnId/sizeBytes/uploadedAt; NO bytes", async () => {
    mockFetchFileBytes.mockResolvedValueOnce({
      bytes: new Uint8Array([1, 2, 3, 4]),
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4,
    });
    mockAddFileToColumn.mockResolvedValueOnce({
      id: "asset-1",
      name: "report.pdf",
      url: "https://monday.example/asset-1",
    });
    const result = await addFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "1", columnId: "files", file: v2StorageRef },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      fileId: "asset-1",
      fileName: "report.pdf",
      fileUrl: "https://monday.example/asset-1",
      itemId: "1",
      columnId: "files",
      sizeBytes: 4,
      uploadedAt: expect.any(String),
    });
    const json = JSON.stringify(result.output);
    expect(json).not.toContain("bytes");
    expect(json).not.toContain("base64");
  });

  it("uses refreshAndRetry provider='monday'", async () => {
    mockFetchFileBytes.mockResolvedValueOnce({
      bytes: new Uint8Array([1]),
      name: "f",
      mimeType: "application/pdf",
      sizeBytes: 1,
    });
    mockAddFileToColumn.mockResolvedValueOnce({ id: "a", name: "f", url: null });
    await addFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "1", columnId: "files", file: signedUrlRef },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
  });
});
