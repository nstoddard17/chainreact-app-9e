/**
 * @jest-environment node
 *
 * Unit tests for services/files/cleanupExpiredFiles.ts.
 *
 * - Mocks the workflow_files repo + Supabase storage.
 * - Asserts storage-first / metadata-second ordering.
 * - Asserts continue-on-failure semantics: one row's failure does NOT
 *   abort the batch.
 * - Asserts the empty-batch fast path (no service-role client needed).
 */

interface RemoveCall {
  bucket: string;
  paths: string[];
}

const removeCalls: RemoveCall[] = [];
const removeResults: Array<{ error: { message: string } | null }> = [];

function makeMockSupabase() {
  return {
    storage: {
      from(bucket: string) {
        return {
          remove(paths: string[]) {
            removeCalls.push({ bucket, paths });
            const next = removeResults.shift() ?? { error: null };
            return Promise.resolve(next);
          },
        };
      },
    },
  };
}

const mockSupabase: { current: ReturnType<typeof makeMockSupabase> | null } = {
  current: null,
};

const getServiceRoleClientMock = jest.fn(() => mockSupabase.current);

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: (..._args: unknown[]) => getServiceRoleClientMock(),
}));

const mockListExpired = jest.fn();
const mockDeleteById = jest.fn();

jest.mock("@/repositories/workflowFiles", () => ({
  listExpiredWorkflowFiles: (...args: unknown[]) => mockListExpired(...args),
  deleteWorkflowFileById: (...args: unknown[]) => mockDeleteById(...args),
}));

import { cleanupExpiredFiles } from "@/services/files/cleanupExpiredFiles";

function expiredRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wf-file-1",
    userId: "user-1",
    workflowId: "wf-1",
    runId: "run-1",
    nodeId: "node-1",
    storagePath: "user-1/wf-1/run-1/node-1/a.pdf",
    fileName: "a.pdf",
    mimeType: "application/pdf",
    sizeBytes: 100,
    expiresAt: "2026-05-11T00:00:00Z",
    metadata: {},
    createdAt: "2026-05-10T00:00:00Z",
    updatedAt: "2026-05-10T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  removeCalls.length = 0;
  removeResults.length = 0;
  mockSupabase.current = makeMockSupabase();
  getServiceRoleClientMock.mockClear();
  mockListExpired.mockReset();
  mockDeleteById.mockReset();
});

describe("cleanupExpiredFiles — empty batch", () => {
  it("returns zero counts and never builds a service-role client when nothing is expired", async () => {
    mockListExpired.mockResolvedValueOnce([]);
    const result = await cleanupExpiredFiles({
      now: "2026-05-12T00:00:00Z",
    });
    expect(result.scanned).toBe(0);
    expect(result.storageDeleted).toBe(0);
    expect(result.metadataDeleted).toBe(0);
    expect(result.failed).toBe(0);
    expect(getServiceRoleClientMock).not.toHaveBeenCalled();
    expect(removeCalls).toHaveLength(0);
    expect(mockDeleteById).not.toHaveBeenCalled();
  });
});

describe("cleanupExpiredFiles — happy path", () => {
  it("deletes the storage object FIRST, then the metadata row, for every expired entry", async () => {
    const rows = [
      expiredRow({ id: "r-1", storagePath: "p/a/1" }),
      expiredRow({ id: "r-2", storagePath: "p/a/2" }),
    ];
    mockListExpired.mockResolvedValueOnce(rows);
    mockDeleteById.mockResolvedValue(undefined);

    const result = await cleanupExpiredFiles({
      now: "2026-05-12T00:00:00Z",
    });

    expect(result.scanned).toBe(2);
    expect(result.storageDeleted).toBe(2);
    expect(result.metadataDeleted).toBe(2);
    expect(result.failed).toBe(0);

    expect(removeCalls).toEqual([
      { bucket: "workflow-files", paths: ["p/a/1"] },
      { bucket: "workflow-files", paths: ["p/a/2"] },
    ]);
    expect(mockDeleteById).toHaveBeenNthCalledWith(1, "r-1");
    expect(mockDeleteById).toHaveBeenNthCalledWith(2, "r-2");
  });

  it("forwards now + limit options to the repository listExpired call", async () => {
    mockListExpired.mockResolvedValueOnce([]);
    await cleanupExpiredFiles({
      now: "2026-05-12T00:00:00Z",
      limit: 250,
    });
    expect(mockListExpired).toHaveBeenCalledWith(
      expect.objectContaining({
        now: "2026-05-12T00:00:00Z",
        limit: 250,
      }),
    );
  });
});

describe("cleanupExpiredFiles — partial failures", () => {
  it("counts a storage-remove error as `failed` and continues to the next row", async () => {
    const rows = [
      expiredRow({ id: "r-bad", storagePath: "p/bad" }),
      expiredRow({ id: "r-good", storagePath: "p/good" }),
    ];
    mockListExpired.mockResolvedValueOnce(rows);
    removeResults.push({ error: { message: "storage 5xx" } });
    removeResults.push({ error: null });
    mockDeleteById.mockResolvedValue(undefined);

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const result = await cleanupExpiredFiles({
      now: "2026-05-12T00:00:00Z",
    });

    expect(result.scanned).toBe(2);
    expect(result.storageDeleted).toBe(1);
    // Metadata delete for the bad row was SKIPPED — storage delete is
    // the gate. Only the good row's metadata row was deleted.
    expect(result.metadataDeleted).toBe(1);
    expect(result.failed).toBe(1);
    expect(mockDeleteById).toHaveBeenCalledTimes(1);
    expect(mockDeleteById).toHaveBeenCalledWith("r-good");

    warnSpy.mockRestore();
  });

  it("counts a metadata-delete error as `failed` (storage object is already gone, will retry next tick)", async () => {
    const rows = [expiredRow({ id: "r-1", storagePath: "p/1" })];
    mockListExpired.mockResolvedValueOnce(rows);
    mockDeleteById.mockRejectedValueOnce(new Error("db disconnect"));

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const result = await cleanupExpiredFiles({
      now: "2026-05-12T00:00:00Z",
    });

    expect(result.scanned).toBe(1);
    expect(result.storageDeleted).toBe(1);
    expect(result.metadataDeleted).toBe(0);
    expect(result.failed).toBe(1);

    warnSpy.mockRestore();
  });

  it("treats missing storage object (Supabase returns no error) as a successful delete", async () => {
    // Supabase's `remove([path])` returns `{ data: [], error: null }`
    // for paths that don't exist — modelled here as `error: null`.
    const rows = [expiredRow({ id: "r-1", storagePath: "p/already-gone" })];
    mockListExpired.mockResolvedValueOnce(rows);
    removeResults.push({ error: null });
    mockDeleteById.mockResolvedValue(undefined);

    const result = await cleanupExpiredFiles({
      now: "2026-05-12T00:00:00Z",
    });

    expect(result.storageDeleted).toBe(1);
    expect(result.metadataDeleted).toBe(1);
    expect(result.failed).toBe(0);
  });
});
