/**
 * @jest-environment node
 *
 * google-drive/triggers/fileChanged trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockChangesGetStartPageToken = jest.fn();
const mockFilesWatch = jest.fn();
const mockBuildChannelToken = jest.fn();
const mockChannelsStop = jest.fn();
const mockChangesList = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-drive/api/changesGetStartPageToken", () => ({
  changesGetStartPageToken: (...args: unknown[]) =>
    mockChangesGetStartPageToken(...args),
}));

jest.mock("@/integrations/google-drive/api/filesWatch", () => ({
  filesWatch: (...args: unknown[]) => mockFilesWatch(...args),
}));

jest.mock("@/integrations/_shared/google/channelToken", () => ({
  buildChannelToken: (...args: unknown[]) => mockBuildChannelToken(...args),
}));

jest.mock("@/integrations/google-drive/api/channelsStop", () => ({
  channelsStop: (...args: unknown[]) => mockChannelsStop(...args),
}));

jest.mock("@/integrations/google-drive/api/changesList", () => ({
  changesList: (...args: unknown[]) => mockChangesList(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { activate } from "@/integrations/google-drive/triggers/fileChanged/activate";
import { NotFoundError, PageTokenExpiredError } from "@/integrations/google-drive/api/errors";
import { deactivate } from "@/integrations/google-drive/triggers/fileChanged/deactivate";
import { classifyChangeKind, classifyObjectKind, normalize } from "@/integrations/google-drive/triggers/fileChanged/normalize";
import type { DriveChangeEntry } from "@/integrations/google-drive/api/changesList";
import { pull } from "@/integrations/google-drive/triggers/fileChanged/pull";
import { driveFileChangedSubscriptionHandler } from "@/integrations/google-drive/triggers/fileChanged/renew";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockChangesGetStartPageToken.mockReset();
  mockFilesWatch.mockReset();
  mockBuildChannelToken.mockReset();
  mockBuildChannelToken.mockReturnValue("hmac-token");
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

const baseNode = {
  id: "node-trigger",
  kind: "trigger" as const,
  provider: "google-drive",
  type: "file_changed",
  config: {},
  position: { x: 0, y: 0 },
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "google-drive",
  providerAccountId: "alice@example.com",
  displayName: "alice@example.com",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Drive file_changed activate", () => {
  it("captures startPageToken then registers a files.watch", async () => {
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "page-100",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "channel-from-google",
      resourceId: "res-id",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const result = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockChangesGetStartPageToken).toHaveBeenCalledTimes(1);
    expect(mockFilesWatch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      type: "subscription-watch",
      webhookEnabled: true,
      fileId: "root",
      resourceId: "res-id",
      pageToken: "page-100",
    });
    expect(result.channelId).toMatch(
      /^chainreact-node-trigger-[0-9a-f-]+$/,
    );
    expect(typeof result.expiresAt).toBe("string");
  });

  it("uses the configured fileId when set (not 'root')", async () => {
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    const result = await activate({
      node: { ...baseNode, config: { fileId: "fld-A" } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.fileId).toBe("fld-A");
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("fld-A");
  });

  it("stores the literal 'root' string when config.fileId is unset", async () => {
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    const result = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(result.fileId).toBe("root");
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("root");
  });

  it("treats whitespace-only fileId as 'root' (no leaked surprise watch target)", async () => {
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: "1",
    });

    const result = await activate({
      node: { ...baseNode, config: { fileId: "   " } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.fileId).toBe("root");
  });

  it("passes HMAC channelToken on the watch request", async () => {
    mockBuildChannelToken.mockReturnValueOnce("the-real-hmac");
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockFilesWatch.mock.calls[0]![0].channelToken).toBe("the-real-hmac");
  });

  it("throws when getStartPageToken returns no token", async () => {
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "",
    });
    await expect(
      activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" }),
    ).rejects.toThrow(/no startPageToken/);
  });

  it("uses NEXT_PUBLIC_APP_URL for the webhook address", async () => {
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockFilesWatch.mock.calls[0]![0].webhookAddress).toBe(
      "https://app.example.test/api/webhooks/google-drive",
    );
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former deactivate.test.ts
// ---------------------------------------------------------------------------
describe("deactivate (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockChannelsStop.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "google-drive",
  eventType: "file_changed",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    channelId: "channel-1",
    resourceId: "res-1",
  },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "google-drive",
  providerAccountId: "alice@example.com",
  displayName: "alice@example.com",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Drive file_changed deactivate", () => {
  it("calls channels.stop with the stored channelId and resourceId", async () => {
    mockChannelsStop.mockResolvedValueOnce(undefined);

    await deactivate({ trigger: baseTrigger, integration: baseIntegration });

    expect(mockChannelsStop).toHaveBeenCalledTimes(1);
    expect(mockChannelsStop.mock.calls[0]![0]).toEqual({
      accessToken: "tok",
      channelId: "channel-1",
      resourceId: "res-1",
    });
  });

  it("swallows NotFoundError (channel already stopped)", async () => {
    mockChannelsStop.mockRejectedValueOnce(new NotFoundError("channel channel-1"));

    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("propagates non-404 errors so lifecycle.ts can log them", async () => {
    mockChannelsStop.mockRejectedValueOnce(new Error("HTTP 503"));

    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("is a no-op when config.type is not subscription-watch", async () => {
    const t = { ...baseTrigger, config: { ...baseTrigger.config, type: "something-else" } };
    await deactivate({ trigger: t, integration: baseIntegration });
    expect(mockChannelsStop).not.toHaveBeenCalled();
  });

  it("is a no-op when channelId or resourceId is missing", async () => {
    const t = { ...baseTrigger, config: { type: "subscription-watch" } };
    await deactivate({ trigger: t, integration: baseIntegration });
    expect(mockChannelsStop).not.toHaveBeenCalled();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

describe("classifyChangeKind", () => {
  it("classifies removed=true as removed regardless of file payload", () => {
    expect(
      classifyChangeKind({ removed: true, fileId: "f-1" } as DriveChangeEntry),
    ).toBe("removed");
  });

  it("classifies file.trashed=true as removed", () => {
    expect(
      classifyChangeKind({
        fileId: "f-1",
        file: { id: "f-1", trashed: true },
      } as DriveChangeEntry),
    ).toBe("removed");
  });

  it("classifies createdTime==modifiedTime as created", () => {
    expect(
      classifyChangeKind({
        fileId: "f-1",
        file: {
          id: "f-1",
          createdTime: "2026-05-08T10:00:00Z",
          modifiedTime: "2026-05-08T10:00:00Z",
        },
      } as DriveChangeEntry),
    ).toBe("created");
  });

  it("classifies createdTime != modifiedTime as updated", () => {
    expect(
      classifyChangeKind({
        fileId: "f-1",
        file: {
          id: "f-1",
          createdTime: "2026-05-08T10:00:00Z",
          modifiedTime: "2026-05-08T11:00:00Z",
        },
      } as DriveChangeEntry),
    ).toBe("updated");
  });

  it("falls back to updated when createdTime is missing", () => {
    expect(
      classifyChangeKind({
        fileId: "f-1",
        file: { id: "f-1", modifiedTime: "2026-05-08T11:00:00Z" },
      } as DriveChangeEntry),
    ).toBe("updated");
  });
});

describe("classifyObjectKind", () => {
  it("returns folder for the folder mimeType", () => {
    expect(
      classifyObjectKind({
        fileId: "f",
        file: { id: "f", mimeType: "application/vnd.google-apps.folder" },
      } as DriveChangeEntry),
    ).toBe("folder");
  });

  it("returns file for everything else (including Google Docs)", () => {
    expect(
      classifyObjectKind({
        fileId: "d",
        file: { id: "d", mimeType: "application/vnd.google-apps.document" },
      } as DriveChangeEntry),
    ).toBe("file");
  });

  it("returns file when mimeType is missing", () => {
    expect(
      classifyObjectKind({ fileId: "x" } as DriveChangeEntry),
    ).toBe("file");
  });
});

describe("normalize", () => {
  const ctx = { providerAccountId: "alice@example.test" };

  it("emits a TriggerEvent with correct shape for a created file", () => {
    const ev = normalize(
      {
        kind: "drive#change",
        changeType: "file",
        time: "2026-05-08T12:00:00Z",
        removed: false,
        fileId: "f-1",
        file: {
          id: "f-1",
          name: "report.pdf",
          mimeType: "application/pdf",
          parents: ["fld-A"],
          createdTime: "2026-05-08T12:00:00Z",
          modifiedTime: "2026-05-08T12:00:00Z",
          trashed: false,
          webViewLink: "https://drive.google.com/file/d/f-1",
        },
      },
      ctx,
    );

    expect(ev).not.toBeNull();
    expect(ev!.provider).toBe("google-drive");
    expect(ev!.eventType).toBe("file_changed");
    expect(ev!.eventId).toBe("f-1:2026-05-08T12:00:00Z");
    expect(ev!.occurredAt).toBe("2026-05-08T12:00:00Z");
    expect(ev!.providerAccountId).toBe("alice@example.test");
    expect(ev!.payload).toEqual({
      changeKind: "created",
      objectKind: "file",
      fileId: "f-1",
      name: "report.pdf",
      mimeType: "application/pdf",
      parents: ["fld-A"],
      webViewLink: "https://drive.google.com/file/d/f-1",
      modifiedTime: "2026-05-08T12:00:00Z",
      trashed: false,
      removed: false,
    });
  });

  it("emits removed change for a deleted file", () => {
    const ev = normalize(
      {
        changeType: "file",
        time: "2026-05-08T12:00:00Z",
        removed: true,
        fileId: "f-2",
      },
      ctx,
    );

    expect(ev!.payload.changeKind).toBe("removed");
    expect(ev!.payload.removed).toBe(true);
    expect(ev!.payload.fileId).toBe("f-2");
  });

  it("drops drive-level changes (changeType === 'drive')", () => {
    const ev = normalize(
      {
        changeType: "drive",
        time: "2026-05-08T12:00:00Z",
        fileId: "drive-1",
      },
      ctx,
    );
    expect(ev).toBeNull();
  });

  it("drops changes without a fileId", () => {
    const ev = normalize(
      { changeType: "file", time: "2026-05-08T12:00:00Z" },
      ctx,
    );
    expect(ev).toBeNull();
  });

  it("filters by folderId — keeps changes whose file has that folder as a parent", () => {
    const ev = normalize(
      {
        changeType: "file",
        time: "2026-05-08T12:00:00Z",
        fileId: "f-1",
        file: { id: "f-1", parents: ["fld-A", "fld-B"] },
      },
      { providerAccountId: "a@e.test", folderId: "fld-A" },
    );
    expect(ev).not.toBeNull();
  });

  it("filters by folderId — drops changes whose file has DIFFERENT parents", () => {
    const ev = normalize(
      {
        changeType: "file",
        time: "2026-05-08T12:00:00Z",
        fileId: "f-1",
        file: { id: "f-1", parents: ["fld-X"] },
      },
      { providerAccountId: "a@e.test", folderId: "fld-A" },
    );
    expect(ev).toBeNull();
  });

  it("filters by folderId — drops removed changes (no file payload to check parents)", () => {
    // Removed changes have no file metadata; we can't tell which folder
    // they belonged to. Dropping them is the safe choice — leaking deletion
    // noise from outside the configured folder would surprise authors.
    const ev = normalize(
      {
        changeType: "file",
        time: "2026-05-08T12:00:00Z",
        fileId: "f-1",
        removed: true,
      },
      { providerAccountId: "a@e.test", folderId: "fld-A" },
    );
    expect(ev).toBeNull();
  });

  it("eventId combines fileId + change.time so duplicates collapse via dedup", () => {
    const ev1 = normalize(
      {
        changeType: "file",
        time: "2026-05-08T12:00:00Z",
        fileId: "f-1",
        file: { id: "f-1" },
      },
      ctx,
    );
    const ev2 = normalize(
      {
        changeType: "file",
        time: "2026-05-08T12:00:00Z",
        fileId: "f-1",
        file: { id: "f-1" },
      },
      ctx,
    );
    expect(ev1!.eventId).toBe(ev2!.eventId);
  });

  it("eventId differs across distinct change times for the same file", () => {
    const ev1 = normalize(
      {
        changeType: "file",
        time: "2026-05-08T12:00:00Z",
        fileId: "f-1",
        file: { id: "f-1" },
      },
      ctx,
    );
    const ev2 = normalize(
      {
        changeType: "file",
        time: "2026-05-08T13:00:00Z",
        fileId: "f-1",
        file: { id: "f-1" },
      },
      ctx,
    );
    expect(ev1!.eventId).not.toBe(ev2!.eventId);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former pull.test.ts
// ---------------------------------------------------------------------------
describe("pull (lifecycle)", () => {

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
  workflowAccountId: "acct-1",
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
  providerAccountId: null,
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

});

// ---------------------------------------------------------------------------
// Merged from the former renew.test.ts
// ---------------------------------------------------------------------------
describe("renew (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockFilesWatch.mockReset();
  mockChannelsStop.mockReset();
  mockBuildChannelToken.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();

  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockBuildChannelToken.mockReturnValue("hmac-new");
  mockGetActiveForExecution.mockResolvedValue({
    id: "int-1",
    userId: "user-1",
    provider: "google-drive",
    providerAccountId: "alice@example.com",
  });
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "google-drive",
  eventType: "file_changed",
  nodeId: "node-trigger",
  config: {
    type: "subscription-watch",
    fileId: "root",
    channelId: "channel-old",
    resourceId: "res-old",
    pageToken: "page-keep",
    expiresAt: "2026-05-15T00:00:00Z",
  },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("driveFileChangedSubscriptionHandler", () => {
  it("canHandle accepts a Drive file_changed subscription-watch row", () => {
    expect(
      driveFileChangedSubscriptionHandler.canHandle(baseTrigger),
    ).toBe(true);
  });

  it("canHandle rejects rows from other providers", () => {
    expect(
      driveFileChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        provider: "google-calendar",
      }),
    ).toBe(false);
  });

  it("canHandle rejects subscription-watch rows of different eventType", () => {
    expect(
      driveFileChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        eventType: "other_type",
      }),
    ).toBe(false);
  });

  it("getRenewalThresholdMs returns 24h", () => {
    expect(driveFileChangedSubscriptionHandler.getRenewalThresholdMs()).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it("renew creates new channel against same fileId, stops old, persists with pageToken untouched", async () => {
    mockFilesWatch.mockResolvedValueOnce({
      id: "channel-new",
      resourceId: "res-new",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    mockChannelsStop.mockResolvedValueOnce(undefined);

    await driveFileChangedSubscriptionHandler.renew({ trigger: baseTrigger });

    // Watch first, against the same fileId we activated with.
    expect(mockFilesWatch).toHaveBeenCalledTimes(1);
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("root");
    expect(mockFilesWatch.mock.calls[0]![0].channelToken).toBe("hmac-new");

    // Then stop old.
    expect(mockChannelsStop).toHaveBeenCalledTimes(1);
    expect(mockChannelsStop.mock.calls[0]![0]).toEqual({
      accessToken: "tok",
      channelId: "channel-old",
      resourceId: "res-old",
    });

    // Persist: pageToken unchanged, channelId rotated, expiresAt updated.
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [id, persisted] = mockUpdateConfig.mock.calls[0]!;
    expect(id).toBe("tr-1");
    expect((persisted as Record<string, unknown>).pageToken).toBe("page-keep");
    expect((persisted as Record<string, unknown>).resourceId).toBe("res-new");
    expect((persisted as Record<string, unknown>).channelId).not.toBe("channel-old");
  });

  it("re-watches the same configured fileId (not 'root') when set on the trigger", async () => {
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: "1",
    });
    mockChannelsStop.mockResolvedValueOnce(undefined);

    const trigger = {
      ...baseTrigger,
      config: { ...baseTrigger.config, fileId: "fld-A" },
    };
    await driveFileChangedSubscriptionHandler.renew({ trigger });

    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("fld-A");
  });

  it("swallows old-channel NotFoundError and still persists", async () => {
    mockFilesWatch.mockResolvedValueOnce({
      id: "channel-new",
      resourceId: "res-new",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    mockChannelsStop.mockRejectedValueOnce(new NotFoundError("channel-old"));

    await expect(
      driveFileChangedSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).resolves.toBeUndefined();
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
  });

  it("logs (does not rethrow) other old-channel errors and still persists", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: "1",
    });
    mockChannelsStop.mockRejectedValueOnce(new Error("HTTP 500"));

    await expect(
      driveFileChangedSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).resolves.toBeUndefined();
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("throws when the integration row is missing", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);

    await expect(
      driveFileChangedSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/no active integration/);
  });
});

});
