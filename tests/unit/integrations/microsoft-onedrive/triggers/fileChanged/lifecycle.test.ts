/**
 * @jest-environment node
 *
 * microsoft-onedrive/triggers/fileChanged trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockCreateSubscription = jest.fn();
const mockDriveRootDelta = jest.fn();
const mockDeleteSubscription = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();
const mockDriveItemsGet = jest.fn();
const mockRenewSubscription = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/microsoft/api/subscriptions", () => ({
  createSubscription: (...args: unknown[]) => mockCreateSubscription(...args),
  deleteSubscription: (...args: unknown[]) => mockDeleteSubscription(...args),
  renewSubscription: (...args: unknown[]) => mockRenewSubscription(...args),
}));

jest.mock("@/integrations/microsoft-onedrive/api/driveRootDelta", () => ({
  driveRootDelta: (...args: unknown[]) => mockDriveRootDelta(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

jest.mock("@/integrations/microsoft-onedrive/api/driveItemsGet", () => ({
  driveItemsGet: (...args: unknown[]) => mockDriveItemsGet(...args),
}));

import { activate } from "@/integrations/microsoft-onedrive/triggers/fileChanged/activate";
import { deactivate } from "@/integrations/microsoft-onedrive/triggers/fileChanged/deactivate";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import "@/integrations/microsoft-onedrive/triggers/fileChanged";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { findSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { isDeletedDeltaItem, normalize, normalizeDeleted } from "@/integrations/microsoft-onedrive/triggers/fileChanged/normalize";
import { pull } from "@/integrations/microsoft-onedrive/triggers/fileChanged/pull";
import { onedriveFileChangedSubscriptionHandler } from "@/integrations/microsoft-onedrive/triggers/fileChanged/renew";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreateSubscription.mockReset();
  mockDriveRootDelta.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.MICROSOFT_GRAPH_WEBHOOK_URL;
});

const baseNode = {
  id: "node-trigger-1",
  kind: "trigger" as const,
  provider: "microsoft-onedrive",
  type: "file_changed",
  config: {},
  position: { x: 0, y: 0 },
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

describe("OneDrive file_changed activate", () => {
  it("captures baseline delta cursor BEFORE creating the subscription", async () => {
    mockDriveRootDelta.mockResolvedValueOnce({
      items: [],
      deltaLink: "https://graph/x?token=baseline",
    });
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-1",
      resource: "/me/drive/root",
      changeType: "updated",
      notificationUrl:
        "https://app.example.test/api/webhooks/microsoft-onedrive",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    // Delta call ordering: must come BEFORE subscription create.
    expect(mockDriveRootDelta).toHaveBeenCalled();
    expect(mockCreateSubscription).toHaveBeenCalled();
    const deltaInvocationOrder =
      mockDriveRootDelta.mock.invocationCallOrder[0]!;
    const subscribeInvocationOrder =
      mockCreateSubscription.mock.invocationCallOrder[0]!;
    expect(deltaInvocationOrder).toBeLessThan(subscribeInvocationOrder);
    expect(result.deltaToken).toBe("https://graph/x?token=baseline");
  });

  it("creates subscription on /me/drive/root with changeType=updated and 70.5h expiration", async () => {
    mockDriveRootDelta.mockResolvedValueOnce({
      items: [],
      deltaLink: "https://graph/x?token=t",
    });
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-graph-1",
      resource: "/me/drive/root",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreateSubscription).toHaveBeenCalledTimes(1);
    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/drive/root");
    expect(call.changeType).toBe("updated");
    expect(call.notificationUrl).toBe(
      "https://app.example.test/api/webhooks/microsoft-onedrive",
    );
    expect(call.lifecycleNotificationUrl).toBe(
      "https://app.example.test/api/webhooks/microsoft-onedrive/lifecycle",
    );
    const expiresAt = Date.parse(call.expirationDateTime);
    const expected = Date.now() + 4230 * 60 * 1000;
    expect(Math.abs(expiresAt - expected)).toBeLessThan(60_000);

    expect(result).toMatchObject({
      type: "subscription-watch",
      webhookEnabled: true,
      resource: "/me/drive/root",
      changeType: "updated",
      subscriptionId: "sub-graph-1",
      expiresAt: "2026-05-12T00:00:00.000Z",
      deltaToken: "https://graph/x?token=t",
    });
    expect(typeof result.clientState).toBe("string");
  });

  it("generates a 64-char hex clientState (32 random bytes)", async () => {
    mockDriveRootDelta.mockResolvedValueOnce({
      items: [],
      deltaLink: "https://graph/x?token=t",
    });
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/drive/root",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.clientState).toMatch(/^[0-9a-f]{64}$/);
    expect(mockCreateSubscription.mock.calls[0]![0].clientState).toBe(
      result.clientState,
    );
  });

  it("threads microsoft-onedrive provider through refreshAndRetry on both Graph calls", async () => {
    mockDriveRootDelta.mockResolvedValueOnce({
      items: [],
      deltaLink: "https://graph/x?token=t",
    });
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/drive/root",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    // Both refreshAndRetry calls must use the OneDrive provider id.
    // Fail-closed floor: zero calls would make this loop assert nothing
    // (PROVIDER-CONTRACT-CONSOLIDATION-1E) — activation makes exactly two
    // Graph calls (subscription create + delta baseline seed).
    expect(mockRefreshAndRetry.mock.calls).toHaveLength(2);
    for (const call of mockRefreshAndRetry.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          accountId: "acct-user-1",
          provider: "microsoft-onedrive",
          providerAccountId: "alice@contoso.com",
        }),
      );
    }
  });

  it("uses MICROSOFT_GRAPH_WEBHOOK_URL when set, stripping any trailing /api/webhooks/microsoft-onedrive", async () => {
    process.env.MICROSOFT_GRAPH_WEBHOOK_URL =
      "https://tunnel.example.test/api/webhooks/microsoft-onedrive";

    mockDriveRootDelta.mockResolvedValueOnce({
      items: [],
      deltaLink: "https://graph/x?token=t",
    });
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/drive/root",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.notificationUrl).toBe(
      "https://tunnel.example.test/api/webhooks/microsoft-onedrive",
    );
    expect(call.lifecycleNotificationUrl).toBe(
      "https://tunnel.example.test/api/webhooks/microsoft-onedrive/lifecycle",
    );
  });

  it("MICROSOFT_GRAPH_WEBHOOK_URL set to mail or calendar paths still resolves to OneDrive route", async () => {
    // The same env var is shared across Microsoft providers. Setting it
    // to any of the known siblings must not double-suffix the path.
    for (const sibling of [
      "https://tunnel.example.test/api/webhooks/microsoft-outlook",
      "https://tunnel.example.test/api/webhooks/microsoft-outlook-calendar",
    ]) {
      process.env.MICROSOFT_GRAPH_WEBHOOK_URL = sibling;
      mockDriveRootDelta.mockResolvedValueOnce({
        items: [],
        deltaLink: "https://graph/x?token=t",
      });
      mockCreateSubscription.mockResolvedValueOnce({
        id: "s",
        resource: "/me/drive/root",
        changeType: "updated",
        notificationUrl: "x",
        expirationDateTime: "x",
      });
      await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });
      const call = mockCreateSubscription.mock.calls.at(-1)![0];
      expect(call.notificationUrl).toBe(
        "https://tunnel.example.test/api/webhooks/microsoft-onedrive",
      );
    }
  });

  it("propagates createSubscription failures verbatim (lifecycle wraps with TRIGGER_REGISTRATION_FAILED)", async () => {
    mockDriveRootDelta.mockResolvedValueOnce({
      items: [],
      deltaLink: "https://graph/x?token=t",
    });
    mockCreateSubscription.mockRejectedValueOnce(
      new Error("Subscription validation request failed"),
    );

    await expect(
      activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" }),
    ).rejects.toThrow(/validation request failed/);
  });

  it("propagates baseline-delta failures (cannot proceed without a baseline cursor)", async () => {
    mockDriveRootDelta.mockRejectedValueOnce(
      new Error("Microsoft Graph me/drive/root/delta failed: HTTP 503"),
    );

    await expect(
      activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" }),
    ).rejects.toThrow(/HTTP 503/);
    // Subscription must NOT have been attempted.
    expect(mockCreateSubscription).not.toHaveBeenCalled();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former deactivate.test.ts
// ---------------------------------------------------------------------------
describe("deactivate (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDeleteSubscription.mockReset();
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

describe("OneDrive file_changed deactivate", () => {
  it("DELETEs the Graph subscription via the shared wrapper", async () => {
    mockDeleteSubscription.mockResolvedValueOnce(undefined);

    await deactivate({ trigger: baseTrigger, integration: baseIntegration });

    expect(mockDeleteSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "tok",
        subscriptionId: "sub-1",
      }),
    );
  });

  it("threads microsoft-onedrive provider through refreshAndRetry", async () => {
    mockDeleteSubscription.mockResolvedValueOnce(undefined);

    await deactivate({ trigger: baseTrigger, integration: baseIntegration });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "microsoft-onedrive" }),
    );
  });

  it("no-ops when type is not subscription-watch", async () => {
    await deactivate({
      trigger: { ...baseTrigger, config: { type: "polling" } },
      integration: baseIntegration,
    });
    expect(mockDeleteSubscription).not.toHaveBeenCalled();
  });

  it("no-ops when subscriptionId is missing", async () => {
    await deactivate({
      trigger: {
        ...baseTrigger,
        config: { type: "subscription-watch" },
      },
      integration: baseIntegration,
    });
    expect(mockDeleteSubscription).not.toHaveBeenCalled();
  });

  it("swallows NotFoundError (subscription already gone)", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(new NotFoundError("sub-1"));
    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("swallows 403 / ErrorAccessDenied", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions DELETE failed: ErrorAccessDenied"),
    );
    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions DELETE failed: HTTP 500"),
    );
    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).rejects.toThrow(/HTTP 500/);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former index.test.ts
// Module-init registration assertions for the OneDrive file_changed
// trigger. The activation / deactivation / subscription registries are
// populated as a side effect of importing the index module from
// `integrations/_registry.ts`. Importing the trigger module here
// exercises the same wiring.
// Test layout note: registries hold module-scoped state. Resetting +
// re-importing between tests doesn't re-fire the side effects (Jest
// caches the module). Instead we import ONCE at the top, then assert
// the state shape across multiple tests. Same convention as Slice 7's
// eventChanged/index.test.ts.
// ---------------------------------------------------------------------------
describe("index (lifecycle)", () => {

const triggerRow = {
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
    clientState: "x",
    resource: "/me/drive/root",
    changeType: "updated",
  },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("OneDrive file_changed trigger module-init registration", () => {
  it("registers an activation handler under (microsoft-onedrive, file_changed)", () => {
    expect(
      findActivation("microsoft-onedrive", "file_changed"),
    ).not.toBeNull();
  });

  it("registers a deactivation handler under (microsoft-onedrive, file_changed)", () => {
    expect(
      findDeactivation("microsoft-onedrive", "file_changed"),
    ).not.toBeNull();
  });

  it("registers a subscription handler that canHandle subscription-watch rows for this provider+event", () => {
    const handler = findSubscriptionHandler(triggerRow);
    expect(handler).not.toBeNull();
    expect(handler?.id).toBe("microsoft-onedrive:file_changed");
  });

  it("subscription handler does NOT match outlook mail or calendar rows (provider isolation)", () => {
    for (const sibling of [
      { provider: "microsoft-outlook", eventType: "new_email" },
      { provider: "microsoft-outlook-calendar", eventType: "event_changed" },
    ]) {
      const row = {
        ...triggerRow,
        provider: sibling.provider,
        eventType: sibling.eventType,
      };
      const handler = findSubscriptionHandler(row);
      expect(handler?.id).not.toBe("microsoft-onedrive:file_changed");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

const CONTEXT = {
  subscriptionId: "sub-1",
  notificationOccurredAt: "2026-05-09T12:00:00Z",
  providerAccountId: "alice@contoso.com",
  source: "id-fetch" as const,
};

describe("OneDrive file_changed normalize", () => {
  it("produces canonical TriggerEvent shape from a file DriveItem", () => {
    const event = normalize(
      {
        id: "item-1",
        name: "report.pdf",
        size: 4096,
        file: { mimeType: "application/pdf" },
        webUrl: "https://1drv.ms/r",
        "@microsoft.graph.downloadUrl": "https://signed-url",
        parentReference: { id: "p-1", path: "/drive/root:/Reports" },
        createdDateTime: "2026-05-08T10:00:00Z",
        lastModifiedDateTime: "2026-05-09T11:00:00Z",
      },
      CONTEXT,
    );

    expect(event).toEqual({
      provider: "microsoft-onedrive",
      eventType: "file_changed",
      eventId: "sub-1:item-1:2026-05-09T11:00:00Z",
      occurredAt: "2026-05-09T11:00:00Z",
      providerAccountId: "alice@contoso.com",
      payload: {
        itemId: "item-1",
        kind: "file",
        changeType: "updated",
        source: "id-fetch",
        name: "report.pdf",
        size: 4096,
        mimeType: "application/pdf",
        parentReference: { id: "p-1", path: "/drive/root:/Reports" },
        webUrl: "https://1drv.ms/r",
        downloadUrl: "https://signed-url",
        createdDateTime: "2026-05-08T10:00:00Z",
        lastModifiedDateTime: "2026-05-09T11:00:00Z",
      },
    });
  });

  it("derives kind=folder and forces mimeType=null for folder items", () => {
    const event = normalize(
      {
        id: "f-1",
        name: "Reports",
        folder: { childCount: 3 },
        webUrl: "https://1drv.ms/x",
        lastModifiedDateTime: "2026-05-09T11:00:00Z",
      },
      CONTEXT,
    );
    expect(event.payload.kind).toBe("folder");
    expect(event.payload.mimeType).toBeNull();
    expect(event.payload.downloadUrl).toBeNull(); // folders never have signed URLs
  });

  it("dedup eventId shape is ${subscriptionId}:${itemId}:${lastModifiedDateTime}", () => {
    const event = normalize(
      {
        id: "abc",
        file: { mimeType: "text/plain" },
        lastModifiedDateTime: "2026-05-09T11:00:00Z",
      },
      { ...CONTEXT, subscriptionId: "sub-XYZ" },
    );
    expect(event.eventId).toBe("sub-XYZ:abc:2026-05-09T11:00:00Z");
  });

  it("falls back to notificationOccurredAt for the dedup discriminator when lastModifiedDateTime is missing", () => {
    const event = normalize({ id: "x", file: {} }, CONTEXT);
    expect(event.eventId).toBe("sub-1:x:2026-05-09T12:00:00Z");
  });

  it("uses lastModifiedDateTime > createdDateTime > notification fallback for occurredAt", () => {
    const r1 = normalize(
      { id: "i", file: {}, lastModifiedDateTime: "1", createdDateTime: "0" },
      CONTEXT,
    );
    expect(r1.occurredAt).toBe("1");

    const r2 = normalize(
      { id: "i", file: {}, createdDateTime: "0" },
      CONTEXT,
    );
    expect(r2.occurredAt).toBe("0");

    const r3 = normalize({ id: "i", file: {} }, CONTEXT);
    expect(r3.occurredAt).toBe("2026-05-09T12:00:00Z");
  });

  it("surfaces source: 'id-fetch' vs 'delta-fallback' from context for downstream debugging", () => {
    const idFetch = normalize({ id: "i", file: {} }, CONTEXT);
    expect(idFetch.payload.source).toBe("id-fetch");

    const fallback = normalize(
      { id: "i", file: {} },
      { ...CONTEXT, source: "delta-fallback" },
    );
    expect(fallback.payload.source).toBe("delta-fallback");
  });

  it("defaults missing optional fields to null for stable shape", () => {
    const event = normalize({ id: "i", file: {} }, CONTEXT);
    expect(event.payload.name).toBeNull();
    expect(event.payload.size).toBeNull();
    expect(event.payload.mimeType).toBeNull();
    expect(event.payload.parentReference).toBeNull();
    expect(event.payload.webUrl).toBeNull();
    expect(event.payload.downloadUrl).toBeNull();
    expect(event.payload.createdDateTime).toBeNull();
    expect(event.payload.lastModifiedDateTime).toBeNull();
  });
});

describe("OneDrive file_changed normalizeDeleted", () => {
  it("emits stable minimal payload with kind: null + deleted: true + :deleted: dedup infix", () => {
    const event = normalizeDeleted("item-deleted", CONTEXT);
    expect(event.eventId).toBe(
      "sub-1:item-deleted:deleted:2026-05-09T12:00:00Z",
    );
    expect(event.payload).toMatchObject({
      itemId: "item-deleted",
      kind: null,
      name: null,
      mimeType: null,
      deleted: true,
    });
  });

  it("preserves source: 'delta-fallback' for delete events from delta", () => {
    const event = normalizeDeleted("x", {
      ...CONTEXT,
      source: "delta-fallback",
    });
    expect(event.payload.source).toBe("delta-fallback");
  });

  it("preserves source: 'id-fetch' when 404 fired during id-fetch branch", () => {
    const event = normalizeDeleted("x", { ...CONTEXT, source: "id-fetch" });
    expect(event.payload.source).toBe("id-fetch");
  });

  it("payload key set is identical to normalize() (workflow authors see one stable shape) plus the deleted flag", () => {
    const full = normalize({ id: "i", file: {} }, CONTEXT);
    const deleted = normalizeDeleted("i", CONTEXT);
    const fullKeys = Object.keys(full.payload).sort();
    const deletedKeys = Object.keys(deleted.payload).sort();
    // Deleted shape adds a `deleted: true` flag — assert the live keys
    // are a subset.
    for (const k of fullKeys) expect(deletedKeys).toContain(k);
  });
});

describe("isDeletedDeltaItem", () => {
  it("returns true when delta entry carries a deleted facet", () => {
    expect(isDeletedDeltaItem({ id: "x", deleted: { state: "deleted" } })).toBe(
      true,
    );
  });

  it("returns false on live items", () => {
    expect(isDeletedDeltaItem({ id: "x", file: {} })).toBe(false);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former pull.test.ts
// ---------------------------------------------------------------------------
describe("pull (lifecycle)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former renew.test.ts
// ---------------------------------------------------------------------------
describe("renew (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRenewSubscription.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();
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

describe("onedriveFileChangedSubscriptionHandler", () => {
  it("identifies itself with id 'microsoft-onedrive:file_changed'", () => {
    expect(onedriveFileChangedSubscriptionHandler.id).toBe(
      "microsoft-onedrive:file_changed",
    );
  });

  it("canHandle matches subscription-watch rows for microsoft-onedrive/file_changed", () => {
    expect(
      onedriveFileChangedSubscriptionHandler.canHandle(baseTrigger),
    ).toBe(true);
    expect(
      onedriveFileChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        provider: "microsoft-outlook",
      }),
    ).toBe(false);
    expect(
      onedriveFileChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        eventType: "different",
      }),
    ).toBe(false);
    expect(
      onedriveFileChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        config: { ...baseTrigger.config, type: "polling" },
      }),
    ).toBe(false);
  });

  it("declares 1h renewal threshold", () => {
    expect(
      onedriveFileChangedSubscriptionHandler.getRenewalThresholdMs(),
    ).toBe(60 * 60 * 1000);
  });

  it("PATCHes the subscription with a fresh +4230-minute expiration via refreshAndRetry", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await onedriveFileChangedSubscriptionHandler.renew({ trigger: baseTrigger });

    expect(mockRenewSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "tok",
        subscriptionId: "sub-1",
      }),
    );
    const requestedExpiry = Date.parse(
      mockRenewSubscription.mock.calls[0]![0].expirationDateTime,
    );
    const expected = Date.now() + 4230 * 60 * 1000;
    expect(Math.abs(requestedExpiry - expected)).toBeLessThan(60_000);
  });

  it("persists Graph's authoritative new expiresAt and preserves clientState/subscriptionId/deltaToken", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await onedriveFileChangedSubscriptionHandler.renew({ trigger: baseTrigger });

    expect(mockUpdateConfig).toHaveBeenCalledWith("tr-1", {
      type: "subscription-watch",
      subscriptionId: "sub-1",
      clientState: "deadbeef",
      resource: "/me/drive/root",
      changeType: "updated",
      deltaToken: "https://graph/x?token=t",
      expiresAt: "2026-05-15T00:00:00.000Z",
    });
  });

  it("threads microsoft-onedrive provider through refreshAndRetry", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await onedriveFileChangedSubscriptionHandler.renew({ trigger: baseTrigger });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "microsoft-onedrive" }),
    );
  });

  it("throws when subscriptionId is missing from config", async () => {
    await expect(
      onedriveFileChangedSubscriptionHandler.renew({
        trigger: {
          ...baseTrigger,
          config: { ...baseTrigger.config, subscriptionId: undefined },
        },
      }),
    ).rejects.toThrow(/missing subscriptionId/);
  });

  it("throws when no active integration row exists", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      onedriveFileChangedSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/no active integration/);
  });

  it("propagates renewSubscription errors and skips persistence", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions PATCH failed: HTTP 410"),
    );

    await expect(
      onedriveFileChangedSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/HTTP 410/);
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });
});

});
