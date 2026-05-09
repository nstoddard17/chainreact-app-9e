/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockEventsUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook-calendar/api/eventsUpdate", () => ({
  eventsUpdate: (...args: unknown[]) => mockEventsUpdate(...args),
}));

import { updateEvent } from "@/integrations/microsoft-outlook-calendar/actions/updateEvent";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockEventsUpdate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-outlook-calendar",
    eventType: "event_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    accountId: "alice@contoso.com",
    payload: {},
  };
}

describe("update_event action", () => {
  it("PATCHes only fields explicitly provided (subject)", async () => {
    mockEventsUpdate.mockResolvedValueOnce({
      id: "evt-1",
      subject: "Renamed Meeting",
    });

    await updateEvent({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { eventId: "evt-1", subject: "Renamed Meeting" },
      triggerEvent: trigger(),
    });

    expect(mockEventsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "tok",
        eventId: "evt-1",
        body: { subject: "Renamed Meeting" },
      }),
    );
  });

  it("includes resolved timezone for start when start is provided", async () => {
    mockEventsUpdate.mockResolvedValueOnce({ id: "evt-1" });

    await updateEvent({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        eventId: "evt-1",
        start: { dateTime: "2026-05-15T15:00:00", timeZone: "America/New_York" },
      },
      triggerEvent: trigger(),
    });

    const body = mockEventsUpdate.mock.calls[0]![0].body;
    expect(body.start).toEqual({
      dateTime: "2026-05-15T15:00:00",
      timeZone: "America/New_York",
    });
    // end was not provided → not in patch.
    expect(body.end).toBeUndefined();
  });

  it("falls back to UTC when timeZone omitted on a provided start/end", async () => {
    mockEventsUpdate.mockResolvedValueOnce({ id: "evt-1" });

    await updateEvent({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        eventId: "evt-1",
        end: { dateTime: "2026-05-15T16:00:00" },
      },
      triggerEvent: trigger(),
    });

    const body = mockEventsUpdate.mock.calls[0]![0].body;
    expect(body.end).toEqual({
      dateTime: "2026-05-15T16:00:00",
      timeZone: "UTC",
    });
  });

  it("forwards body + bodyContentType + location + responseRequested + isAllDay", async () => {
    mockEventsUpdate.mockResolvedValueOnce({ id: "evt-1" });

    await updateEvent({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        eventId: "evt-1",
        body: "<p>New agenda</p>",
        bodyContentType: "HTML",
        location: "Zoom",
        responseRequested: false,
        isAllDay: false,
      },
      triggerEvent: trigger(),
    });

    const body = mockEventsUpdate.mock.calls[0]![0].body;
    expect(body.body).toEqual({
      contentType: "HTML",
      content: "<p>New agenda</p>",
    });
    expect(body.location).toEqual({ displayName: "Zoom" });
    expect(body.responseRequested).toBe(false);
    expect(body.isAllDay).toBe(false);
  });

  it("REPLACES the attendee list with parsed addresses (Graph PATCH semantic)", async () => {
    mockEventsUpdate.mockResolvedValueOnce({ id: "evt-1" });

    await updateEvent({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        eventId: "evt-1",
        attendees: ["new-alice@x.com", "new-bob@x.com"],
      },
      triggerEvent: trigger(),
    });

    const body = mockEventsUpdate.mock.calls[0]![0].body;
    expect(body.attendees).toEqual([
      { emailAddress: { address: "new-alice@x.com" }, type: "required" },
      { emailAddress: { address: "new-bob@x.com" }, type: "required" },
    ]);
  });

  it("rejects update with only eventId (no mutable fields — would be a no-op PATCH)", async () => {
    await expect(
      updateEvent({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { eventId: "evt-1" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/at least one mutable field/);
    expect(mockEventsUpdate).not.toHaveBeenCalled();
  });

  it("rejects body without bodyContentType (Q11 cross-field refine)", async () => {
    await expect(
      updateEvent({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { eventId: "evt-1", body: "hi" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/bodyContentType/);
  });

  it("rejects missing eventId", async () => {
    await expect(
      updateEvent({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { subject: "x" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("propagates non-401 errors from the wrapper verbatim", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Error("graph-boom"));

    await expect(
      updateEvent({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { eventId: "evt-1", subject: "x" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/graph-boom/);
  });
});
