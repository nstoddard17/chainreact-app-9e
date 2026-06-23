/**
 * @jest-environment node
 *
 * google-drive:get_file_metadata — read-only single-file metadata.
 *
 * Business rules under test:
 *   - forwards fileId + a bounded fields mask to the filesGet wrapper;
 *   - output is a bounded projection (only the declared metadata keys),
 *     never a spread of the raw Drive resource — so extra/sensitive
 *     provider fields (owners, permissions, capabilities) cannot leak;
 *   - strict schema rejects a missing/empty fileId before any API call;
 *   - provider 401 propagates (refreshAndRetry owns the refresh contract).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockFilesGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-drive/api/filesGet", () => ({
  filesGet: (...args: unknown[]) => mockFilesGet(...args),
}));

import { getFileMetadata } from "@/integrations/google-drive/actions/getFileMetadata";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockFilesGet.mockReset();
});

function trigger(): TriggerEvent {
  return {
    provider: "google-drive",
    eventType: "file_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    providerAccountId: "alice@example.test",
    payload: {},
  };
}

function baseInput(config: Record<string, unknown>) {
  return {
    workflowId: "wf",
    userId: "u",
    accountId: "acct-u",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: trigger(),
  };
}

describe("getFileMetadata action", () => {
  it("forwards the fileId and a bounded fields mask to filesGet", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("tok"));
    mockFilesGet.mockResolvedValue({ id: "file-1", name: "report.pdf" });

    await getFileMetadata(baseInput({ fileId: "file-1" }));

    expect(mockFilesGet).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "tok", fileId: "file-1" }),
    );
    const passed = mockFilesGet.mock.calls[0]![0] as { fields: string };
    // Bounded mask — must NOT request owners / permissions / capabilities.
    expect(passed.fields).not.toMatch(/owners|permissions|capabilities/);
    // ...but DOES request parents (bounded, non-sensitive folder ids).
    expect(passed.fields).toMatch(/\bparents\b/);
  });

  it("returns a bounded projection and does NOT spread raw provider fields", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("tok"));
    mockFilesGet.mockResolvedValue({
      id: "file-1",
      name: "report.pdf",
      mimeType: "application/pdf",
      size: "20480",
      createdTime: "2026-05-01T00:00:00Z",
      modifiedTime: "2026-05-08T00:00:00Z",
      webViewLink: "https://drive.google.com/file/d/file-1/view",
      trashed: false,
      // Hostile extras the wrapper might surface — must NOT reach output.
      owners: [{ emailAddress: "alice@example.test" }],
      permissions: [{ id: "perm-1" }],
      capabilities: { canDownload: true },
    });

    const result = await getFileMetadata(baseInput({ fileId: "file-1" }));

    expect(result.output).toEqual({
      id: "file-1",
      name: "report.pdf",
      mimeType: "application/pdf",
      size: "20480",
      createdTime: "2026-05-01T00:00:00Z",
      modifiedTime: "2026-05-08T00:00:00Z",
      webViewLink: "https://drive.google.com/file/d/file-1/view",
      trashed: false,
      parents: [], // surfaced (empty when the mock omits it); non-sensitive folder ids
    });
    expect(result.output).not.toHaveProperty("owners");
    expect(result.output).not.toHaveProperty("permissions");
    expect(result.output).not.toHaveProperty("capabilities");
  });

  it("surfaces null for absent optional fields and a non-string size", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("tok"));
    // Native Google types omit size; Drive sometimes returns it absent.
    mockFilesGet.mockResolvedValue({ id: "doc-1", mimeType: "application/vnd.google-apps.document" });

    const result = await getFileMetadata(baseInput({ fileId: "doc-1" }));

    expect(result.output.size).toBeNull();
    expect(result.output.name).toBeNull();
    expect(result.output.webViewLink).toBeNull();
    expect(result.output.trashed).toBe(false);
    expect(result.output.parents).toEqual([]); // defaults to [] when absent
  });

  it("rejects a missing fileId before calling the provider", async () => {
    await expect(getFileMetadata(baseInput({}))).rejects.toThrow();
    expect(mockFilesGet).not.toHaveBeenCalled();
  });

  it("rejects an empty fileId before calling the provider", async () => {
    await expect(getFileMetadata(baseInput({ fileId: "" }))).rejects.toThrow();
    expect(mockFilesGet).not.toHaveBeenCalled();
  });

  it("propagates a provider 401 (refreshAndRetry owns the refresh contract)", async () => {
    mockRefreshAndRetry.mockRejectedValue(new Error("Google Drive files.get returned HTTP 401"));

    await expect(getFileMetadata(baseInput({ fileId: "file-1" }))).rejects.toThrow(/401/);
  });
});
