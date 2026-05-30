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
  "@/integrations/microsoft-teams/triggers/newChannelMessage/pull",
  () => ({
    pull: (...args: unknown[]) => mockPull(...args),
  }),
);

import { InvalidSignatureError } from "@/core/triggers/errors";
import { receiveTeamsWebhook } from "@/integrations/microsoft-teams/webhooks/receive";

beforeEach(() => {
  mockListByConfigContains.mockReset();
  mockPull.mockReset();
  mockPull.mockResolvedValue({ events: [] });
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "microsoft-teams",
  eventType: "new_channel_message",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-1",
    clientState: "deadbeef",
    resource: "/teams/team-1/channels/ch-1/messages",
    changeType: "created",
    teamId: "team-1",
    channelId: "ch-1",
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
    opts.url ?? "https://app.example.test/api/webhooks/microsoft-teams",
    {
      method: opts.method ?? "POST",
      headers: opts.contentType
        ? { "Content-Type": opts.contentType }
        : { "Content-Type": "application/json" },
      body: opts.body,
    },
  );
}

function notification(overrides: Record<string, unknown> = {}): unknown {
  return {
    subscriptionId: "sub-1",
    clientState: "deadbeef",
    changeType: "created",
    resource: "teams('team-1')/channels('ch-1')/messages('msg-1')",
    resourceData: {
      id: "msg-1",
      "@odata.type": "#Microsoft.Graph.chatMessage",
    },
    tenantId: "tenant-1",
    subscriptionExpirationDateTime: "2026-05-12T00:00:00Z",
    ...overrides,
  };
}

describe("receiveTeamsWebhook — validation handshake", () => {
  it("returns the validation token from ?validationToken= query without DB I/O", async () => {
    const req = makeRequest({
      url: "https://app.example.test/api/webhooks/microsoft-teams?validationToken=foo",
    });

    const result = await receiveTeamsWebhook(req);

    expect(result).toEqual({ kind: "validation", token: "foo" });
    expect(mockListByConfigContains).not.toHaveBeenCalled();
    expect(mockPull).not.toHaveBeenCalled();
  });

  it("returns the body as token when content-type is text/plain (alt Microsoft format)", async () => {
    const req = makeRequest({
      contentType: "text/plain",
      body: "validation-body-token",
    });

    const result = await receiveTeamsWebhook(req);

    expect(result).toEqual({
      kind: "validation",
      token: "validation-body-token",
    });
  });
});

describe("receiveTeamsWebhook — notification dispatch", () => {
  it("matches notification to trigger by subscriptionId then calls pull", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockPull.mockResolvedValueOnce({
      events: [
        {
          provider: "microsoft-teams",
          eventType: "new_channel_message",
          eventId: "sub-1:msg-1:created",
          occurredAt: "2026-05-10T12:00:00.000Z",
          providerAccountId: "alice@contoso.com",
          payload: { messageId: "msg-1" },
        },
      ],
    });

    const result = await receiveTeamsWebhook(
      makeRequest({
        body: JSON.stringify({ value: [notification()] }),
      }),
    );

    expect(mockListByConfigContains).toHaveBeenCalledWith({
      subscriptionId: "sub-1",
    });
    expect(mockPull).toHaveBeenCalledTimes(1);
    expect(mockPull.mock.calls[0]![1]).toBe("msg-1");
    expect(result.kind).toBe("events");
    if (result.kind === "events") {
      expect(result.events).toHaveLength(1);
    }
  });

  it("skips notification when clientState mismatches (NEVER throws — avoids probing exposure)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);

    const result = await receiveTeamsWebhook(
      makeRequest({
        body: JSON.stringify({
          value: [notification({ clientState: "0".repeat(64) })],
        }),
      }),
    );

    expect(mockPull).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("skips notification when subscription is unknown (no matching trigger row)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([]);

    const result = await receiveTeamsWebhook(
      makeRequest({
        body: JSON.stringify({ value: [notification()] }),
      }),
    );

    expect(mockPull).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("skips notifications with non-chatMessage @odata.type", async () => {
    const result = await receiveTeamsWebhook(
      makeRequest({
        body: JSON.stringify({
          value: [
            notification({
              resourceData: {
                id: "x",
                "@odata.type": "#Microsoft.Graph.team",
              },
            }),
          ],
        }),
      }),
    );

    expect(mockListByConfigContains).not.toHaveBeenCalled();
    expect(mockPull).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("skips notifications missing subscriptionId", async () => {
    const result = await receiveTeamsWebhook(
      makeRequest({
        body: JSON.stringify({
          value: [notification({ subscriptionId: undefined })],
        }),
      }),
    );

    expect(mockListByConfigContains).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("skips notifications without a resourceData.id", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);

    const result = await receiveTeamsWebhook(
      makeRequest({
        body: JSON.stringify({
          value: [
            notification({
              resourceData: { "@odata.type": "#Microsoft.Graph.chatMessage" },
            }),
          ],
        }),
      }),
    );

    expect(mockPull).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("returns empty events when envelope.value is empty", async () => {
    const result = await receiveTeamsWebhook(
      makeRequest({ body: JSON.stringify({ value: [] }) }),
    );

    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("throws InvalidSignatureError when body is not valid JSON", async () => {
    await expect(
      receiveTeamsWebhook(makeRequest({ body: "this is not json" })),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("propagates pull errors so the route returns 500 (Microsoft retries)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockPull.mockRejectedValueOnce(new Error("Graph 500"));

    await expect(
      receiveTeamsWebhook(
        makeRequest({ body: JSON.stringify({ value: [notification()] }) }),
      ),
    ).rejects.toThrow(/Graph 500/);
  });

  it("processes multiple notifications in one envelope", async () => {
    mockListByConfigContains.mockResolvedValue([baseTrigger]);
    mockPull.mockResolvedValueOnce({
      events: [
        {
          provider: "microsoft-teams",
          eventType: "new_channel_message",
          eventId: "sub-1:msg-A:created",
          occurredAt: "2026-05-10T12:00:00Z",
          providerAccountId: "alice@contoso.com",
          payload: { messageId: "msg-A" },
        },
      ],
    });
    mockPull.mockResolvedValueOnce({
      events: [
        {
          provider: "microsoft-teams",
          eventType: "new_channel_message",
          eventId: "sub-1:msg-B:created",
          occurredAt: "2026-05-10T12:01:00Z",
          providerAccountId: "alice@contoso.com",
          payload: { messageId: "msg-B" },
        },
      ],
    });

    const result = await receiveTeamsWebhook(
      makeRequest({
        body: JSON.stringify({
          value: [
            notification({ resourceData: { id: "msg-A", "@odata.type": "#Microsoft.Graph.chatMessage" } }),
            notification({ resourceData: { id: "msg-B", "@odata.type": "#Microsoft.Graph.chatMessage" } }),
          ],
        }),
      }),
    );

    expect(mockPull).toHaveBeenCalledTimes(2);
    expect(result.kind).toBe("events");
    if (result.kind === "events") {
      expect(result.events).toHaveLength(2);
      expect(result.events.map((e) => e.eventId)).toEqual([
        "sub-1:msg-A:created",
        "sub-1:msg-B:created",
      ]);
    }
  });
});
