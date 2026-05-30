/**
 * @jest-environment node
 */
const mockListByConfigContains = jest.fn();
const mockPull = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  listByConfigContains: (...args: unknown[]) =>
    mockListByConfigContains(...args),
}));

jest.mock(
  "@/integrations/microsoft-onedrive/triggers/fileChanged/pull",
  () => ({
    pull: (...args: unknown[]) => mockPull(...args),
  }),
);

import { InvalidSignatureError } from "@/core/triggers/errors";
import { receiveOneDriveWebhook } from "@/integrations/microsoft-onedrive/webhooks/receive";

beforeEach(() => {
  mockListByConfigContains.mockReset();
  mockPull.mockReset();
  // Default pull returns no events; per-test overrides as needed.
  mockPull.mockResolvedValue({ events: [] });
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
  providerAccountId: "alice@contoso.com",
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

function makeRequest(opts: {
  url?: string;
  method?: string;
  contentType?: string;
  body?: string;
}): Request {
  return new Request(
    opts.url ?? "https://app.example.test/api/webhooks/microsoft-onedrive",
    {
      method: opts.method ?? "POST",
      headers: opts.contentType
        ? { "Content-Type": opts.contentType }
        : { "Content-Type": "application/json" },
      body: opts.body,
    },
  );
}

describe("receiveOneDriveWebhook — validation handshake", () => {
  it("returns the validation token from ?validationToken= query without DB I/O", async () => {
    const req = makeRequest({
      url: "https://app.example.test/api/webhooks/microsoft-onedrive?validationToken=foo",
    });

    const result = await receiveOneDriveWebhook(req);

    expect(result).toEqual({ kind: "validation", token: "foo" });
    expect(mockListByConfigContains).not.toHaveBeenCalled();
    expect(mockPull).not.toHaveBeenCalled();
  });

  it("returns the body as token when content-type is text/plain (alternate Microsoft format)", async () => {
    const req = makeRequest({
      contentType: "text/plain",
      body: "validation-body-token",
    });

    const result = await receiveOneDriveWebhook(req);

    expect(result).toEqual({
      kind: "validation",
      token: "validation-body-token",
    });
    expect(mockListByConfigContains).not.toHaveBeenCalled();
  });

  it("does NOT treat empty text/plain bodies as validation requests", async () => {
    const req = makeRequest({ contentType: "text/plain", body: "   " });
    await expect(receiveOneDriveWebhook(req)).rejects.toBeInstanceOf(
      InvalidSignatureError,
    );
  });
});

describe("receiveOneDriveWebhook — notifications", () => {
  it("id-fetch branch: notification with item id triggers pull(mode='id-fetch', itemId)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockPull.mockResolvedValueOnce({
      events: [
        {
          provider: "microsoft-onedrive",
          eventType: "file_changed",
          eventId: "sub-1:item-1:ts",
          occurredAt: "ts",
          providerAccountId: "alice@contoso.com",
          payload: { itemId: "item-1", source: "id-fetch" },
        },
      ],
    });

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "updated",
            resource: "users/alice/drive/items/item-1",
            resourceData: {
              id: "item-1",
              "@odata.type": "#Microsoft.Graph.DriveItem",
            },
          },
        ],
      }),
    });

    const result = await receiveOneDriveWebhook(req);

    expect(mockListByConfigContains).toHaveBeenCalledWith({
      subscriptionId: "sub-1",
    });
    expect(mockPull).toHaveBeenCalledWith(
      baseTrigger,
      { kind: "id-fetch", itemId: "item-1" },
      expect.any(String),
    );
    expect(result.kind).toBe("events");
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });

  it("delta-fallback branch: notification without item id triggers pull(mode='delta-fallback')", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockPull.mockResolvedValueOnce({
      events: [
        {
          provider: "microsoft-onedrive",
          eventType: "file_changed",
          eventId: "sub-1:i:ts",
          occurredAt: "ts",
          providerAccountId: "alice@contoso.com",
          payload: { source: "delta-fallback" },
        },
      ],
    });

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "updated",
            resource: "users/alice/drive/root",
            resourceData: { "@odata.type": "#Microsoft.Graph.DriveItem" },
          },
        ],
      }),
    });

    await receiveOneDriveWebhook(req);

    expect(mockPull).toHaveBeenCalledWith(
      baseTrigger,
      { kind: "delta-fallback" },
      expect.any(String),
    );
  });

  it("delta-fallback branch: resourceData.id === 'root' (literal sentinel) routes to delta", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "updated",
            resourceData: {
              id: "root",
              "@odata.type": "#Microsoft.Graph.DriveItem",
            },
          },
        ],
      }),
    });

    await receiveOneDriveWebhook(req);

    expect(mockPull).toHaveBeenCalledWith(
      baseTrigger,
      { kind: "delta-fallback" },
      expect.any(String),
    );
  });

  it("skips notifications with mismatched clientState (logged + dropped, never thrown)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "WRONG",
            changeType: "updated",
            resourceData: {
              id: "item-1",
              "@odata.type": "#Microsoft.Graph.DriveItem",
            },
          },
        ],
      }),
    });

    const result = await receiveOneDriveWebhook(req);

    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockPull).not.toHaveBeenCalled();
  });

  it("skips notifications whose subscriptionId has no matching trigger row (deactivated workflow)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([]);

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "stale-sub",
            clientState: "x",
            changeType: "updated",
            resourceData: {
              id: "item-1",
              "@odata.type": "#Microsoft.Graph.DriveItem",
            },
          },
        ],
      }),
    });

    const result = await receiveOneDriveWebhook(req);

    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockPull).not.toHaveBeenCalled();
  });

  it("skips notifications whose @odata.type is NOT #Microsoft.Graph.DriveItem", async () => {
    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "updated",
            resourceData: {
              id: "x",
              "@odata.type": "#Microsoft.Graph.Calendar",
            },
          },
        ],
      }),
    });

    const result = await receiveOneDriveWebhook(req);

    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockListByConfigContains).not.toHaveBeenCalled();
    expect(mockPull).not.toHaveBeenCalled();
  });

  it("matches @odata.type case-insensitively (Graph occasionally varies casing)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "updated",
            resourceData: {
              id: "item-1",
              "@odata.type": "#microsoft.graph.driveitem",
            },
          },
        ],
      }),
    });

    await receiveOneDriveWebhook(req);
    expect(mockPull).toHaveBeenCalled();
  });

  it("treats notifications without @odata.type as drive-item-shaped (back-compat)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "updated",
            resourceData: { id: "item-1" },
          },
        ],
      }),
    });

    await receiveOneDriveWebhook(req);
    expect(mockPull).toHaveBeenCalled();
  });

  it("processes a batch of multiple notifications and returns a flat events list", async () => {
    mockListByConfigContains.mockResolvedValue([baseTrigger]);
    mockPull
      .mockResolvedValueOnce({
        events: [
          {
            provider: "microsoft-onedrive",
            eventType: "file_changed",
            eventId: "a",
            occurredAt: "t",
            providerAccountId: "u",
            payload: {},
          },
        ],
      })
      .mockResolvedValueOnce({
        events: [
          {
            provider: "microsoft-onedrive",
            eventType: "file_changed",
            eventId: "b",
            occurredAt: "t",
            providerAccountId: "u",
            payload: {},
          },
        ],
      });

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            resourceData: {
              id: "i-1",
              "@odata.type": "#Microsoft.Graph.DriveItem",
            },
          },
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            resourceData: {
              id: "i-2",
              "@odata.type": "#Microsoft.Graph.DriveItem",
            },
          },
        ],
      }),
    });

    const result = await receiveOneDriveWebhook(req);
    expect(result.kind).toBe("events");
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events.map((e) => e.eventId)).toEqual(["a", "b"]);
  });

  it("returns kind=events with empty list when value: [] (Microsoft sends empty batches)", async () => {
    const req = makeRequest({ body: JSON.stringify({ value: [] }) });
    const result = await receiveOneDriveWebhook(req);
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("throws InvalidSignatureError on malformed JSON body", async () => {
    const req = makeRequest({ body: "{not json" });
    await expect(receiveOneDriveWebhook(req)).rejects.toBeInstanceOf(
      InvalidSignatureError,
    );
  });

  it("skips notifications with missing subscriptionId", async () => {
    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            clientState: "x",
            changeType: "updated",
            resourceData: {
              id: "i",
              "@odata.type": "#Microsoft.Graph.DriveItem",
            },
          },
        ],
      }),
    });

    const result = await receiveOneDriveWebhook(req);
    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockListByConfigContains).not.toHaveBeenCalled();
  });
});
