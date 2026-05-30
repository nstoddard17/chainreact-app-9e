/**
 * @jest-environment node
 */
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();
const mockRefreshAndRetry = jest.fn();
const mockDriveItemsGet = jest.fn();
const mockDriveRootDelta = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-onedrive/api/driveItemsGet", () => ({
  driveItemsGet: (...args: unknown[]) => mockDriveItemsGet(...args),
}));

jest.mock("@/integrations/microsoft-onedrive/api/driveRootDelta", () => ({
  driveRootDelta: (...args: unknown[]) => mockDriveRootDelta(...args),
}));

import { pull } from "@/integrations/microsoft-onedrive/triggers/fileChanged/pull";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();
  mockRefreshAndRetry.mockReset();
  mockDriveItemsGet.mockReset();
  mockDriveRootDelta.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "microsoft-onedrive",
  eventType: "file_changed",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-1",
    clientState: "deadbeef",
    resource: "/me/drive/root",
    changeType: "updated",
    deltaToken: "https://graph/x?token=t",
    expiresAt: "2026-05-09T12:00:00.000Z",
  },
  providerAccountId: "alice@contoso.com",
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
  provider: "microsoft-onedrive",
  providerAccountId: "alice@contoso.com",
  displayName: "alice@contoso.com",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

const NOTIFICATION_OCCURRED_AT = "2026-05-09T12:00:00.000Z";

describe("pull — id-fetch branch", () => {
  it("GETs the item and emits a normalized event", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDriveItemsGet.mockResolvedValueOnce({
      id: "item-1",
      name: "report.pdf",
      file: { mimeType: "application/pdf" },
      lastModifiedDateTime: "2026-05-09T11:00:00Z",
    });

    const result = await pull(
      baseTrigger,
      { kind: "id-fetch", itemId: "item-1" },
      NOTIFICATION_OCCURRED_AT,
    );

    expect(mockDriveItemsGet).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "tok", itemId: "item-1" }),
    );
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.payload.itemId).toBe("item-1");
    expect(result.events[0]!.payload.source).toBe("id-fetch");
  });

  it("emits a deleted-minimal event when driveItemsGet returns NotFoundError", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDriveItemsGet.mockRejectedValueOnce(
      new NotFoundError("driveItem gone"),
    );

    const result = await pull(
      baseTrigger,
      { kind: "id-fetch", itemId: "gone" },
      NOTIFICATION_OCCURRED_AT,
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.payload.deleted).toBe(true);
    expect(result.events[0]!.payload.itemId).toBe("gone");
    expect(result.events[0]!.payload.kind).toBeNull();
  });

  it("propagates non-NotFound errors so route returns 5xx and Microsoft retries", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDriveItemsGet.mockRejectedValueOnce(
      new Error("Microsoft Graph me/drive/items/{id} GET failed: HTTP 503"),
    );

    await expect(
      pull(
        baseTrigger,
        { kind: "id-fetch", itemId: "i" },
        NOTIFICATION_OCCURRED_AT,
      ),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("returns no events (no throw) when no active integration row exists", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const result = await pull(
      baseTrigger,
      { kind: "id-fetch", itemId: "i" },
      NOTIFICATION_OCCURRED_AT,
    );
    expect(result.events).toEqual([]);
    expect(mockDriveItemsGet).not.toHaveBeenCalled();
  });
});

describe("pull — delta-fallback branch", () => {
  it("calls driveRootDelta with the persisted deltaToken and persists the new deltaLink", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDriveRootDelta.mockResolvedValueOnce({
      items: [
        {
          id: "i-1",
          name: "new.txt",
          file: { mimeType: "text/plain" },
          lastModifiedDateTime: "2026-05-09T11:30:00Z",
        },
      ],
      deltaLink: "https://graph/x?token=next",
    });

    const result = await pull(
      baseTrigger,
      { kind: "delta-fallback" },
      NOTIFICATION_OCCURRED_AT,
    );

    expect(mockDriveRootDelta).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "tok",
        nextLink: "https://graph/x?token=t",
      }),
    );
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.payload.source).toBe("delta-fallback");
    expect(mockUpdateConfig).toHaveBeenCalledWith("tr-1", {
      ...baseTrigger.config,
      deltaToken: "https://graph/x?token=next",
    });
  });

  it("emits a deleted event for delta entries with a deleted facet", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDriveRootDelta.mockResolvedValueOnce({
      items: [
        { id: "live", name: "live.txt", file: {}, lastModifiedDateTime: "1" },
        { id: "dead", deleted: { state: "deleted" } },
      ],
      deltaLink: "https://graph/x?token=next",
    });

    const result = await pull(
      baseTrigger,
      { kind: "delta-fallback" },
      NOTIFICATION_OCCURRED_AT,
    );

    expect(result.events).toHaveLength(2);
    expect(result.events[0]!.payload.deleted).toBeUndefined();
    expect(result.events[1]!.payload.deleted).toBe(true);
    expect(result.events[1]!.payload.itemId).toBe("dead");
  });

  it("re-baselines and emits zero events when Graph returns resyncRequired (410)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDriveRootDelta
      .mockRejectedValueOnce(
        new Error(
          "Microsoft Graph me/drive/root/delta failed: resyncRequired",
        ),
      )
      .mockResolvedValueOnce({
        items: [],
        deltaLink: "https://graph/x?token=fresh",
      });

    const result = await pull(
      baseTrigger,
      { kind: "delta-fallback" },
      NOTIFICATION_OCCURRED_AT,
    );

    expect(result.events).toEqual([]);
    expect(mockUpdateConfig).toHaveBeenCalledWith("tr-1", {
      ...baseTrigger.config,
      deltaToken: "https://graph/x?token=fresh",
    });
  });

  it("re-baselines silently when the persisted deltaToken is missing (defensive)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDriveRootDelta.mockResolvedValueOnce({
      items: [],
      deltaLink: "https://graph/x?token=fresh-baseline",
    });

    const triggerWithoutToken = {
      ...baseTrigger,
      config: { ...baseTrigger.config, deltaToken: undefined },
    };

    const result = await pull(
      triggerWithoutToken,
      { kind: "delta-fallback" },
      NOTIFICATION_OCCURRED_AT,
    );

    expect(result.events).toEqual([]);
    // The driveRootDelta call was made WITHOUT a nextLink (baseline mode).
    expect(mockDriveRootDelta).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "tok" }),
    );
    expect(
      mockDriveRootDelta.mock.calls[0]![0].nextLink,
    ).toBeUndefined();
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      "tr-1",
      expect.objectContaining({
        deltaToken: "https://graph/x?token=fresh-baseline",
      }),
    );
  });

  it("propagates non-resyncRequired delta errors", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDriveRootDelta.mockRejectedValueOnce(
      new Error("Microsoft Graph me/drive/root/delta failed: HTTP 503"),
    );

    await expect(
      pull(
        baseTrigger,
        { kind: "delta-fallback" },
        NOTIFICATION_OCCURRED_AT,
      ),
    ).rejects.toThrow(/HTTP 503/);
  });
});

describe("pull — common", () => {
  it("returns no events (no throw) when subscriptionId is missing from config", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    const result = await pull(
      {
        ...baseTrigger,
        config: { ...baseTrigger.config, subscriptionId: undefined },
      },
      { kind: "id-fetch", itemId: "i" },
      NOTIFICATION_OCCURRED_AT,
    );
    expect(result.events).toEqual([]);
  });
});
