/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockEventsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook-calendar/api/eventsList", () => ({
  eventsList: (...args: unknown[]) => mockEventsList(...args),
}));

import { listEvents } from "@/integrations/microsoft-outlook-calendar/actions/listEvents";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockEventsList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(provider: string = "microsoft-outlook-calendar"): TriggerEvent {
  return {
    provider,
    eventType: "event_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    accountId: "alice@contoso.com",
    payload: {},
  };
}

describe("list_events action", () => {
  it("forwards date range when both supplied (calendarView path)", async () => {
    mockEventsList.mockResolvedValueOnce({ events: [], nextLink: null });

    await listEvents({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        startDateTime: "2026-05-09T00:00:00Z",
        endDateTime: "2026-05-16T00:00:00Z",
      },
      triggerEvent: trigger(),
    });

    expect(mockEventsList).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "tok",
        startDateTime: "2026-05-09T00:00:00Z",
        endDateTime: "2026-05-16T00:00:00Z",
      }),
    );
  });

  it("uses defaults: top=25, orderBy=start (no date range → /me/events path in wrapper)", async () => {
    mockEventsList.mockResolvedValueOnce({ events: [], nextLink: null });

    await listEvents({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });

    const call = mockEventsList.mock.calls[0]![0];
    expect(call.top).toBe(25);
    expect(call.orderBy).toBe("start");
    expect(call.startDateTime).toBeUndefined();
    expect(call.endDateTime).toBeUndefined();
  });

  it("rejects startDateTime without endDateTime (cross-field refine)", async () => {
    await expect(
      listEvents({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { startDateTime: "2026-05-09T00:00:00Z" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/together/);
    expect(mockEventsList).not.toHaveBeenCalled();
  });

  it("rejects endDateTime without startDateTime", async () => {
    await expect(
      listEvents({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { endDateTime: "2026-05-16T00:00:00Z" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/together/);
  });

  it("rejects top values outside [1, 100]", async () => {
    await expect(
      listEvents({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { top: 0 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();

    await expect(
      listEvents({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { top: 200 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("normalizes wrapper response into stable per-event output shape", async () => {
    mockEventsList.mockResolvedValueOnce({
      events: [
        {
          id: "evt-1",
          subject: "Standup",
          start: { dateTime: "2026-05-15T14:30:00", timeZone: "UTC" },
          end: { dateTime: "2026-05-15T15:30:00", timeZone: "UTC" },
          isAllDay: false,
          location: { displayName: "Zoom" },
          attendees: [
            {
              emailAddress: { name: "Alice", address: "alice@x.com" },
              type: "required",
              status: { response: "accepted" },
            },
          ],
          organizer: { emailAddress: { name: "Bob", address: "bob@x.com" } },
          isOnlineMeeting: true,
          onlineMeeting: { joinUrl: "https://teams.microsoft.com/..." },
          importance: "high",
          sensitivity: "normal",
          showAs: "busy",
          webLink: "https://outlook.office.com/...",
          createdDateTime: "2026-05-09T10:00:00Z",
          lastModifiedDateTime: "2026-05-09T11:00:00Z",
        },
      ],
      nextLink: null,
    });

    const result = await listEvents({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({
      count: 1,
      hasMore: false,
      nextLink: null,
      events: [
        {
          id: "evt-1",
          subject: "Standup",
          start: { dateTime: "2026-05-15T14:30:00", timeZone: "UTC" },
          end: { dateTime: "2026-05-15T15:30:00", timeZone: "UTC" },
          isAllDay: false,
          location: "Zoom",
          attendees: [
            {
              name: "Alice",
              address: "alice@x.com",
              type: "required",
              status: "accepted",
            },
          ],
          organizer: { name: "Bob", address: "bob@x.com" },
          isOnlineMeeting: true,
          onlineMeetingUrl: "https://teams.microsoft.com/...",
          importance: "high",
          sensitivity: "normal",
          showAs: "busy",
          webLink: "https://outlook.office.com/...",
          createdDateTime: "2026-05-09T10:00:00Z",
          lastModifiedDateTime: "2026-05-09T11:00:00Z",
        },
      ],
    });
  });

  it("hasMore=true when wrapper returns nextLink", async () => {
    mockEventsList.mockResolvedValueOnce({
      events: [{ id: "evt-1" }],
      nextLink: "https://graph.microsoft.com/v1.0/me/events?$skiptoken=abc",
    });

    const result = await listEvents({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });

    expect(result.output.hasMore).toBe(true);
    expect(result.output.nextLink).toBe(
      "https://graph.microsoft.com/v1.0/me/events?$skiptoken=abc",
    );
  });

  it("forwards subjectFilter to the wrapper", async () => {
    mockEventsList.mockResolvedValueOnce({ events: [], nextLink: null });

    await listEvents({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { subjectFilter: "standup" },
      triggerEvent: trigger(),
    });

    expect(mockEventsList).toHaveBeenCalledWith(
      expect.objectContaining({ subjectFilter: "standup" }),
    );
  });

  it("propagates non-401 errors from the wrapper verbatim", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Error("graph-boom"));

    await expect(
      listEvents({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {},
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/graph-boom/);
  });
});
