/**
 * @jest-environment node
 *
 * Tests for the WorkflowFilesStorageAdapter factory. Mocks the
 * service-role Supabase client so we exercise the bucket / download
 * contract + error surfacing without touching real Supabase.
 *
 * Used by Outlook Mail 2.1 Commit 4 (send_email attachments) and
 * future FileRef consumers (Outlook 2.3 get_attachment, Gmail / Drive /
 * OneDrive attachment chains).
 */

const mockDownload = jest.fn();
const mockFrom = jest.fn(() => ({ download: mockDownload }));
const mockGetServiceRoleClient = jest.fn();

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: (reason: string) => mockGetServiceRoleClient(reason),
}));

import { createWorkflowFilesStorageAdapter } from "@/services/files/createWorkflowFilesStorageAdapter";
import { WORKFLOW_FILES_BUCKET } from "@/core/files/fetchFileBytes";

beforeEach(() => {
  mockDownload.mockReset();
  mockFrom.mockClear();
  mockGetServiceRoleClient.mockReset();
  mockGetServiceRoleClient.mockReturnValue({
    storage: { from: mockFrom },
  });
});

describe("createWorkflowFilesStorageAdapter", () => {
  it("constructs the service-role client with the provided reason", () => {
    createWorkflowFilesStorageAdapter({
      reason: "microsoft-outlook:send_email run=r1 node=n1",
    });

    expect(mockGetServiceRoleClient).toHaveBeenCalledWith(
      "microsoft-outlook:send_email run=r1 node=n1",
    );
  });

  it("downloads from the workflow-files bucket and returns Uint8Array bytes", async () => {
    const buf = new TextEncoder().encode("hello bytes");
    mockDownload.mockResolvedValue({
      data: new Blob([buf]),
      error: null,
    });

    const adapter = createWorkflowFilesStorageAdapter({ reason: "test" });
    const result = await adapter.download("user-1/wf-1/r-1/n-1/file.txt");

    expect(mockFrom).toHaveBeenCalledWith(WORKFLOW_FILES_BUCKET);
    expect(mockDownload).toHaveBeenCalledWith(
      "user-1/wf-1/r-1/n-1/file.txt",
    );
    expect(result).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(result)).toBe("hello bytes");
  });

  it("propagates the Supabase error.message without including the storage path", async () => {
    mockDownload.mockResolvedValue({
      data: null,
      error: { message: "Object not found" },
    });

    const adapter = createWorkflowFilesStorageAdapter({ reason: "test" });

    await expect(
      adapter.download("user-1/wf-1/r-1/n-1/missing.txt"),
    ).rejects.toThrow(/Object not found/);
    // The error message must not echo the storage path.
    await expect(
      adapter.download("user-1/wf-1/r-1/n-1/missing.txt"),
    ).rejects.not.toThrow(/user-1\/wf-1/);
  });

  it("throws a generic 'no data' message when Supabase returns null data without an error", async () => {
    mockDownload.mockResolvedValue({ data: null, error: null });

    const adapter = createWorkflowFilesStorageAdapter({ reason: "test" });

    await expect(adapter.download("anything")).rejects.toThrow(/no data/);
  });

  it("rejects when the storage client itself throws (unexpected network failure)", async () => {
    mockDownload.mockRejectedValue(new Error("network down"));

    const adapter = createWorkflowFilesStorageAdapter({ reason: "test" });

    await expect(adapter.download("path")).rejects.toThrow(/network down/);
  });
});
