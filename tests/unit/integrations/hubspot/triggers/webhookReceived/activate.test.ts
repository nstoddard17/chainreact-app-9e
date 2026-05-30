/**
 * @jest-environment node
 */
const mockCreateSub = jest.fn();
const mockDecrypt = jest.fn();
const mockAppSubsFindOrCreate = jest.fn();
const mockRefsUpsert = jest.fn();

jest.mock("@/integrations/_shared/hubspot/api/webhookSubscriptions", () => ({
  createWebhookSubscription: (...args: unknown[]) => mockCreateSub(...args),
  deleteWebhookSubscription: jest.fn(),
}));

jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (v: string) => mockDecrypt(v),
}));

jest.mock("@/repositories/hubspotAppSubscriptions", () => ({
  findOrCreate: (...args: unknown[]) => mockAppSubsFindOrCreate(...args),
}));

jest.mock("@/repositories/hubspotSubscriptionRefs", () => ({
  upsert: (...args: unknown[]) => mockRefsUpsert(...args),
}));

import { activate } from "@/integrations/hubspot/triggers/webhookReceived/activate";

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
