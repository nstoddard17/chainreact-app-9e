/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockChangesList = jest.fn();
const mockChangesGetStartPageToken = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-drive/api/changesList", () => ({
  changesList: (...args: unknown[]) => mockChangesList(...args),
}));

jest.mock("@/integrations/google-drive/api/changesGetStartPageToken", () => ({
  changesGetStartPageToken: (...args: unknown[]) =>
    mockChangesGetStartPageToken(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { PageTokenExpiredError } from "@/integrations/google-drive/api/errors";
import { pull } from "@/integrations/google-drive/triggers/fileChanged/pull";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockChangesList.mockReset();
  mockChangesGetStartPageToken.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockGetActiveForExecution.mockResolvedValue({
    id: "int-1",
    userId: "user-1",
    provider: "google-drive",
    providerAccountId: "alice@example.com",
  });
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  userId: "user-1",
  provider: "google-drive",
  eventType: "file_changed",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    fileId: "root",
    pageToken: "page-1",
    channelId: "channel-1",
  },
  accountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("pull", () => {
  it("fetches the delta with stored pageToken and returns normalized events", async () => {
    mockChangesList.mockResolvedValueOnce({
      changes: [
        {
          changeType: "file",
          time: "2026-05-08T10:00:00Z",
          fileId: "f-1",
          file: {
            id: "f-1",
            name: "report.pdf",
            mimeType: "application/pdf",
            createdTime: "2026-05-08T10:00:00Z",
            modifiedTime: "2026-05-08T10:00:00Z",
            parents: ["root"],
          },
        },
      ],
      newStartPageToken: "page-2",
    });

    const result = await pull(baseTrigger);

    expect(mockChangesList.mock.calls[0]![0].pageToken).toBe("page-1");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.eventType).toBe("file_changed");
    expect(
      (result.events[0]!.payload as Record<string, unknown>).changeKind,
    ).toBe("created");
    expect(result.resyncRequired).toBe(false);

    // Persists the new pageToken from newStartPageToken.
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      "tr-1",
      expect.objectContaining({ pageToken: "page-2" }),
    );
  });

  it("paginates through nextPageToken until newStartPageToken arrives", async () => {
    mockChangesList
      .mockResolvedValueOnce({
        changes: [{ changeType: "file", time: "t1", fileId: "f-1" }],
        nextPageToken: "page-mid",
      })
      .mockResolvedValueOnce({
        changes: [{ changeType: "file", time: "t2", fileId: "f-2" }],
        newStartPageToken: "page-final",
      });

    const result = await pull(baseTrigger);

    expect(mockChangesList).toHaveBeenCalledTimes(2);
    // Second call uses page-mid as the pageToken.
    expect(mockChangesList.mock.calls[1]![0].pageToken).toBe("page-mid");
    expect(result.events).toHaveLength(2);
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      "tr-1",
      expect.objectContaining({ pageToken: "page-final" }),
    );
  });

  it("re-baselines on PageTokenExpiredError, persists new token, returns zero events", async () => {
    mockChangesList.mockRejectedValueOnce(new PageTokenExpiredError());
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "page-fresh",
    });

    const result = await pull(baseTrigger);

    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(true);
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      "tr-1",
      expect.objectContaining({ pageToken: "page-fresh" }),
    );
  });

  it("returns resyncRequired: true with empty events when pageToken is missing", async () => {
    const trigger = {
      ...baseTrigger,
      config: { ...baseTrigger.config, pageToken: undefined },
    };
    const result = await pull(trigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(true);
    expect(mockChangesList).not.toHaveBeenCalled();
  });

  it("returns empty result when integration is missing", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const result = await pull(baseTrigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(false);
    expect(mockChangesList).not.toHaveBeenCalled();
  });

  it("does not persist if pageToken did not advance", async () => {
    // newStartPageToken === stored pageToken means no movement; updateConfig
    // should NOT be called to avoid no-op writes.
    mockChangesList.mockResolvedValueOnce({
      changes: [],
      newStartPageToken: "page-1",
    });

    const result = await pull(baseTrigger);
    expect(result.events).toEqual([]);
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it("forwards folderId filter to normalize so off-folder changes are dropped", async () => {
    const trigger = {
      ...baseTrigger,
      config: { ...baseTrigger.config, folderId: "fld-A" },
    };
    mockChangesList.mockResolvedValueOnce({
      changes: [
        {
          changeType: "file",
          time: "t1",
          fileId: "f-1",
          file: { id: "f-1", parents: ["fld-X"] }, // not in fld-A
        },
        {
          changeType: "file",
          time: "t2",
          fileId: "f-2",
          file: { id: "f-2", parents: ["fld-A"] }, // in fld-A
        },
      ],
      newStartPageToken: "page-2",
    });

    const result = await pull(trigger);
    expect(result.events).toHaveLength(1);
    expect(
      (result.events[0]!.payload as Record<string, unknown>).fileId,
    ).toBe("f-2");
  });
});
