/**
 * @jest-environment node
 */
const mockListByConfigContains = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockRefreshAndRetry = jest.fn();
const mockEventsGet = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  listByConfigContains: (...args: unknown[]) =>
    mockListByConfigContains(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook-calendar/api/eventsGet", () => ({
  eventsGet: (...args: unknown[]) => mockEventsGet(...args),
}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { receiveOutlookCalendarWebhook } from "@/integrations/microsoft-outlook-calendar/webhooks/receive";

beforeEach(() => {
  mockListByConfigContains.mockReset();
  mockGetActiveForExecution.mockReset();
  mockRefreshAndRetry.mockReset();
  mockEventsGet.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "microsoft-outlook-calendar",
  eventType: "event_changed",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-1",
    clientState: "deadbeef",
    resource: "/me/events",
    changeType: "created,updated,deleted",
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
  provider: "microsoft-outlook-calendar",
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

function makeRequest(opts: {
  url?: string;
  method?: string;
  contentType?: string;
  body?: string;
}): Request {
  return new Request(
    opts.url ?? "https://app.example.test/api/webhooks/microsoft-outlook-calendar",
    {
      method: opts.method ?? "POST",
      headers: opts.contentType
        ? { "Content-Type": opts.contentType }
        : { "Content-Type": "application/json" },
      body: opts.body,
    },
  );
}

const SAMPLE_GRAPH_EVENT = {
  id: "evt-1",
  subject: "Daily standup",
  start: { dateTime: "2026-05-09T14:00:00", timeZone: "America/New_York" },
  end: { dateTime: "2026-05-09T14:15:00", timeZone: "America/New_York" },
  isAllDay: false,
  location: { displayName: "Zoom" },
  attendees: [
    {
      emailAddress: { address: "bob@x.com" },
      type: "required",
    },
  ],
  organizer: { emailAddress: { address: "alice@contoso.com" } },
  isOnlineMeeting: false,
  webLink: "https://outlook.office.com/calendar/...",
  createdDateTime: "2026-05-09T13:00:00Z",
  lastModifiedDateTime: "2026-05-09T13:30:00Z",
  importance: "normal",
};

describe("receiveOutlookCalendarWebhook — validation handshake", () => {
  it("returns the validation token from ?validationToken= query", async () => {
    const req = makeRequest({
      url: "https://app.example.test/api/webhooks/microsoft-outlook-calendar?validationToken=foo-bar",
    });

    const result = await receiveOutlookCalendarWebhook(req);

    expect(result).toEqual({ kind: "validation", token: "foo-bar" });
  });

  it("accepts the legacy ?validationtoken= (lowercase) variant", async () => {
    const req = makeRequest({
      url: "https://app.example.test/api/webhooks/microsoft-outlook-calendar?validationtoken=lc-token",
    });
    const result = await receiveOutlookCalendarWebhook(req);
    expect(result).toEqual({ kind: "validation", token: "lc-token" });
  });

  it("returns the body as token when content-type is text/plain (alternate Microsoft format)", async () => {
    const req = makeRequest({
      contentType: "text/plain",
      body: "validation-body-token",
    });

    const result = await receiveOutlookCalendarWebhook(req);

    expect(result).toEqual({
      kind: "validation",
      token: "validation-body-token",
    });
    // Critical: validation must NOT do DB I/O — Microsoft expects <10s response.
    expect(mockListByConfigContains).not.toHaveBeenCalled();
    expect(mockEventsGet).not.toHaveBeenCalled();
  });

  it("does NOT treat empty text/plain bodies as validation requests", async () => {
    const req = makeRequest({
      contentType: "text/plain",
      body: "   ",
    });

    await expect(
      receiveOutlookCalendarWebhook(req),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });
});

describe("receiveOutlookCalendarWebhook — notifications", () => {
  it("looks up trigger by subscriptionId, verifies clientState, fetches event, and returns normalized event", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockEventsGet.mockResolvedValueOnce(SAMPLE_GRAPH_EVENT);

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "created",
            resource: "users/alice@contoso.com/events/evt-1",
            resourceData: {
              id: "evt-1",
              "@odata.type": "#Microsoft.Graph.Event",
            },
          },
        ],
      }),
    });

    const result = await receiveOutlookCalendarWebhook(req);

    expect(mockListByConfigContains).toHaveBeenCalledWith({
      subscriptionId: "sub-1",
    });
    expect(mockEventsGet).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt-1" }),
    );
    expect(result.kind).toBe("events");
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.provider).toBe("microsoft-outlook-calendar");
    expect(result.events[0]!.eventType).toBe("event_changed");
    expect(result.events[0]!.eventId).toBe("sub-1:evt-1:created");
    expect(result.events[0]!.providerAccountId).toBe("alice@contoso.com");
    expect(result.events[0]!.payload.changeType).toBe("created");
  });

  it("threads microsoft-outlook-calendar (not mail) into refreshAndRetry", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockEventsGet.mockResolvedValueOnce(SAMPLE_GRAPH_EVENT);

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "updated",
            resourceData: {
              id: "evt-1",
              "@odata.type": "#Microsoft.Graph.Event",
            },
          },
        ],
      }),
    });

    await receiveOutlookCalendarWebhook(req);

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "microsoft-outlook-calendar" }),
    );
  });

  it("skips notifications whose subscriptionId has no matching trigger row (deactivated workflow)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([]);

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "stale-sub",
            clientState: "x",
            changeType: "created",
            resourceData: { id: "evt", "@odata.type": "#Microsoft.Graph.Event" },
          },
        ],
      }),
    });

    const result = await receiveOutlookCalendarWebhook(req);

    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockEventsGet).not.toHaveBeenCalled();
  });

  it("skips notifications with mismatched clientState (never throws — avoids probing exposure)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "WRONG",
            changeType: "created",
            resourceData: { id: "evt-1", "@odata.type": "#Microsoft.Graph.Event" },
          },
        ],
      }),
    });

    const result = await receiveOutlookCalendarWebhook(req);

    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockEventsGet).not.toHaveBeenCalled();
  });

  it("emits minimal payload (subject: null) when changeType=deleted and the eventsGet returns 404", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockEventsGet.mockRejectedValueOnce(new NotFoundError("event evt-gone"));

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "deleted",
            resourceData: {
              id: "evt-gone",
              "@odata.type": "#Microsoft.Graph.Event",
            },
          },
        ],
      }),
    });

    const result = await receiveOutlookCalendarWebhook(req);

    expect(result.kind).toBe("events");
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.eventId).toBe("sub-1:evt-gone:deleted");
    expect(result.events[0]!.payload.changeType).toBe("deleted");
    expect(result.events[0]!.payload.subject).toBeNull();
    expect(result.events[0]!.payload.eventId).toBe("evt-gone");
    // Sentinel for "we know it was deleted but couldn't fetch the body."
    expect(result.events[0]!.payload.body).toBeNull();
  });

  it("skips (does NOT emit minimal payload) when changeType=created/updated and eventsGet 404s — body is unrecoverable", async () => {
    mockListByConfigContains.mockResolvedValue([baseTrigger]);
    mockGetActiveForExecution.mockResolvedValue(baseIntegration);
    mockEventsGet.mockRejectedValueOnce(new NotFoundError("event evt-gone"));

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "updated",
            resourceData: {
              id: "evt-gone",
              "@odata.type": "#Microsoft.Graph.Event",
            },
          },
        ],
      }),
    });

    const result = await receiveOutlookCalendarWebhook(req);

    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("propagates non-NotFound errors from eventsGet (route maps to 5xx so Microsoft retries)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockEventsGet.mockRejectedValueOnce(
      new Error("Microsoft Graph me/events/{id} GET failed: HTTP 503"),
    );

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "updated",
            resourceData: {
              id: "evt-1",
              "@odata.type": "#Microsoft.Graph.Event",
            },
          },
        ],
      }),
    });

    await expect(receiveOutlookCalendarWebhook(req)).rejects.toThrow(
      /HTTP 503/,
    );
  });

  it("processes a batch of multiple notifications and returns a flat events list", async () => {
    mockListByConfigContains.mockResolvedValue([baseTrigger]);
    mockGetActiveForExecution.mockResolvedValue(baseIntegration);
    mockEventsGet
      .mockResolvedValueOnce({ ...SAMPLE_GRAPH_EVENT, id: "evt-1" })
      .mockResolvedValueOnce({ ...SAMPLE_GRAPH_EVENT, id: "evt-2" });

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "created",
            resourceData: { id: "evt-1", "@odata.type": "#Microsoft.Graph.Event" },
          },
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "updated",
            resourceData: { id: "evt-2", "@odata.type": "#Microsoft.Graph.Event" },
          },
        ],
      }),
    });

    const result = await receiveOutlookCalendarWebhook(req);

    expect(result.kind).toBe("events");
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events.map((e) => e.eventId)).toEqual([
      "sub-1:evt-1:created",
      "sub-1:evt-2:updated",
    ]);
  });

  it("returns kind=events with empty list when value: [] (Microsoft sends empty batches)", async () => {
    const req = makeRequest({ body: JSON.stringify({ value: [] }) });
    const result = await receiveOutlookCalendarWebhook(req);
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("throws InvalidSignatureError on malformed JSON body", async () => {
    const req = makeRequest({ body: "{not json" });
    await expect(
      receiveOutlookCalendarWebhook(req),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("skips notifications with missing subscriptionId or eventId", async () => {
    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            // Neither subscriptionId nor eventId — malformed
            clientState: "x",
            changeType: "created",
            resourceData: {},
          },
        ],
      }),
    });

    const result = await receiveOutlookCalendarWebhook(req);
    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockListByConfigContains).not.toHaveBeenCalled();
  });

  it("skips notifications whose @odata.type is NOT #Microsoft.Graph.Event (calendar-level changes)", async () => {
    // Slice 7 plan §"Risk callouts" #3: subscription on /me/events
    // occasionally fires for calendar-level changes. We silently skip
    // anything other than event-shaped resources.
    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "updated",
            resource: "users/alice@contoso.com/calendars/cal-1",
            resourceData: {
              id: "cal-1",
              "@odata.type": "#Microsoft.Graph.Calendar",
            },
          },
        ],
      }),
    });

    const result = await receiveOutlookCalendarWebhook(req);
    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockListByConfigContains).not.toHaveBeenCalled();
    expect(mockEventsGet).not.toHaveBeenCalled();
  });

  it("matches @odata.type case-insensitively (Graph occasionally varies casing)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockEventsGet.mockResolvedValueOnce(SAMPLE_GRAPH_EVENT);

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "created",
            resourceData: {
              id: "evt-1",
              "@odata.type": "#microsoft.graph.event",
            },
          },
        ],
      }),
    });

    const result = await receiveOutlookCalendarWebhook(req);
    expect(result.kind).toBe("events");
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });

  it("treats notifications without @odata.type as event-shaped (back-compat)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockEventsGet.mockResolvedValueOnce(SAMPLE_GRAPH_EVENT);

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "created",
            resourceData: { id: "evt-1" },
          },
        ],
      }),
    });

    const result = await receiveOutlookCalendarWebhook(req);
    expect(result.kind).toBe("events");
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });
});
