/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockFilesGet = jest.fn();
const mockFilesUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-drive/api/filesGet", () => ({
  filesGet: (...args: unknown[]) => mockFilesGet(...args),
}));

jest.mock("@/integrations/google-drive/api/filesUpdate", () => ({
  filesUpdate: (...args: unknown[]) => mockFilesUpdate(...args),
}));

import { moveFile } from "@/integrations/google-drive/actions/moveFile";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockFilesGet.mockReset();
  mockFilesUpdate.mockReset();
});

function trigger(): TriggerEvent {
  return {
    provider: "google-drive",
    eventType: "file_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    accountId: "alice@example.test",
    payload: {},
  };
}

describe("moveFile action", () => {
  it("reads existing parents via filesGet then PATCHes addParents+removeParents", async () => {
    mockRefreshAndRetry
      // first call resolves to filesGet result
      .mockImplementationOnce(async ({ apiCall }) => apiCall("t"))
      // second call resolves to filesUpdate result
      .mockImplementationOnce(async ({ apiCall }) => apiCall("t"));
    mockFilesGet.mockResolvedValue({
      id: "f-1",
      parents: ["fld-old"],
    });
    mockFilesUpdate.mockResolvedValue({
      id: "f-1",
      name: "doc.txt",
      parents: ["fld-new"],
      modifiedTime: "2026-05-08T12:00:00Z",
    });

    const result = await moveFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { fileId: "f-1", newParentFolderId: "fld-new" },
      triggerEvent: trigger(),
    });

    expect(mockFilesGet).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "f-1", fields: "id,parents" }),
    );
    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "f-1",
        addParents: "fld-new",
        removeParents: "fld-old",
        body: {},
      }),
    );
    expect(result.output).toEqual({
      fileId: "f-1",
      name: "doc.txt",
      parents: ["fld-new"],
      previousParents: ["fld-old"],
      modifiedTime: "2026-05-08T12:00:00Z",
    });
  });

  it("joins multiple existing parents with comma for removeParents", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockFilesGet.mockResolvedValue({
      id: "f-1",
      parents: ["fld-A", "fld-B"],
    });
    mockFilesUpdate.mockResolvedValue({ id: "f-1", parents: ["fld-new"] });

    await moveFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { fileId: "f-1", newParentFolderId: "fld-new" },
      triggerEvent: trigger(),
    });

    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ removeParents: "fld-A,fld-B" }),
    );
  });

  it("omits removeParents when the file has no current parents", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockFilesGet.mockResolvedValue({ id: "f-1", parents: [] });
    mockFilesUpdate.mockResolvedValue({ id: "f-1", parents: ["fld-new"] });

    await moveFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { fileId: "f-1", newParentFolderId: "fld-new" },
      triggerEvent: trigger(),
    });

    expect(mockFilesUpdate.mock.calls[0]![0].removeParents).toBeUndefined();
  });

  it("rejects empty fileId or newParentFolderId", async () => {
    await expect(
      moveFile({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { fileId: "", newParentFolderId: "fld-new" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/fileId is required/);

    await expect(
      moveFile({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { fileId: "f-1", newParentFolderId: "" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/newParentFolderId is required/);
  });
});
