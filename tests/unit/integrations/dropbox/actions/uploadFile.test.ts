/**
 * @jest-environment node
 *
 * dropbox:upload_file — FileRef consumer. Verifies v2_storage/signed_url
 * resolution, provider_url rejection, path join, and structural output.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { FileRef } from "@/contracts/file";

const mockRefresh = jest.fn();
const mockFetchBytes = jest.fn();
const mockUpload = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...a: unknown[]) => mockRefresh(...a),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/core/files/fetchFileBytes", () => ({
  ...jest.requireActual("@/core/files/fetchFileBytes"),
  fetchFileBytes: (...a: unknown[]) => mockFetchBytes(...a),
}));
jest.mock("@/integrations/_shared/dropbox/api/filesUpload", () => ({
  filesUpload: (...a: unknown[]) => mockUpload(...a),
}));

import {
  uploadFile,
  DropboxUploadConfigError,
} from "@/integrations/dropbox/actions/uploadFile";

function input(file: FileRef, extra: Record<string, unknown> = {}) {
  const triggerEvent: TriggerEvent = {
    provider: "dropbox",
    eventType: "manual",
    eventId: "e",
    occurredAt: "2026-05-24T00:00:00Z",
    accountId: "dbid:1",
    payload: {},
  };
  return {
    workflowId: "wf",
    userId: "u",
    runId: "r",
    nodeId: "n",
    config: { file, ...extra },
    triggerEvent,
  };
}

const v2Ref: FileRef = {
  kind: "v2_storage",
  name: "a.txt",
  mimeType: "text/plain",
  storagePath: "u/wf/r/n/a.txt",
};
const signedRef: FileRef = {
  kind: "signed_url",
  name: "b.txt",
  mimeType: "text/plain",
  url: "https://example.test/signed",
};
const providerRef: FileRef = {
  kind: "provider_url",
  name: "c.txt",
  mimeType: "text/plain",
  url: "https://example.test/p",
  provider: "slack",
};

beforeEach(() => {
  mockRefresh.mockReset();
  mockFetchBytes.mockReset();
  mockUpload.mockReset();
  mockRefresh.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockUpload.mockResolvedValue({
    id: "id:1",
    name: "a.txt",
    path_display: "/a.txt",
    size: 2,
    rev: "rev1",
  });
});

describe("dropbox upload_file — FileRef consumer", () => {
  it("resolves a v2_storage ref and uploads to the joined path; structural output only", async () => {
    mockFetchBytes.mockResolvedValueOnce({
      bytes: new Uint8Array([1, 2]),
      name: "a.txt",
      mimeType: "text/plain",
      sizeBytes: 2,
    });
    const res = await uploadFile(input(v2Ref));
    expect(mockUpload.mock.calls[0]![0]).toMatchObject({
      path: "/a.txt",
      mode: "add",
    });
    expect(res.output).toEqual({
      id: "id:1",
      name: "a.txt",
      path: "/a.txt",
      sizeBytes: 2,
      rev: "rev1",
      clientModified: null,
      serverModified: null,
    });
    // No bytes / base64 in output.
    expect(JSON.stringify(res.output)).not.toContain("base64");
  });

  it("joins a destination folder + explicit filename", async () => {
    mockFetchBytes.mockResolvedValueOnce({
      bytes: new Uint8Array([1]),
      name: "a.txt",
      mimeType: "text/plain",
      sizeBytes: 1,
    });
    await uploadFile(input(v2Ref, { path: "/Reports", filename: "q1.pdf" }));
    expect(mockUpload.mock.calls[0]![0].path).toBe("/Reports/q1.pdf");
  });

  it("supports signed_url refs (no storage adapter needed)", async () => {
    mockFetchBytes.mockResolvedValueOnce({
      bytes: new Uint8Array([7]),
      name: "b.txt",
      mimeType: "text/plain",
      sizeBytes: 1,
    });
    const res = await uploadFile(input(signedRef));
    expect(res.output.id).toBe("id:1");
    // Storage adapter omitted for signed_url.
    expect(mockFetchBytes.mock.calls[0]![1]).toEqual({});
  });

  it("REJECTS provider_url refs with a structured config error (parity with monday:add_file)", async () => {
    await expect(uploadFile(input(providerRef))).rejects.toBeInstanceOf(
      DropboxUploadConfigError,
    );
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockFetchBytes).not.toHaveBeenCalled();
  });

  it("honors mode=overwrite when supplied", async () => {
    mockFetchBytes.mockResolvedValueOnce({
      bytes: new Uint8Array([1]),
      name: "a.txt",
      mimeType: "text/plain",
      sizeBytes: 1,
    });
    await uploadFile(input(v2Ref, { mode: "overwrite" }));
    expect(mockUpload.mock.calls[0]![0].mode).toBe("overwrite");
  });
});
