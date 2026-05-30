/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockFilesList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-drive/api/filesList", () => ({
  filesList: (...args: unknown[]) => mockFilesList(...args),
}));

import { listFiles } from "@/integrations/google-drive/actions/listFiles";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockFilesList.mockReset();
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

describe("listFiles action", () => {
  it("forwards folderId, pageSize, includeTrashed, pageToken to the wrapper", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockFilesList.mockResolvedValue({ files: [], nextPageToken: undefined });

    await listFiles({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        folderId: "fld-A",
        pageSize: 25,
        includeTrashed: true,
        pageToken: "pg-1",
      },
      triggerEvent: trigger(),
    });

    expect(mockFilesList).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "t",
        folderId: "fld-A",
        pageSize: 25,
        includeTrashed: true,
        pageToken: "pg-1",
      }),
    );
  });

  it("uses pageSize default of 100 and includeTrashed default false", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockFilesList.mockResolvedValue({ files: [] });

    await listFiles({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });

    expect(mockFilesList).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSize: 100,
        includeTrashed: false,
      }),
    );
  });

  it("surfaces nextPageToken + incompleteSearch in output", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockFilesList.mockResolvedValue({
      files: [{ id: "f-1", name: "a.txt" }],
      nextPageToken: "pg-2",
      incompleteSearch: true,
    });

    const result = await listFiles({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });

    expect(result.output.files).toEqual([{ id: "f-1", name: "a.txt" }]);
    expect(result.output.nextPageToken).toBe("pg-2");
    expect(result.output.incompleteSearch).toBe(true);
  });

  it("rejects pageSize > 1000 and < 1", async () => {
    await expect(
      listFiles({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { pageSize: 1001 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();

    await expect(
      listFiles({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { pageSize: 0 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
