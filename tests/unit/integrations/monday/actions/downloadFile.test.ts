/**
 * @jest-environment node
 *
 * MONDAY-4 download_file — FileRef producer. Resolves an item asset,
 * fetches its public_url bytes, stages → FileRef(v2_storage).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockStageFileToStorage = jest.fn();
const mockItemFilesGet = jest.fn();
const mockAssetsGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/services/files/stageFileToStorage", () => ({
  stageFileToStorage: (...args: unknown[]) => mockStageFileToStorage(...args),
}));

jest.mock("@/integrations/_shared/monday/api/itemFilesGet", () => ({
  itemFilesGet: (...args: unknown[]) => mockItemFilesGet(...args),
}));

jest.mock("@/integrations/_shared/monday/api/assetsGet", () => ({
  assetsGet: (...args: unknown[]) => mockAssetsGet(...args),
}));

import { downloadFile } from "@/integrations/monday/actions/files/downloadFile";
import {
  DownloadFileConfigSchema,
  ITEM_FILES_SENTINEL,
} from "@/integrations/monday/actions/files/downloadFile.schema";
import { NotFoundError } from "@/integrations/_shared/monday/errors";

const stagedRef = {
  kind: "v2_storage" as const,
  name: "doc.pdf",
  mimeType: "application/octet-stream",
  storagePath: "u/wf/run/node/doc.pdf",
  provider: "monday" as const,
};

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockStageFileToStorage.mockReset();
  mockItemFilesGet.mockReset();
  mockAssetsGet.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockStageFileToStorage.mockResolvedValue({ ref: stagedRef, record: {} });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function trigger(): TriggerEvent {
  return {
    provider: "monday",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-24T00:00:00Z",
    providerAccountId: "alice@example.com",
    payload: {},
  };
}

function mockFetchBytes(bytes: Uint8Array, ok = true, status = 200) {
  const body = ok
    ? (bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer)
    : null;
  jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

describe("download_file schema", () => {
  it("requires itemId + columnId; fileId optional", () => {
    expect(() =>
      DownloadFileConfigSchema.parse({ itemId: "i", columnId: "files" }),
    ).not.toThrow();
    expect(() => DownloadFileConfigSchema.parse({ itemId: "i" })).toThrow();
  });

  it("exports the __item_files__ sentinel constant", () => {
    expect(ITEM_FILES_SENTINEL).toBe("__item_files__");
  });
});

describe("download_file handler — __item_files__ sentinel", () => {
  it("uses item assets + update assets and stages the first asset", async () => {
    mockItemFilesGet.mockResolvedValueOnce({
      itemId: "i-1",
      itemName: "Item",
      assets: [
        {
          id: "a-1",
          name: "doc.pdf",
          url: "https://auth-bound",
          public_url: "https://public.example/a-1",
          file_size: 100,
          file_extension: "pdf",
        },
      ],
      updateAssets: [],
      columnValues: [],
    });
    mockFetchBytes(new Uint8Array([1, 2, 3]));

    const result = await downloadFile({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "i-1", columnId: ITEM_FILES_SENTINEL },
      triggerEvent: trigger(),
    });

    expect(mockAssetsGet).not.toHaveBeenCalled();
    expect(mockStageFileToStorage).toHaveBeenCalled();
    const stageArg = mockStageFileToStorage.mock.calls[0]![0];
    expect(stageArg.provider).toBe("monday");
    expect(stageArg.fileName).toBe("doc.pdf");
    expect(result.output.file).toBe(stagedRef);
    expect(result.output.fileId).toBe("a-1");
    expect(result.output.sizeBytes).toBe(3);
    // No raw bytes in output.
    expect(JSON.stringify(result.output)).not.toContain("base64");
  });

  it("selects a specific asset by fileId", async () => {
    mockItemFilesGet.mockResolvedValueOnce({
      itemId: "i-1",
      itemName: "Item",
      assets: [
        {
          id: "a-1",
          name: "first.pdf",
          url: null,
          public_url: "https://public.example/a-1",
          file_size: null,
          file_extension: "pdf",
        },
        {
          id: "a-2",
          name: "second.pdf",
          url: null,
          public_url: "https://public.example/a-2",
          file_size: null,
          file_extension: "pdf",
        },
      ],
      updateAssets: [],
      columnValues: [],
    });
    mockFetchBytes(new Uint8Array([5]));

    const result = await downloadFile({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "i-1", columnId: ITEM_FILES_SENTINEL, fileId: "a-2" },
      triggerEvent: trigger(),
    });
    expect(result.output.fileId).toBe("a-2");
  });
});

describe("download_file handler — specific file column", () => {
  it("parses the column file value, resolves assetIds via assetsGet", async () => {
    mockItemFilesGet.mockResolvedValueOnce({
      itemId: "i-1",
      itemName: "Item",
      assets: [],
      updateAssets: [],
      columnValues: [
        {
          id: "files_col",
          type: "file",
          value: JSON.stringify({ files: [{ assetId: "a-9" }] }),
        },
      ],
    });
    mockAssetsGet.mockResolvedValueOnce([
      {
        id: "a-9",
        name: "fromcol.pdf",
        url: null,
        public_url: "https://public.example/a-9",
        file_size: 50,
        file_extension: "pdf",
      },
    ]);
    mockFetchBytes(new Uint8Array([7, 7]));

    const result = await downloadFile({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "i-1", columnId: "files_col" },
      triggerEvent: trigger(),
    });
    expect(mockAssetsGet.mock.calls[0]![0].assetIds).toEqual(["a-9"]);
    expect(result.output.fileId).toBe("a-9");
  });

  it("falls back to item assets when the column has no parseable files", async () => {
    mockItemFilesGet.mockResolvedValueOnce({
      itemId: "i-1",
      itemName: "Item",
      assets: [
        {
          id: "a-1",
          name: "fallback.pdf",
          url: null,
          public_url: "https://public.example/a-1",
          file_size: null,
          file_extension: "pdf",
        },
      ],
      updateAssets: [],
      columnValues: [{ id: "files_col", type: "file", value: null }],
    });
    mockFetchBytes(new Uint8Array([1]));

    const result = await downloadFile({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "i-1", columnId: "files_col" },
      triggerEvent: trigger(),
    });
    expect(mockAssetsGet).not.toHaveBeenCalled();
    expect(result.output.fileId).toBe("a-1");
  });
});

describe("download_file handler — errors", () => {
  it("throws NotFoundError when item missing", async () => {
    mockItemFilesGet.mockResolvedValueOnce(null);
    await expect(
      downloadFile({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { itemId: "gone", columnId: ITEM_FILES_SENTINEL },
        triggerEvent: trigger(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError when no asset found", async () => {
    mockItemFilesGet.mockResolvedValueOnce({
      itemId: "i-1",
      itemName: "Item",
      assets: [],
      updateAssets: [],
      columnValues: [],
    });
    await expect(
      downloadFile({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { itemId: "i-1", columnId: ITEM_FILES_SENTINEL },
        triggerEvent: trigger(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws when the asset has no public_url (no auth-bound url leak)", async () => {
    mockItemFilesGet.mockResolvedValueOnce({
      itemId: "i-1",
      itemName: "Item",
      assets: [
        {
          id: "a-1",
          name: "doc.pdf",
          url: "https://auth-bound-secret",
          public_url: null,
          file_size: null,
          file_extension: "pdf",
        },
      ],
      updateAssets: [],
      columnValues: [],
    });
    let caught: unknown;
    try {
      await downloadFile({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { itemId: "i-1", columnId: ITEM_FILES_SENTINEL },
        triggerEvent: trigger(),
      });
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).toMatch(/no public_url/);
    expect((caught as Error).message).not.toContain("auth-bound-secret");
  });

  it("download HTTP failure surfaces sanitized error (status only, no URL)", async () => {
    mockItemFilesGet.mockResolvedValueOnce({
      itemId: "i-1",
      itemName: "Item",
      assets: [
        {
          id: "a-1",
          name: "doc.pdf",
          url: null,
          public_url: "https://public.example/secret-path",
          file_size: null,
          file_extension: "pdf",
        },
      ],
      updateAssets: [],
      columnValues: [],
    });
    mockFetchBytes(new Uint8Array([]), false, 403);
    let caught: unknown;
    try {
      await downloadFile({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { itemId: "i-1", columnId: ITEM_FILES_SENTINEL },
        triggerEvent: trigger(),
      });
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).toContain("403");
    expect((caught as Error).message).not.toContain("secret-path");
  });
});
