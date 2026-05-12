/**
 * @jest-environment node
 *
 * Unit tests for services/files/stageFileToStorage.ts.
 *
 * - Repository + Supabase storage are both mocked. The test never
 *   touches the network.
 * - Asserts the canonical storage path, the metadata insert payload,
 *   and the returned FileRef shape.
 * - Asserts the partial-failure contract: if metadata insert throws,
 *   we best-effort `storage.remove([path])` before re-throwing.
 * - Asserts that we never log the bytes themselves (the test rejects
 *   any `console.warn` / `console.log` call whose stringified payload
 *   contains the magic 0xff 0xfe sentinel we put in the test bytes).
 */

import {
  type V2StorageFileRef,
} from "@/contracts/file";

interface UploadCall {
  bucket: string;
  path: string;
  body: unknown;
  options: unknown;
}
interface RemoveCall {
  bucket: string;
  paths: string[];
}

const uploadCalls: UploadCall[] = [];
const removeCalls: RemoveCall[] = [];
let nextUploadResult: { error: { message: string } | null } = { error: null };
let nextRemoveResult: { error: { message: string } | null } = { error: null };

function makeMockSupabase() {
  return {
    storage: {
      from(bucket: string) {
        return {
          upload(path: string, body: unknown, options: unknown) {
            uploadCalls.push({ bucket, path, body, options });
            return Promise.resolve(nextUploadResult);
          },
          remove(paths: string[]) {
            removeCalls.push({ bucket, paths });
            return Promise.resolve(nextRemoveResult);
          },
        };
      },
    },
  };
}

const mockSupabase: { current: ReturnType<typeof makeMockSupabase> | null } = {
  current: null,
};

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockSupabase.current),
}));

const mockInsertWorkflowFile = jest.fn();

jest.mock("@/repositories/workflowFiles", () => ({
  insertWorkflowFile: (...args: unknown[]) => mockInsertWorkflowFile(...args),
}));

import { stageFileToStorage } from "@/services/files/stageFileToStorage";

beforeEach(() => {
  uploadCalls.length = 0;
  removeCalls.length = 0;
  nextUploadResult = { error: null };
  nextRemoveResult = { error: null };
  mockSupabase.current = makeMockSupabase();
  mockInsertWorkflowFile.mockReset();
});

function baseInput(overrides: Partial<Parameters<typeof stageFileToStorage>[0]> = {}) {
  return {
    userId: "user-1",
    workflowId: "wf-1",
    runId: "run-1",
    nodeId: "node-1",
    fileName: "report.pdf",
    mimeType: "application/pdf",
    bytes: new Uint8Array([1, 2, 3, 4]),
    ...overrides,
  };
}

function baseRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "wf-file-1",
    userId: "user-1",
    workflowId: "wf-1",
    runId: "run-1",
    nodeId: "node-1",
    storagePath: "user-1/wf-1/run-1/node-1/report.pdf",
    fileName: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4,
    expiresAt: "2026-05-13T00:00:00Z",
    metadata: {},
    createdAt: "2026-05-12T00:00:00Z",
    updatedAt: "2026-05-12T00:00:00Z",
    ...overrides,
  };
}

describe("stageFileToStorage — happy path", () => {
  it("uploads to workflow-files at the canonical path, inserts metadata, returns FileRef(kind=v2_storage)", async () => {
    mockInsertWorkflowFile.mockResolvedValueOnce(baseRecord());

    const result = await stageFileToStorage(baseInput());

    // 1) Upload — bucket + path + body + content-type.
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0]).toMatchObject({
      bucket: "workflow-files",
      path: "user-1/wf-1/run-1/node-1/report.pdf",
    });
    expect(uploadCalls[0]?.body).toBeInstanceOf(Uint8Array);
    expect(uploadCalls[0]?.options).toMatchObject({
      contentType: "application/pdf",
      upsert: true,
    });

    // 2) Metadata insert — uses actual byte length as sizeBytes when
    //    caller didn't supply one.
    expect(mockInsertWorkflowFile).toHaveBeenCalledWith(
      expect.objectContaining({
        storagePath: "user-1/wf-1/run-1/node-1/report.pdf",
        fileName: "report.pdf",
        sizeBytes: 4,
      }),
    );

    // 3) FileRef — points at the metadata row.
    const ref: V2StorageFileRef = result.ref;
    expect(ref.kind).toBe("v2_storage");
    expect(ref.storagePath).toBe("user-1/wf-1/run-1/node-1/report.pdf");
    expect(ref.name).toBe("report.pdf");
    expect(ref.mimeType).toBe("application/pdf");

    // 4) No best-effort cleanup happened.
    expect(removeCalls).toHaveLength(0);
  });

  it("sanitizes the filename (path separators stripped) before building the storage path", async () => {
    mockInsertWorkflowFile.mockResolvedValueOnce(
      baseRecord({
        storagePath: "user-1/wf-1/run-1/node-1/....evil.pdf",
        fileName: "....evil.pdf",
      }),
    );

    await stageFileToStorage(
      baseInput({ fileName: "../../evil.pdf" }),
    );

    // Slashes stripped; dots preserved (sanitizer only kills `/`, `\`,
    // and control chars). `../../evil.pdf` → `....evil.pdf`. The
    // remaining dots are harmless because `..` is no longer a path
    // component once the separators are gone.
    expect(uploadCalls[0]?.path).toBe(
      "user-1/wf-1/run-1/node-1/....evil.pdf",
    );
    expect(mockInsertWorkflowFile).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: "....evil.pdf" }),
    );
  });

  it("threads expiresAt + provider + metadata + provider-reported sizeBytes through to the repository", async () => {
    mockInsertWorkflowFile.mockResolvedValueOnce(
      baseRecord({
        sizeBytes: 999,
        expiresAt: "2026-06-01T00:00:00Z",
        metadata: { permalink: "https://example.com/p" },
      }),
    );

    const result = await stageFileToStorage(
      baseInput({
        sizeBytes: 999,
        expiresAt: "2026-06-01T00:00:00Z",
        provider: "slack",
        metadata: { permalink: "https://example.com/p" },
      }),
    );

    expect(mockInsertWorkflowFile).toHaveBeenCalledWith(
      expect.objectContaining({
        sizeBytes: 999,
        expiresAt: "2026-06-01T00:00:00Z",
        metadata: { permalink: "https://example.com/p" },
      }),
    );
    expect(result.ref.provider).toBe("slack");
    expect(result.ref.expiresAt).toBe("2026-06-01T00:00:00Z");
    expect(result.ref.metadata).toEqual({
      permalink: "https://example.com/p",
    });
  });
});

describe("stageFileToStorage — failure modes", () => {
  it("throws and skips metadata insert when storage upload fails", async () => {
    nextUploadResult = { error: { message: "storage 503" } };
    await expect(stageFileToStorage(baseInput())).rejects.toThrow(/storage 503/);
    expect(mockInsertWorkflowFile).not.toHaveBeenCalled();
    expect(removeCalls).toHaveLength(0);
  });

  it("deletes the uploaded object when metadata insert fails, then re-throws the metadata error", async () => {
    mockInsertWorkflowFile.mockRejectedValueOnce(
      new Error("workflow_files.insert failed: duplicate storage_path"),
    );

    await expect(stageFileToStorage(baseInput())).rejects.toThrow(
      /duplicate storage_path/,
    );

    expect(removeCalls).toHaveLength(1);
    expect(removeCalls[0]).toMatchObject({
      bucket: "workflow-files",
      paths: ["user-1/wf-1/run-1/node-1/report.pdf"],
    });
  });

  it("swallows orphan-cleanup failure and still surfaces the original metadata error", async () => {
    mockInsertWorkflowFile.mockRejectedValueOnce(
      new Error("workflow_files.insert failed: db down"),
    );
    nextRemoveResult = { error: { message: "ignored" } };

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    await expect(stageFileToStorage(baseInput())).rejects.toThrow(/db down/);
    warnSpy.mockRestore();
  });
});

describe("stageFileToStorage — observability + leak avoidance", () => {
  it("never logs the bytes payload in any console call", async () => {
    mockInsertWorkflowFile.mockResolvedValueOnce(baseRecord());
    const sentinel = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);

    const calls: unknown[][] = [];
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation((...args: unknown[]) => {
        calls.push(args);
      });
    const logSpy = jest
      .spyOn(console, "log")
      .mockImplementation((...args: unknown[]) => {
        calls.push(args);
      });
    const infoSpy = jest
      .spyOn(console, "info")
      .mockImplementation((...args: unknown[]) => {
        calls.push(args);
      });
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        calls.push(args);
      });

    try {
      await stageFileToStorage(baseInput({ bytes: sentinel }));
      for (const callArgs of calls) {
        for (const arg of callArgs) {
          const s = typeof arg === "string" ? arg : JSON.stringify(arg);
          expect(s).not.toMatch(/deadbeef/i);
          expect(s).not.toMatch(/Þ­¾ï/);
        }
      }
    } finally {
      warnSpy.mockRestore();
      logSpy.mockRestore();
      infoSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("warns when actual size exceeds the per-provider guidance but does NOT reject", async () => {
    mockInsertWorkflowFile.mockResolvedValueOnce(baseRecord());

    // OneDrive's guidance is 4 MB. 5 MB of bytes exceeds it.
    const big = new Uint8Array(5 * 1024 * 1024);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      stageFileToStorage(baseInput({ bytes: big, provider: "microsoft-onedrive" })),
    ).resolves.toBeDefined();

    expect(warnSpy).toHaveBeenCalled();
    const args = warnSpy.mock.calls.flat();
    const payload = args.find(
      (a) => typeof a === "string" && a.includes("size_exceeds_guidance"),
    );
    expect(payload).toBeDefined();
    warnSpy.mockRestore();
  });
});
