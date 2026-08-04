/**
 * @jest-environment node
 *
 * hubspot/triggers/webhookReceived trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockCreateSub = jest.fn();
const mockDecrypt = jest.fn();
const mockAppSubsFindOrCreate = jest.fn();
const mockRefsUpsert = jest.fn();
const mockDeleteSub = jest.fn();
const mockRefsDeleteOne = jest.fn();
const mockRefsCount = jest.fn();
const mockAppSubsDelete = jest.fn();
const mockAppSubsFind = jest.fn();
const mockRefsList = jest.fn();

jest.mock("@/integrations/_shared/hubspot/api/webhookSubscriptions", () => ({
  createWebhookSubscription: (...args: unknown[]) => mockCreateSub(...args),
  deleteWebhookSubscription: (...args: unknown[]) => mockDeleteSub(...args),
}));

jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (v: string) => mockDecrypt(v),
}));

jest.mock("@/repositories/hubspotAppSubscriptions", () => ({
  findOrCreate: (...args: unknown[]) => mockAppSubsFindOrCreate(...args),
  deleteById: (...args: unknown[]) => mockAppSubsDelete(...args),
  find: (...args: unknown[]) => mockAppSubsFind(...args),
}));

jest.mock("@/repositories/hubspotSubscriptionRefs", () => ({
  upsert: (...args: unknown[]) => mockRefsUpsert(...args),
  deleteOne: (...args: unknown[]) => mockRefsDeleteOne(...args),
  countRefs: (...args: unknown[]) => mockRefsCount(...args),
  listForDispatch: (...args: unknown[]) => mockRefsList(...args),
}));

import { activate } from "@/integrations/hubspot/triggers/webhookReceived/activate";
import { HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES, isAllowedHubSpotSubscriptionType, isPropertyChangeSubscriptionType } from "@/integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes";
import { NotFoundError } from "@/integrations/_shared/hubspot/errors";
import { deactivate } from "@/integrations/hubspot/triggers/webhookReceived/deactivate";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { findSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import "@/integrations/_registry";
import { normalizeHubSpotEvent, HUBSPOT_TRIGGER_EVENT_TYPE } from "@/integrations/hubspot/triggers/webhookReceived/normalize";
import { createHmac } from "node:crypto";
import { InvalidSignatureError, SignatureExpiredError } from "@/core/triggers/errors";
import { receiveHubSpotWebhook } from "@/integrations/hubspot/triggers/webhookReceived/receive";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

beforeEach(() => {
  mockCreateSub.mockReset();
  mockDecrypt.mockReset();
  mockAppSubsFindOrCreate.mockReset();
  mockRefsUpsert.mockReset();
  mockDecrypt.mockImplementation((v: string) => `decrypted-${v}`);
  process.env.HUBSPOT_APP_ID = "11223344";
});

afterEach(() => {
  delete process.env.HUBSPOT_APP_ID;
});

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
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

const baseNode = {
  id: "node-trigger-1",
  kind: "trigger" as const,
  provider: "hubspot",
  type: "webhook_received",
  config: {
    subscriptions: [
      { eventType: "contact.creation" },
    ],
  },
  position: { x: 0, y: 0 },
};

describe("HubSpot webhook_received activate — happy path", () => {
  it("creates the HubSpot subscription on first ref and persists subscriptions to config", async () => {
    mockAppSubsFindOrCreate.mockImplementation(async (_input, creator) => {
      const { hubspotSubscriptionId } = await creator();
      return {
        id: "app-sub-1",
        appId: "11223344",
        eventType: "contact.creation",
        propertyName: null,
        hubspotSubscriptionId,
        status: "active",
        createdAt: "",
        updatedAt: "",
      };
    });
    mockCreateSub.mockResolvedValueOnce({
      id: "hs-sub-aaa",
      eventType: "contact.creation",
      active: true,
    });
    mockRefsUpsert.mockResolvedValueOnce({ id: "ref-1" });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreateSub).toHaveBeenCalledTimes(1);
    expect(mockCreateSub.mock.calls[0]![0]).toMatchObject({
      accessToken: "decrypted-ENC-HUBSPOT",
      appId: "11223344",
      eventType: "contact.creation",
      propertyName: null,
    });
    expect(mockRefsUpsert).toHaveBeenCalledTimes(1);
    expect(mockRefsUpsert.mock.calls[0]![0]).toMatchObject({
      appSubscriptionId: "app-sub-1",
      workflowId: "wf-test",
      nodeId: "node-trigger-1",
      hubId: "9988776",
    });
    expect(result).toEqual({
      webhookEnabled: true,
      appId: "11223344",
      hubId: "9988776",
      subscriptions: [
        {
          eventType: "contact.creation",
          propertyName: null,
          appSubscriptionId: "app-sub-1",
          hubspotSubscriptionId: "hs-sub-aaa",
        },
      ],
    });
  });

  it("reuses an existing app subscription when one is already present (refcount bump)", async () => {
    // findOrCreate returns the existing row without ever invoking the
    // creator callback — this simulates the second-workflow-asks-for-
    // the-same-event-type case.
    mockAppSubsFindOrCreate.mockResolvedValueOnce({
      id: "app-sub-existing",
      appId: "11223344",
      eventType: "contact.creation",
      propertyName: null,
      hubspotSubscriptionId: "hs-sub-original",
      status: "active",
      createdAt: "",
      updatedAt: "",
    });
    mockRefsUpsert.mockResolvedValueOnce({ id: "ref-2" });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-other",
    });

    // No HubSpot create call — findOrCreate's creator was not invoked.
    expect(mockCreateSub).not.toHaveBeenCalled();
    expect(mockRefsUpsert).toHaveBeenCalledTimes(1);
    expect(mockRefsUpsert.mock.calls[0]![0]).toMatchObject({
      appSubscriptionId: "app-sub-existing",
      workflowId: "wf-other",
    });
    expect(result.subscriptions).toEqual([
      {
        eventType: "contact.creation",
        propertyName: null,
        appSubscriptionId: "app-sub-existing",
        hubspotSubscriptionId: "hs-sub-original",
      },
    ]);
  });

  it("preserves propertyName for propertyChange types and uses null otherwise (uniqueness)", async () => {
    mockAppSubsFindOrCreate.mockImplementation(async (input, creator) => {
      const { hubspotSubscriptionId } = await creator();
      return {
        id: `app-sub-${input.eventType}-${input.propertyName ?? "null"}`,
        appId: input.appId,
        eventType: input.eventType,
        propertyName: input.propertyName,
        hubspotSubscriptionId,
        status: "active",
        createdAt: "",
        updatedAt: "",
      };
    });
    mockCreateSub
      .mockResolvedValueOnce({ id: "hs-1", eventType: "contact.creation", active: true })
      .mockResolvedValueOnce({ id: "hs-2", eventType: "contact.propertyChange", propertyName: "email", active: true });
    mockRefsUpsert.mockResolvedValue({ id: "ref" });

    const result = await activate({
      node: {
        ...baseNode,
        config: {
          subscriptions: [
            { eventType: "contact.creation" },
            { eventType: "contact.propertyChange", propertyName: "email" },
          ],
        },
      },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockAppSubsFindOrCreate.mock.calls[0]![0].propertyName).toBeNull();
    expect(mockAppSubsFindOrCreate.mock.calls[1]![0].propertyName).toBe("email");
    expect(result.subscriptions).toHaveLength(2);
  });
});

describe("HubSpot webhook_received activate — schema rejections", () => {
  it("rejects when subscriptions is missing", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: {} },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/subscriptions is required/);
    expect(mockCreateSub).not.toHaveBeenCalled();
  });

  it("rejects when subscriptions is empty array", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { subscriptions: [] } },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/subscriptions is required/);
  });

  it("rejects event types outside the Batch 1 allowlist (fail-loud at design time)", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: { subscriptions: [{ eventType: "form.submission" }] },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/form\.submission.*allowlist/);
    expect(mockCreateSub).not.toHaveBeenCalled();
  });

  it("rejects propertyChange without propertyName", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: {
            subscriptions: [{ eventType: "contact.propertyChange" }],
          },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/requires a non-empty propertyName/);
  });

  it("rejects propertyName on non-propertyChange types", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: {
            subscriptions: [
              { eventType: "contact.creation", propertyName: "email" },
            ],
          },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/must not carry a propertyName/);
  });

  it("rejects duplicate subscription entries", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: {
            subscriptions: [
              { eventType: "contact.creation" },
              { eventType: "contact.creation" },
            ],
          },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/duplicate subscription item/);
  });

  it("rejects when HUBSPOT_APP_ID is missing", async () => {
    delete process.env.HUBSPOT_APP_ID;
    await expect(
      activate({
        node: baseNode,
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/HUBSPOT_APP_ID/);
  });

  it("rejects when integration has no providerAccountId", async () => {
    await expect(
      activate({
        node: baseNode,
        integration: { ...baseIntegration, providerAccountId: "" },
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/providerAccountId/);
  });

  // HubSpot 2.1 — ticket.propertyChange + ticket.deletion allowlist additions.

  it("accepts ticket.propertyChange when propertyName is supplied (HubSpot 2.1)", async () => {
    mockAppSubsFindOrCreate.mockImplementation(async (_input, creator) => {
      const { hubspotSubscriptionId } = await creator();
      return {
        id: "app-sub-ticket-pc",
        appId: "11223344",
        eventType: "ticket.propertyChange",
        propertyName: "hs_pipeline_stage",
        hubspotSubscriptionId,
        status: "active",
        createdAt: "",
        updatedAt: "",
      };
    });
    mockCreateSub.mockResolvedValueOnce({
      id: "hs-sub-ticket-pc",
      eventType: "ticket.propertyChange",
      active: true,
    });
    mockRefsUpsert.mockResolvedValueOnce({ id: "ref-ticket-pc" });

    const result = await activate({
      node: {
        ...baseNode,
        config: {
          subscriptions: [
            {
              eventType: "ticket.propertyChange",
              propertyName: "hs_pipeline_stage",
            },
          ],
        },
      },
      integration: baseIntegration,
      workflowId: "wf-ticket-pc",
    });

    expect(mockCreateSub).toHaveBeenCalledTimes(1);
    expect(mockCreateSub.mock.calls[0]![0]).toMatchObject({
      eventType: "ticket.propertyChange",
      propertyName: "hs_pipeline_stage",
    });
    expect(result.subscriptions).toEqual([
      {
        eventType: "ticket.propertyChange",
        propertyName: "hs_pipeline_stage",
        appSubscriptionId: "app-sub-ticket-pc",
        hubspotSubscriptionId: "hs-sub-ticket-pc",
      },
    ]);
  });

  it("rejects ticket.propertyChange without propertyName (HubSpot 2.1)", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: {
            subscriptions: [{ eventType: "ticket.propertyChange" }],
          },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/requires a non-empty propertyName/);
  });

  it("accepts ticket.deletion with no propertyName (HubSpot 2.1)", async () => {
    mockAppSubsFindOrCreate.mockImplementation(async (_input, creator) => {
      const { hubspotSubscriptionId } = await creator();
      return {
        id: "app-sub-ticket-del",
        appId: "11223344",
        eventType: "ticket.deletion",
        propertyName: null,
        hubspotSubscriptionId,
        status: "active",
        createdAt: "",
        updatedAt: "",
      };
    });
    mockCreateSub.mockResolvedValueOnce({
      id: "hs-sub-ticket-del",
      eventType: "ticket.deletion",
      active: true,
    });
    mockRefsUpsert.mockResolvedValueOnce({ id: "ref-ticket-del" });

    const result = await activate({
      node: {
        ...baseNode,
        config: {
          subscriptions: [{ eventType: "ticket.deletion" }],
        },
      },
      integration: baseIntegration,
      workflowId: "wf-ticket-del",
    });

    expect(mockCreateSub.mock.calls[0]![0]).toMatchObject({
      eventType: "ticket.deletion",
      propertyName: null,
    });
    const subs = result.subscriptions as ReadonlyArray<{
      propertyName: string | null;
    }>;
    expect(subs[0]!.propertyName).toBeNull();
  });

  it("rejects propertyName on ticket.deletion (non-propertyChange)", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: {
            subscriptions: [
              { eventType: "ticket.deletion", propertyName: "subject" },
            ],
          },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/must not carry a propertyName/);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former allowedSubscriptionTypes.test.ts
// ---------------------------------------------------------------------------
describe("allowedSubscriptionTypes (lifecycle)", () => {

describe("HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES", () => {
  it("declares exactly the 12 entries (10 Slice 13 + 2 HubSpot 2.1)", () => {
    expect([...HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES].sort()).toEqual(
      [
        "contact.creation",
        "contact.propertyChange",
        "contact.deletion",
        "company.creation",
        "company.propertyChange",
        "company.deletion",
        "deal.creation",
        "deal.propertyChange",
        "deal.deletion",
        "ticket.creation",
        "ticket.propertyChange",
        "ticket.deletion",
      ].sort(),
    );
  });

  it("HubSpot 2.1 PORT set: ticket.propertyChange + ticket.deletion are allowed", () => {
    expect(isAllowedHubSpotSubscriptionType("ticket.propertyChange")).toBe(
      true,
    );
    expect(isAllowedHubSpotSubscriptionType("ticket.deletion")).toBe(true);
  });

  it("does NOT include deferred entries (engagements, form.submission)", () => {
    const deferred = [
      "note.creation",
      "task.creation",
      "call.creation",
      "meeting.creation",
      "form.submission",
    ];
    for (const t of deferred) {
      expect(isAllowedHubSpotSubscriptionType(t)).toBe(false);
    }
  });

  it("isPropertyChangeSubscriptionType correctly identifies propertyChange types — incl. ticket.propertyChange", () => {
    expect(isPropertyChangeSubscriptionType("contact.propertyChange")).toBe(true);
    expect(isPropertyChangeSubscriptionType("company.propertyChange")).toBe(true);
    expect(isPropertyChangeSubscriptionType("deal.propertyChange")).toBe(true);
    expect(isPropertyChangeSubscriptionType("ticket.propertyChange")).toBe(
      true,
    );
    expect(isPropertyChangeSubscriptionType("contact.creation")).toBe(false);
    expect(isPropertyChangeSubscriptionType("contact.deletion")).toBe(false);
    expect(isPropertyChangeSubscriptionType("ticket.creation")).toBe(false);
    expect(isPropertyChangeSubscriptionType("ticket.deletion")).toBe(false);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former deactivate.test.ts
// ---------------------------------------------------------------------------
describe("deactivate (lifecycle)", () => {

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
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
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
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "hubspot",
    eventType: "webhook_received",
    nodeId: "node-1",
    config,
    providerAccountId: "9988776",
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
      workflowAccountId: "acct-1",
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
      providerAccountId: "9988776",
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

});

// ---------------------------------------------------------------------------
// Merged from the former index.test.ts
// Module-init registration assertion: importing the trigger index
// registers activate + deactivate hooks. NO subscription handler —
// HubSpot webhook subscriptions don't expire (permanent endpoint
// pattern, same as Slice 11 / Stripe + Slice 12 / Shopify).
// ---------------------------------------------------------------------------
describe("index (lifecycle)", () => {

// Side-effect import — registers via _registry.ts.
describe("HubSpot webhook_received trigger registration", () => {
  it("registers activation hook for ('hubspot', 'webhook_received')", () => {
    expect(findActivation("hubspot", "webhook_received")).not.toBeNull();
  });

  it("registers deactivation hook for ('hubspot', 'webhook_received')", () => {
    expect(findDeactivation("hubspot", "webhook_received")).not.toBeNull();
  });

  it("does NOT register a subscription handler — HubSpot webhooks don't expire", () => {
    // HubSpot Public App webhook subscriptions are permanent until
    // explicit delete via the developer API or app uninstall. V2's
    // idiomatic opt-out is to omit the subscription handler AND skip
    // the `config.type === "subscription-watch"` marker. This test
    // guards: no handler claims a HubSpot-shaped trigger row.
    const hubspotTrigger = {
      id: "tr-1",
      workflowId: "wf-1",
      workflowAccountId: "acct-1",
      userId: "u",
      provider: "hubspot",
      eventType: "webhook_received",
      nodeId: "n-1",
      config: {
        webhookEnabled: true,
        appId: "11223344",
        hubId: "9988776",
        subscriptions: [
          {
            eventType: "contact.creation",
            propertyName: null,
            appSubscriptionId: "app-sub-1",
            hubspotSubscriptionId: "hs-sub-aaa",
          },
        ],
      },
      providerAccountId: "9988776",
      registeredAt: "",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    expect(findSubscriptionHandler(hubspotTrigger)).toBeNull();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

describe("normalizeHubSpotEvent", () => {
  it("maps a contact.creation event to a canonical TriggerEvent", () => {
    const result = normalizeHubSpotEvent({
      eventId: 12345,
      subscriptionId: 67890,
      portalId: 9988776,
      appId: 11223344,
      occurredAt: 1700000000000,
      subscriptionType: "contact.creation",
      attemptNumber: 0,
      objectId: 5001,
    });
    expect(result).toEqual({
      provider: "hubspot",
      eventType: HUBSPOT_TRIGGER_EVENT_TYPE,
      eventId: "12345",
      occurredAt: new Date(1700000000000).toISOString(),
      providerAccountId: "9988776",
      payload: expect.objectContaining({
        subscriptionType: "contact.creation",
        portalId: "9988776",
        hubId: "9988776",
        objectId: "5001",
        propertyName: null,
        propertyValue: null,
        occurredAt: 1700000000000,
        subscriptionId: "67890",
        appId: "11223344",
        attemptNumber: 0,
        changeSource: null,
      }),
    });
    expect(result.payload.event).toBeDefined();
  });

  it("includes propertyName + propertyValue for propertyChange events", () => {
    const result = normalizeHubSpotEvent({
      eventId: 1,
      portalId: 42,
      subscriptionType: "contact.propertyChange",
      objectId: 99,
      propertyName: "email",
      propertyValue: "new@example.com",
      occurredAt: 1700000000000,
    });
    expect(result.payload.propertyName).toBe("email");
    expect(result.payload.propertyValue).toBe("new@example.com");
  });

  it("uses HubSpot eventId as the dedup id when present", () => {
    const result = normalizeHubSpotEvent({
      eventId: 42,
      portalId: 1,
      subscriptionType: "contact.creation",
      objectId: 2,
      occurredAt: 1700000000000,
    });
    expect(result.eventId).toBe("42");
  });

  it("falls back to deterministic dedup key when eventId is absent", () => {
    const result = normalizeHubSpotEvent({
      portalId: 42,
      subscriptionType: "deal.creation",
      objectId: 100,
      occurredAt: 1700000000000,
    });
    // Format: portalId:eventType:objectId:propertyName?:occurredAt
    expect(result.eventId).toBe("42:deal.creation:100:no-property:1700000000000");
  });

  it("falls back to current time when occurredAt is absent", () => {
    const before = Date.now();
    const result = normalizeHubSpotEvent({
      eventId: 1,
      portalId: 42,
      subscriptionType: "contact.creation",
    });
    const after = Date.now();
    const parsed = new Date(result.occurredAt).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });

  it("stringifies numeric ids consistently", () => {
    const result = normalizeHubSpotEvent({
      eventId: 1,
      portalId: 12345,
      subscriptionType: "contact.creation",
      objectId: 67890,
      occurredAt: 1700000000000,
    });
    expect(result.providerAccountId).toBe("12345");
    expect(result.payload.portalId).toBe("12345");
    expect(result.payload.hubId).toBe("12345");
    expect(result.payload.objectId).toBe("67890");
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former receive.test.ts
// Tests for `receiveHubSpotWebhook` — the verify-and-parse helper that
// the route delegates to. Mocks the app-subscriptions + refs repos so
// we exercise:
// - V3 signature verification (delegates to verifyHubSpotSignature).
// - Empty body / bad JSON / non-array body rejection.
// - Unknown-subscription routing (no app_sub row for eventType).
// - No-matching-refs routing (refs absent for this portal).
// - Multi-event payload — each event independently routed.
// - propertyChange propertyName scoping in the lookup.
// ---------------------------------------------------------------------------
describe("receive (lifecycle)", () => {

const SECRET = "hubspot_test_client_secret";
const APP_ID = "11223344";
const URL = "https://app.example.test/api/webhooks/hubspot";
const NOW_MS = 1_700_000_000_000;

function sign(body: string, timestampMs: number, uri: string = URL): string {
  const canonical = `POST${uri}${body}${timestampMs}`;
  return createHmac("sha256", SECRET).update(canonical, "utf8").digest("base64");
}

function req(opts: {
  body?: string;
  sig?: string | null;
  timestamp?: string | null;
  url?: string;
}): Request {
  const body = opts.body ?? "[]";
  const headers: Record<string, string> = {};
  if (opts.sig !== null) headers["X-HubSpot-Signature-V3"] = opts.sig ?? sign(body, NOW_MS);
  if (opts.timestamp !== null) headers["X-HubSpot-Request-Timestamp"] = opts.timestamp ?? String(NOW_MS);
  return new Request(opts.url ?? URL, { method: "POST", body, headers });
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 12345,
    subscriptionId: 67890,
    portalId: 9988776,
    appId: 11223344,
    occurredAt: NOW_MS,
    subscriptionType: "contact.creation",
    attemptNumber: 0,
    objectId: 5001,
    ...overrides,
  };
}

beforeEach(() => {
  mockAppSubsFind.mockReset();
  mockRefsList.mockReset();
});

describe("receiveHubSpotWebhook — signature verification", () => {
  it("throws InvalidSignatureError on missing X-HubSpot-Signature-V3", async () => {
    const body = JSON.stringify([makeEvent()]);
    await expect(
      receiveHubSpotWebhook(req({ body, sig: null }), {
        secret: SECRET,
        appId: APP_ID,
        requestUriOverride: URL,
        nowMs: NOW_MS,
      }),
    ).rejects.toThrow(InvalidSignatureError);
  });

  it("throws InvalidSignatureError on signature mismatch", async () => {
    const body = JSON.stringify([makeEvent()]);
    await expect(
      receiveHubSpotWebhook(req({ body, sig: "AAAA" }), {
        secret: SECRET,
        appId: APP_ID,
        requestUriOverride: URL,
        nowMs: NOW_MS,
      }),
    ).rejects.toThrow(/signature verification failed/);
  });

  it("throws SignatureExpiredError when timestamp is outside the 5-minute tolerance", async () => {
    const oldMs = NOW_MS - 6 * 60 * 1000;
    const body = JSON.stringify([makeEvent()]);
    await expect(
      receiveHubSpotWebhook(
        req({ body, sig: sign(body, oldMs), timestamp: String(oldMs) }),
        {
          secret: SECRET,
          appId: APP_ID,
          requestUriOverride: URL,
          nowMs: NOW_MS,
        },
      ),
    ).rejects.toThrow(SignatureExpiredError);
  });

  it("throws InvalidSignatureError when HUBSPOT_CLIENT_SECRET is unset (no override)", async () => {
    const body = JSON.stringify([makeEvent()]);
    // No `secret` override AND no env — verifier should fail with the
    // missing-secret path.
    delete process.env.HUBSPOT_CLIENT_SECRET;
    await expect(
      receiveHubSpotWebhook(req({ body }), {
        appId: APP_ID,
        requestUriOverride: URL,
        nowMs: NOW_MS,
      }),
    ).rejects.toThrow(/HUBSPOT_CLIENT_SECRET/);
  });

  it("throws InvalidSignatureError when raw body is mutated after signing (whitespace)", async () => {
    const original = JSON.stringify([makeEvent()]);
    const signature = sign(original, NOW_MS);
    const mutated = original.replace(":", ": "); // add whitespace
    await expect(
      receiveHubSpotWebhook(req({ body: mutated, sig: signature }), {
        secret: SECRET,
        appId: APP_ID,
        requestUriOverride: URL,
        nowMs: NOW_MS,
      }),
    ).rejects.toThrow(/signature verification failed/);
  });

  it("throws InvalidSignatureError on empty body", async () => {
    await expect(
      receiveHubSpotWebhook(req({ body: "" }), {
        secret: SECRET,
        appId: APP_ID,
        requestUriOverride: URL,
        nowMs: NOW_MS,
      }),
    ).rejects.toThrow(/empty body/);
  });

  it("throws InvalidSignatureError when body is not JSON array", async () => {
    const body = '{"not":"array"}';
    await expect(
      receiveHubSpotWebhook(req({ body, sig: sign(body, NOW_MS) }), {
        secret: SECRET,
        appId: APP_ID,
        requestUriOverride: URL,
        nowMs: NOW_MS,
      }),
    ).rejects.toThrow(/not a JSON array/);
  });
});

describe("receiveHubSpotWebhook — routing", () => {
  it("returns delivery with skipReason=unknown_subscription when no app sub matches", async () => {
    mockAppSubsFind.mockResolvedValueOnce(null);
    const body = JSON.stringify([makeEvent()]);
    const result = await receiveHubSpotWebhook(
      req({ body, sig: sign(body, NOW_MS) }),
      { secret: SECRET, appId: APP_ID, requestUriOverride: URL, nowMs: NOW_MS },
    );
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]!.skipReason).toBe("unknown_subscription");
    expect(result.deliveries[0]!.targets).toEqual([]);
    expect(mockRefsList).not.toHaveBeenCalled();
  });

  it("returns delivery with skipReason=no_matching_refs when app sub exists but no refs for portal", async () => {
    mockAppSubsFind.mockResolvedValueOnce({
      id: "app-sub-1",
      appId: APP_ID,
      eventType: "contact.creation",
      propertyName: null,
      hubspotSubscriptionId: "hs-1",
      status: "active",
      createdAt: "",
      updatedAt: "",
    });
    mockRefsList.mockResolvedValueOnce([]);
    const body = JSON.stringify([makeEvent()]);
    const result = await receiveHubSpotWebhook(
      req({ body, sig: sign(body, NOW_MS) }),
      { secret: SECRET, appId: APP_ID, requestUriOverride: URL, nowMs: NOW_MS },
    );
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.deliveries[0]!.skipReason).toBe("no_matching_refs");
    expect(mockRefsList).toHaveBeenCalledWith({
      appSubscriptionId: "app-sub-1",
      hubId: "9988776",
    });
  });

  it("returns delivery with N targets when N refs match the portal", async () => {
    mockAppSubsFind.mockResolvedValueOnce({
      id: "app-sub-1",
      appId: APP_ID,
      eventType: "contact.creation",
      propertyName: null,
      hubspotSubscriptionId: "hs-1",
      status: "active",
      createdAt: "",
      updatedAt: "",
    });
    mockRefsList.mockResolvedValueOnce([
      {
        id: "ref-A",
        appSubscriptionId: "app-sub-1",
        workflowId: "wf-A",
        nodeId: "node-A",
        userId: "user-A",
        hubId: "9988776",
        config: {},
        status: "active",
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "ref-B",
        appSubscriptionId: "app-sub-1",
        workflowId: "wf-B",
        nodeId: "node-B",
        userId: "user-B",
        hubId: "9988776",
        config: {},
        status: "active",
        createdAt: "",
        updatedAt: "",
      },
    ]);
    const body = JSON.stringify([makeEvent()]);
    const result = await receiveHubSpotWebhook(
      req({ body, sig: sign(body, NOW_MS) }),
      { secret: SECRET, appId: APP_ID, requestUriOverride: URL, nowMs: NOW_MS },
    );
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.deliveries[0]!.skipReason).toBeNull();
    expect(result.deliveries[0]!.targets).toHaveLength(2);
    expect(result.deliveries[0]!.targets[0]).toEqual({
      workflowId: "wf-A",
      nodeId: "node-A",
      userId: "user-A",
    });
  });

  it("scopes app-sub lookup by propertyName for propertyChange events", async () => {
    mockAppSubsFind.mockResolvedValueOnce(null);
    const body = JSON.stringify([
      makeEvent({
        subscriptionType: "contact.propertyChange",
        propertyName: "email",
        propertyValue: "new@example.com",
      }),
    ]);
    await receiveHubSpotWebhook(req({ body, sig: sign(body, NOW_MS) }), {
      secret: SECRET,
      appId: APP_ID,
      requestUriOverride: URL,
      nowMs: NOW_MS,
    });
    expect(mockAppSubsFind).toHaveBeenCalledWith({
      appId: APP_ID,
      eventType: "contact.propertyChange",
      propertyName: "email",
    });
  });

  it("forces propertyName=null in the lookup for non-propertyChange events", async () => {
    mockAppSubsFind.mockResolvedValueOnce(null);
    const body = JSON.stringify([
      makeEvent({ subscriptionType: "contact.deletion" }),
    ]);
    await receiveHubSpotWebhook(req({ body, sig: sign(body, NOW_MS) }), {
      secret: SECRET,
      appId: APP_ID,
      requestUriOverride: URL,
      nowMs: NOW_MS,
    });
    expect(mockAppSubsFind).toHaveBeenCalledWith({
      appId: APP_ID,
      eventType: "contact.deletion",
      propertyName: null,
    });
  });

  it("routes each event in a multi-event payload independently", async () => {
    mockAppSubsFind
      .mockResolvedValueOnce({
        id: "app-sub-A",
        appId: APP_ID,
        eventType: "contact.creation",
        propertyName: null,
        hubspotSubscriptionId: "hs-A",
        status: "active",
        createdAt: "",
        updatedAt: "",
      })
      .mockResolvedValueOnce(null);
    mockRefsList.mockResolvedValueOnce([
      {
        id: "ref-1",
        appSubscriptionId: "app-sub-A",
        workflowId: "wf-A",
        nodeId: "node-A",
        hubId: "9988776",
        config: {},
        status: "active",
        createdAt: "",
        updatedAt: "",
      },
    ]);
    const body = JSON.stringify([
      makeEvent({ eventId: 1, subscriptionType: "contact.creation" }),
      makeEvent({ eventId: 2, subscriptionType: "deal.deletion" }),
    ]);
    const result = await receiveHubSpotWebhook(
      req({ body, sig: sign(body, NOW_MS) }),
      { secret: SECRET, appId: APP_ID, requestUriOverride: URL, nowMs: NOW_MS },
    );
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.deliveries).toHaveLength(2);
    expect(result.deliveries[0]!.skipReason).toBeNull();
    expect(result.deliveries[0]!.targets).toHaveLength(1);
    expect(result.deliveries[1]!.skipReason).toBe("unknown_subscription");
  });

  it("returns unknown_subscription when HUBSPOT_APP_ID is unset (defense-in-depth ack)", async () => {
    const body = JSON.stringify([makeEvent()]);
    const result = await receiveHubSpotWebhook(
      req({ body, sig: sign(body, NOW_MS) }),
      {
        secret: SECRET,
        /* appId: undefined */ requestUriOverride: URL,
        nowMs: NOW_MS,
      },
    );
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.deliveries[0]!.skipReason).toBe("unknown_subscription");
    expect(mockAppSubsFind).not.toHaveBeenCalled();
  });

  it("normalizes each event into a canonical TriggerEvent", async () => {
    mockAppSubsFind.mockResolvedValueOnce({
      id: "app-sub-1",
      appId: APP_ID,
      eventType: "contact.creation",
      propertyName: null,
      hubspotSubscriptionId: "hs-1",
      status: "active",
      createdAt: "",
      updatedAt: "",
    });
    mockRefsList.mockResolvedValueOnce([
      {
        id: "ref-1",
        appSubscriptionId: "app-sub-1",
        workflowId: "wf-1",
        nodeId: "node-1",
        hubId: "9988776",
        config: {},
        status: "active",
        createdAt: "",
        updatedAt: "",
      },
    ]);
    const body = JSON.stringify([makeEvent({ eventId: 5555 })]);
    const result = await receiveHubSpotWebhook(
      req({ body, sig: sign(body, NOW_MS) }),
      { secret: SECRET, appId: APP_ID, requestUriOverride: URL, nowMs: NOW_MS },
    );
    if (result.kind !== "events") throw new Error("expected events");
    const event = result.deliveries[0]!.event;
    expect(event.provider).toBe("hubspot");
    expect(event.eventType).toBe("webhook_received");
    expect(event.eventId).toBe("5555");
    expect(event.providerAccountId).toBe("9988776");
    expect(event.payload.subscriptionType).toBe("contact.creation");
    expect(event.payload.objectId).toBe("5001");
  });

  // HubSpot 2.1 — ticket.propertyChange + ticket.deletion routing.

  it("dispatches ticket.propertyChange events through the same propertyName-scoped lookup as contact/company/deal (HubSpot 2.1)", async () => {
    mockAppSubsFind.mockResolvedValueOnce({
      id: "app-sub-ticket-pc",
      appId: APP_ID,
      eventType: "ticket.propertyChange",
      propertyName: "hs_pipeline_stage",
      hubspotSubscriptionId: "hs-ticket-pc",
      status: "active",
      createdAt: "",
      updatedAt: "",
    });
    mockRefsList.mockResolvedValueOnce([
      {
        id: "ref-ticket-pc",
        appSubscriptionId: "app-sub-ticket-pc",
        workflowId: "wf-ticket-pc",
        nodeId: "node-1",
        hubId: "9988776",
        config: {},
        status: "active",
        createdAt: "",
        updatedAt: "",
      },
    ]);
    const body = JSON.stringify([
      makeEvent({
        eventId: 7001,
        subscriptionType: "ticket.propertyChange",
        propertyName: "hs_pipeline_stage",
        propertyValue: "closed",
      }),
    ]);
    const result = await receiveHubSpotWebhook(
      req({ body, sig: sign(body, NOW_MS) }),
      { secret: SECRET, appId: APP_ID, requestUriOverride: URL, nowMs: NOW_MS },
    );
    expect(mockAppSubsFind).toHaveBeenCalledWith({
      appId: APP_ID,
      eventType: "ticket.propertyChange",
      propertyName: "hs_pipeline_stage",
    });
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.deliveries).toHaveLength(1);
    const event = result.deliveries[0]!.event;
    expect(event.payload.subscriptionType).toBe("ticket.propertyChange");
    expect(event.payload.propertyName).toBe("hs_pipeline_stage");
    expect(event.payload.propertyValue).toBe("closed");
  });

  it("dispatches ticket.deletion events with propertyName=null lookup (HubSpot 2.1)", async () => {
    mockAppSubsFind.mockResolvedValueOnce({
      id: "app-sub-ticket-del",
      appId: APP_ID,
      eventType: "ticket.deletion",
      propertyName: null,
      hubspotSubscriptionId: "hs-ticket-del",
      status: "active",
      createdAt: "",
      updatedAt: "",
    });
    mockRefsList.mockResolvedValueOnce([
      {
        id: "ref-ticket-del",
        appSubscriptionId: "app-sub-ticket-del",
        workflowId: "wf-ticket-del",
        nodeId: "node-1",
        hubId: "9988776",
        config: {},
        status: "active",
        createdAt: "",
        updatedAt: "",
      },
    ]);
    const body = JSON.stringify([
      makeEvent({ eventId: 7002, subscriptionType: "ticket.deletion" }),
    ]);
    const result = await receiveHubSpotWebhook(
      req({ body, sig: sign(body, NOW_MS) }),
      { secret: SECRET, appId: APP_ID, requestUriOverride: URL, nowMs: NOW_MS },
    );
    expect(mockAppSubsFind).toHaveBeenCalledWith({
      appId: APP_ID,
      eventType: "ticket.deletion",
      propertyName: null,
    });
    if (result.kind !== "events") throw new Error("expected events");
    const event = result.deliveries[0]!.event;
    expect(event.payload.subscriptionType).toBe("ticket.deletion");
  });
});

});
