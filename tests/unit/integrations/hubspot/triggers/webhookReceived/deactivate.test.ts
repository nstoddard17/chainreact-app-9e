/**
 * @jest-environment node
 */
const mockDeleteSub = jest.fn();
const mockDecrypt = jest.fn();
const mockRefsDeleteOne = jest.fn();
const mockRefsCount = jest.fn();
const mockAppSubsDelete = jest.fn();

jest.mock("@/integrations/_shared/hubspot/api/webhookSubscriptions", () => ({
  deleteWebhookSubscription: (...args: unknown[]) => mockDeleteSub(...args),
  createWebhookSubscription: jest.fn(),
}));

jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (v: string) => mockDecrypt(v),
}));

jest.mock("@/repositories/hubspotAppSubscriptions", () => ({
  deleteById: (...args: unknown[]) => mockAppSubsDelete(...args),
}));

jest.mock("@/repositories/hubspotSubscriptionRefs", () => ({
  deleteOne: (...args: unknown[]) => mockRefsDeleteOne(...args),
  countRefs: (...args: unknown[]) => mockRefsCount(...args),
}));

import { NotFoundError } from "@/integrations/_shared/hubspot/errors";
import { deactivate } from "@/integrations/hubspot/triggers/webhookReceived/deactivate";

beforeEach(() => {
  mockDeleteSub.mockReset();
  mockDecrypt.mockReset();
  mockRefsDeleteOne.mockReset();
  mockRefsCount.mockReset();
  mockAppSubsDelete.mockReset();
  mockDecrypt.mockImplementation((v: string) => `decrypted-${v}`);
});

const baseIntegration = {
  id: "int-1",
  userId: "user-1",
  provider: "hubspot",
  providerAccountId: "9988776",
  displayName: "Acme Hub",
  accessTokenEncrypted: "ENC-HUBSPOT",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

function trigger(
  subscriptions:
    | Array<{
        eventType: string;
        propertyName: string | null;
        appSubscriptionId: string;
        hubspotSubscriptionId: string;
      }>
    | undefined,
  appId: string | undefined = "11223344",
) {
  const config: Record<string, unknown> = {};
  if (subscriptions !== undefined) config.subscriptions = subscriptions;
  if (appId !== undefined) config.appId = appId;
  return {
    id: "tr-1",
    workflowId: "wf-1",
    userId: "user-1",
    provider: "hubspot",
    eventType: "webhook_received",
    nodeId: "node-1",
    config,
    accountId: "9988776",
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("HubSpot webhook_received deactivate — happy path", () => {
  it("removes only the ref when other refs still exist (refcount > 0)", async () => {
    mockRefsDeleteOne.mockResolvedValue({ id: "ref-1" });
    mockRefsCount.mockResolvedValue(2); // two other refs still active

    await deactivate({
      trigger: trigger([
        {
          eventType: "contact.creation",
          propertyName: null,
          appSubscriptionId: "app-sub-1",
          hubspotSubscriptionId: "hs-sub-aaa",
        },
      ]),
      integration: baseIntegration,
    });

    expect(mockRefsDeleteOne).toHaveBeenCalledTimes(1);
    expect(mockRefsCount).toHaveBeenCalledWith("app-sub-1");
    // NOT the last ref — neither HubSpot DELETE nor app sub delete fired.
    expect(mockDeleteSub).not.toHaveBeenCalled();
    expect(mockAppSubsDelete).not.toHaveBeenCalled();
  });

  it("deletes the HubSpot subscription and the parent app sub row when the last ref is removed", async () => {
    mockRefsDeleteOne.mockResolvedValue({ id: "ref-1" });
    mockRefsCount.mockResolvedValue(0);
    mockDeleteSub.mockResolvedValue(undefined);
    mockAppSubsDelete.mockResolvedValue(undefined);

    await deactivate({
      trigger: trigger([
        {
          eventType: "contact.creation",
          propertyName: null,
          appSubscriptionId: "app-sub-1",
          hubspotSubscriptionId: "hs-sub-aaa",
        },
      ]),
      integration: baseIntegration,
    });

    expect(mockDeleteSub).toHaveBeenCalledTimes(1);
    expect(mockDeleteSub.mock.calls[0]![0]).toMatchObject({
      accessToken: "decrypted-ENC-HUBSPOT",
      appId: "11223344",
      subscriptionId: "hs-sub-aaa",
    });
    expect(mockAppSubsDelete).toHaveBeenCalledWith("app-sub-1");
  });

  it("walks every entry in subscriptions[] independently", async () => {
    mockRefsDeleteOne.mockResolvedValue({ id: "ref" });
    mockRefsCount.mockResolvedValue(1); // never last ref — just verifying iteration

    await deactivate({
      trigger: trigger([
        {
          eventType: "contact.creation",
          propertyName: null,
          appSubscriptionId: "app-sub-A",
          hubspotSubscriptionId: "hs-A",
        },
        {
          eventType: "contact.propertyChange",
          propertyName: "email",
          appSubscriptionId: "app-sub-B",
          hubspotSubscriptionId: "hs-B",
        },
      ]),
      integration: baseIntegration,
    });

    expect(mockRefsDeleteOne).toHaveBeenCalledTimes(2);
    expect(mockRefsDeleteOne.mock.calls[0]![0].appSubscriptionId).toBe("app-sub-A");
    expect(mockRefsDeleteOne.mock.calls[1]![0].appSubscriptionId).toBe("app-sub-B");
  });
});

describe("HubSpot webhook_received deactivate — best-effort safety", () => {
  it("swallows NotFoundError from HubSpot DELETE (already gone) and still removes the app sub row", async () => {
    mockRefsDeleteOne.mockResolvedValue({ id: "ref-1" });
    mockRefsCount.mockResolvedValue(0);
    mockDeleteSub.mockRejectedValueOnce(new NotFoundError("webhook subscription hs-sub-aaa"));
    mockAppSubsDelete.mockResolvedValue(undefined);

    await expect(
      deactivate({
        trigger: trigger([
          {
            eventType: "contact.creation",
            propertyName: null,
            appSubscriptionId: "app-sub-1",
            hubspotSubscriptionId: "hs-sub-aaa",
          },
        ]),
        integration: baseIntegration,
      }),
    ).resolves.toBeUndefined();

    // Still removed the DB row despite the 404 swallow.
    expect(mockAppSubsDelete).toHaveBeenCalledWith("app-sub-1");
  });

  it("returns silently when subscriptions array is missing", async () => {
    await expect(
      deactivate({
        trigger: trigger(undefined),
        integration: baseIntegration,
      }),
    ).resolves.toBeUndefined();
    expect(mockRefsDeleteOne).not.toHaveBeenCalled();
  });

  it("returns silently when subscriptions array is empty", async () => {
    await expect(
      deactivate({
        trigger: trigger([]),
        integration: baseIntegration,
      }),
    ).resolves.toBeUndefined();
    expect(mockRefsDeleteOne).not.toHaveBeenCalled();
  });

  it("returns silently when appId is missing (defensive)", async () => {
    // Build the trigger inline — the helper's default appId can't be
    // disabled with `undefined` (function-default semantics).
    const triggerWithoutAppId = {
      id: "tr-1",
      workflowId: "wf-1",
      userId: "user-1",
      provider: "hubspot",
      eventType: "webhook_received",
      nodeId: "node-1",
      config: {
        subscriptions: [
          {
            eventType: "contact.creation",
            propertyName: null,
            appSubscriptionId: "app-sub-1",
            hubspotSubscriptionId: "hs-sub-aaa",
          },
        ],
        // No appId field — defensive path.
      },
      accountId: "9988776",
      registeredAt: "",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    await expect(
      deactivate({
        trigger: triggerWithoutAppId,
        integration: baseIntegration,
      }),
    ).resolves.toBeUndefined();
    expect(mockRefsDeleteOne).not.toHaveBeenCalled();
  });

  it("continues processing remaining entries when one entry throws (independent isolation)", async () => {
    mockRefsDeleteOne
      .mockRejectedValueOnce(new Error("transient DB error"))
      .mockResolvedValueOnce({ id: "ref-2" });
    mockRefsCount.mockResolvedValue(1);

    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await deactivate({
      trigger: trigger([
        {
          eventType: "contact.creation",
          propertyName: null,
          appSubscriptionId: "app-sub-A",
          hubspotSubscriptionId: "hs-A",
        },
        {
          eventType: "deal.creation",
          propertyName: null,
          appSubscriptionId: "app-sub-B",
          hubspotSubscriptionId: "hs-B",
        },
      ]),
      integration: baseIntegration,
    });

    // Second entry was processed despite first one failing.
    expect(mockRefsDeleteOne).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("still removes DB rows when token decrypt fails (revoked integration)", async () => {
    mockDecrypt.mockImplementationOnce(() => {
      throw new Error("Bad ciphertext");
    });
    mockRefsDeleteOne.mockResolvedValue({ id: "ref-1" });
    mockRefsCount.mockResolvedValue(0);
    mockAppSubsDelete.mockResolvedValue(undefined);

    await deactivate({
      trigger: trigger([
        {
          eventType: "contact.creation",
          propertyName: null,
          appSubscriptionId: "app-sub-1",
          hubspotSubscriptionId: "hs-sub-aaa",
        },
      ]),
      integration: baseIntegration,
    });

    // No HubSpot DELETE call because we couldn't decrypt the token,
    // but the DB cleanup ran anyway.
    expect(mockDeleteSub).not.toHaveBeenCalled();
    expect(mockAppSubsDelete).toHaveBeenCalledWith("app-sub-1");
  });
});
