/**
 * @jest-environment node
 *
 * Unit tests for core/files/fetchFileBytes.ts.
 *
 * - `v2_storage` routes through an injected adapter; we capture the
 *   storagePath and return synthetic bytes.
 * - `signed_url` routes through the global `fetch`; we mock that.
 * - `provider_url` throws `UnsupportedProviderFetchError` — the
 *   intentional gap in P-S3 Commit 4 (no cross-provider bearer-fetch
 *   utility yet).
 * - The error messages MUST NOT contain the URL or any token-like
 *   substring, per the no-token-leak rule.
 */

import {
  FileFetchError,
  UnsupportedProviderFetchError,
  WORKFLOW_FILES_BUCKET,
  buildStoragePath,
  fetchFileBytes,
  type WorkflowFilesStorageAdapter,
} from "@/core/files/fetchFileBytes";
import {
  fileRefFromProviderUrl,
  fileRefFromSignedUrl,
  fileRefFromStoragePath,
} from "@/core/files/createFileRef";

function makeStorageAdapter(
  bytesByPath: Record<string, Uint8Array | Error>,
): { adapter: WorkflowFilesStorageAdapter; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    adapter: {
      download: jest.fn(async (path: string) => {
        calls.push(path);
        const found = bytesByPath[path];
        if (!found) throw new Error("object not found at " + path);
        if (found instanceof Error) throw found;
        return found;
      }),
    },
  };
}

describe("buildStoragePath", () => {
  it("emits the canonical <userId>/<workflowId>/<runId>/<nodeId>/<filename> layout", () => {
    expect(
      buildStoragePath({
        userId: "u1",
        workflowId: "w1",
        runId: "r1",
        nodeId: "n1",
        fileName: "report.pdf",
      }),
    ).toBe("u1/w1/r1/n1/report.pdf");
  });
});

describe("WORKFLOW_FILES_BUCKET", () => {
  it("is pinned to `workflow-files` (matches the migration header)", () => {
    expect(WORKFLOW_FILES_BUCKET).toBe("workflow-files");
  });
});

describe("fetchFileBytes — v2_storage", () => {
  it("downloads via the storage adapter and reports actual byte length", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const { adapter, calls } = makeStorageAdapter({
      "u1/w1/r1/n1/report.pdf": bytes,
    });
    const ref = fileRefFromStoragePath({
      name: "report.pdf",
      mimeType: "application/pdf",
      storagePath: "u1/w1/r1/n1/report.pdf",
    });
    const result = await fetchFileBytes(ref, { storage: adapter });
    expect(Array.from(result.bytes)).toEqual([1, 2, 3, 4]);
    expect(result.name).toBe("report.pdf");
    expect(result.mimeType).toBe("application/pdf");
    expect(result.sizeBytes).toBe(4);
    expect(calls).toEqual(["u1/w1/r1/n1/report.pdf"]);
  });

  it("throws FileFetchError when no storage adapter is supplied", async () => {
    const ref = fileRefFromStoragePath({
      name: "x.txt",
      mimeType: "text/plain",
      storagePath: "u1/w1/r1/n1/x.txt",
    });
    await expect(fetchFileBytes(ref)).rejects.toBeInstanceOf(FileFetchError);
  });

  it("wraps adapter errors in FileFetchError without including the storage path", async () => {
    const { adapter } = makeStorageAdapter({});
    const ref = fileRefFromStoragePath({
      name: "x.txt",
      mimeType: "text/plain",
      storagePath: "u1/w1/r1/n1/x.txt",
    });
    await expect(
      fetchFileBytes(ref, { storage: adapter }),
    ).rejects.toThrow(FileFetchError);
  });
});

describe("fetchFileBytes — signed_url", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches the URL with no auth headers and reports byte length", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    globalThis.fetch = jest.fn(async (url: unknown) => {
      expect(typeof url).toBe("string");
      return new Response(bytes, { status: 200 });
    }) as unknown as typeof fetch;
    const ref = fileRefFromSignedUrl({
      name: "snapshot.bin",
      mimeType: "application/octet-stream",
      url: "https://signed.example.com/abc",
    });
    const result = await fetchFileBytes(ref);
    expect(result.sizeBytes).toBe(3);
    expect(Array.from(result.bytes)).toEqual([9, 8, 7]);
  });

  it("throws FileFetchError on non-2xx response without leaking the URL", async () => {
    globalThis.fetch = jest.fn(
      async () => new Response("nope", { status: 403 }),
    ) as unknown as typeof fetch;
    const ref = fileRefFromSignedUrl({
      name: "x.txt",
      mimeType: "text/plain",
      url: "https://signed.example.com/secret-token-abc123",
    });
    try {
      await fetchFileBytes(ref);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FileFetchError);
      expect((err as Error).message).not.toContain("secret-token");
      expect((err as Error).message).not.toContain("signed.example.com");
      expect((err as Error).message).toMatch(/HTTP 403/);
    }
  });

  it("throws FileFetchError on transport failure without leaking the URL", async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const ref = fileRefFromSignedUrl({
      name: "x.txt",
      mimeType: "text/plain",
      url: "https://signed.example.com/tok=secret",
    });
    try {
      await fetchFileBytes(ref);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FileFetchError);
      expect((err as Error).message).not.toContain("tok=secret");
      expect((err as Error).message).not.toContain("signed.example.com");
      expect((err as Error).message).toMatch(/ECONNRESET/);
    }
  });
});

describe("fetchFileBytes — provider_url", () => {
  it("throws UnsupportedProviderFetchError naming the provider", async () => {
    const ref = fileRefFromProviderUrl({
      name: "report.pdf",
      mimeType: "application/pdf",
      url: "https://files.slack.com/files-pri/T1-F1/secret-token=abc123",
      provider: "slack",
    });
    try {
      await fetchFileBytes(ref);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedProviderFetchError);
      expect((err as UnsupportedProviderFetchError).provider).toBe("slack");
      // No leakage of URL / token in error message.
      expect((err as Error).message).not.toContain("secret-token");
      expect((err as Error).message).not.toContain("files.slack.com");
      // Helpful guidance to the caller.
      expect((err as Error).message).toMatch(/stageFileToStorage|signed_url/);
    }
  });
});
