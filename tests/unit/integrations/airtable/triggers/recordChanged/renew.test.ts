/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockWebhooksRefresh = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/airtable/api/webhooks", () => ({
  webhooksCreate: jest.fn(),
  webhooksDelete: jest.fn(),
  webhooksRefresh: (...args: unknown[]) => mockWebhooksRefresh(...args),
  webhooksListPayloads: jest.fn(),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { airtableRecordChangedSubscriptionHandler } from "@/integrations/airtable/triggers/recordChanged/renew";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockWebhooksRefresh.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(config: Record<string, unknown>) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "airtable",
    eventType: "record_changed",
    nodeId: "n-1",
    config,
    providerAccountId: "usrXXX",
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("airtableRecordChangedSubscriptionHandler", () => {
  it("identifies the handler with a stable id", () => {
    expect(airtableRecordChangedSubscriptionHandler.id).toBe(
      "airtable:record_changed",
    );
  });

  it("canHandle: matches airtable + record_changed + subscription-watch", () => {
    const t = trigger({ type: "subscription-watch" });
    expect(airtableRecordChangedSubscriptionHandler.canHandle(t)).toBe(true);
  });

  it("canHandle: rejects other providers", () => {
    const t = { ...trigger({ type: "subscription-watch" }), provider: "notion" };
    expect(airtableRecordChangedSubscriptionHandler.canHandle(t)).toBe(false);
  });

  it("canHandle: rejects polling triggers (different config.type)", () => {
    const t = trigger({ type: "polling" });
    expect(airtableRecordChangedSubscriptionHandler.canHandle(t)).toBe(false);
  });

  it("getRenewalThresholdMs returns 6 days", () => {
    expect(
      airtableRecordChangedSubscriptionHandler.getRenewalThresholdMs(),
    ).toBe(6 * 24 * 60 * 60 * 1000);
  });
});

describe("airtableRecordChangedSubscriptionHandler.renew", () => {
  it("calls webhooksRefresh and persists the new expiresAt", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce({
      id: "int-1",
      userId: "user-1",
      providerAccountId: "usrXXX",
    });
    mockWebhooksRefresh.mockResolvedValueOnce({
      expirationTime: "2026-05-23T00:00:00.000Z",
    });
    const t = trigger({
      type: "subscription-watch",
      baseId: "appBASE",
      webhookId: "achWEBHOOK",
      macSecretBase64: "secret",
      lastCursor: 5,
    });

    await airtableRecordChangedSubscriptionHandler.renew({ trigger: t });

    expect(mockWebhooksRefresh).toHaveBeenCalledWith({
      accessToken: "tok",
      baseId: "appBASE",
      webhookId: "achWEBHOOK",
    });
    // updateConfig must preserve all other config fields and set new expiresAt.
    expect(mockUpdateConfig).toHaveBeenCalledWith("tr-1", {
      type: "subscription-watch",
      baseId: "appBASE",
      webhookId: "achWEBHOOK",
      macSecretBase64: "secret",
      lastCursor: 5,
      expiresAt: "2026-05-23T00:00:00.000Z",
    });
  });

  it("throws when config is missing baseId or webhookId", async () => {
    const t = trigger({ type: "subscription-watch", baseId: "appBASE" });
    await expect(
      airtableRecordChangedSubscriptionHandler.renew({ trigger: t }),
    ).rejects.toThrow(/missing baseId or webhookId/);
  });

  it("throws when no active integration is found", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const t = trigger({
      type: "subscription-watch",
      baseId: "appBASE",
      webhookId: "achWEBHOOK",
    });
    await expect(
      airtableRecordChangedSubscriptionHandler.renew({ trigger: t }),
    ).rejects.toThrow(/no active integration/);
    expect(mockWebhooksRefresh).not.toHaveBeenCalled();
  });
});
