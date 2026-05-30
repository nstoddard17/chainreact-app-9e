/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockFilesWatch = jest.fn();
const mockChannelsStop = jest.fn();
const mockBuildChannelToken = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-drive/api/filesWatch", () => ({
  filesWatch: (...args: unknown[]) => mockFilesWatch(...args),
}));

jest.mock("@/integrations/google-drive/api/channelsStop", () => ({
  channelsStop: (...args: unknown[]) => mockChannelsStop(...args),
}));

jest.mock("@/integrations/_shared/google/channelToken", () => ({
  buildChannelToken: (...args: unknown[]) => mockBuildChannelToken(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { NotFoundError } from "@/integrations/google-drive/api/errors";
import { sheetsRowChangedSubscriptionHandler } from "@/integrations/google-sheets/triggers/rowChanged/renew";

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
    provider: "google-sheets",
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
  provider: "google-sheets",
  eventType: "row_changed",
  nodeId: "node-trigger",
  config: {
    type: "subscription-watch",
    spreadsheetId: "ss-1",
    sheetName: "Sheet1",
    channelId: "channel-old",
    resourceId: "res-old",
    pageToken: "page-keep",
    lastRowCount: 7,
    expiresAt: "2026-05-15T00:00:00Z",
  },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("sheetsRowChangedSubscriptionHandler", () => {
  it("canHandle accepts a Sheets row_changed subscription-watch row", () => {
    expect(
      sheetsRowChangedSubscriptionHandler.canHandle(baseTrigger),
    ).toBe(true);
  });

  it("canHandle rejects rows from other providers", () => {
    expect(
      sheetsRowChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        provider: "google-drive",
      }),
    ).toBe(false);
  });

  it("canHandle rejects subscription-watch rows of different eventType", () => {
    expect(
      sheetsRowChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        eventType: "other_type",
      }),
    ).toBe(false);
  });

  it("getRenewalThresholdMs returns 24h", () => {
    expect(sheetsRowChangedSubscriptionHandler.getRenewalThresholdMs()).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it("renew creates new channel against same spreadsheetId, stops old, persists with lastRowCount untouched", async () => {
    mockFilesWatch.mockResolvedValueOnce({
      id: "channel-new",
      resourceId: "res-new",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    mockChannelsStop.mockResolvedValueOnce(undefined);

    await sheetsRowChangedSubscriptionHandler.renew({ trigger: baseTrigger });

    // Watch first, against the same spreadsheetId we activated with.
    expect(mockFilesWatch).toHaveBeenCalledTimes(1);
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("ss-1");
    expect(mockFilesWatch.mock.calls[0]![0].channelToken).toBe("hmac-new");

    // Then stop old.
    expect(mockChannelsStop).toHaveBeenCalledTimes(1);
    expect(mockChannelsStop.mock.calls[0]![0]).toEqual({
      accessToken: "tok",
      channelId: "channel-old",
      resourceId: "res-old",
    });

    // Persist: lastRowCount + sheetName + pageToken untouched, channelId rotated.
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [id, persisted] = mockUpdateConfig.mock.calls[0]!;
    expect(id).toBe("tr-1");
    const cfg = persisted as Record<string, unknown>;
    expect(cfg.lastRowCount).toBe(7);
    expect(cfg.sheetName).toBe("Sheet1");
    expect(cfg.pageToken).toBe("page-keep");
    expect(cfg.resourceId).toBe("res-new");
    expect(cfg.channelId).not.toBe("channel-old");
  });

  it("swallows old-channel NotFoundError and still persists", async () => {
    mockFilesWatch.mockResolvedValueOnce({
      id: "channel-new",
      resourceId: "res-new",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    mockChannelsStop.mockRejectedValueOnce(new NotFoundError("channel-old"));

    await expect(
      sheetsRowChangedSubscriptionHandler.renew({ trigger: baseTrigger }),
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
      sheetsRowChangedSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).resolves.toBeUndefined();
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("throws when the integration row is missing", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);

    await expect(
      sheetsRowChangedSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/no active integration/);
  });

  it("throws when config is missing spreadsheetId", async () => {
    const trigger = {
      ...baseTrigger,
      config: { ...baseTrigger.config, spreadsheetId: undefined },
    };
    await expect(
      sheetsRowChangedSubscriptionHandler.renew({ trigger }),
    ).rejects.toThrow(/spreadsheetId/);
  });
});
