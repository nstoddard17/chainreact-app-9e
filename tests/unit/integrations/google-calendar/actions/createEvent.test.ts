/**
 * @jest-environment node
 *
 * Tests for the Google Calendar createEvent action handler. Mocks
 * refreshAndRetry + eventsInsert at the module boundary; the handler's
 * apiCall closure is exercised by driving refreshAndRetry to invoke it.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockEventsInsert = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-calendar/api/eventsInsert", () => ({
  eventsInsert: (...args: unknown[]) => mockEventsInsert(...args),
}));

import { createEvent } from "@/integrations/google-calendar/actions/createEvent";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockEventsInsert.mockReset();
});

function calendarTrigger(accountId: string): TriggerEvent {
  return {
    provider: "google-calendar",
    eventType: "event_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    accountId,
    payload: {},
  };
}

function nonCalendarTrigger(): TriggerEvent {
  return {
    provider: "slack",
    eventType: "message_received",
    eventId: "evt-2",
    occurredAt: "2026-05-08T12:00:00Z",
    accountId: "T123",
    payload: {},
  };
}

const VALID_TIMED = {
  summary: "Standup",
  startDateTime: "2026-05-08T15:00:00Z",
  endDateTime: "2026-05-08T15:30:00Z",
  timezone: "America/New_York",
  sendNotifications: "all",
  guestsCanInviteOthers: false,
  guestsCanSeeOtherGuests: true,
};

function baseInput(overrides: { config?: Record<string, unknown>; triggerEvent?: TriggerEvent } = {}) {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    runId: "run-abc",
    nodeId: "node-create",
    config: overrides.config ?? VALID_TIMED,
    triggerEvent: overrides.triggerEvent ?? calendarTrigger("alice@example.com"),
  };
}

describe("createEvent — refreshAndRetry usage", () => {
  it("calls refreshAndRetry with userId, provider, and Calendar trigger accountId", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ id: "evt-99" });

    await createEvent(baseInput());

    const call = mockRefreshAndRetry.mock.calls[0]![0];
    expect(call.userId).toBe("user-1");
    expect(call.provider).toBe("google-calendar");
    expect(call.accountId).toBe("alice@example.com");
  });

  it("passes accountId: null when the trigger is not Calendar-shaped", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ id: "evt-99" });

    await createEvent(baseInput({ triggerEvent: nonCalendarTrigger() }));

    expect(mockRefreshAndRetry.mock.calls[0]![0].accountId).toBeNull();
  });
});

describe("createEvent — request body shape", () => {
  function driveApiCallWith(token: string) {
    mockRefreshAndRetry.mockImplementation(async (input: { apiCall: (t: string) => Promise<unknown> }) => {
      return await input.apiCall(token);
    });
  }

  it("sends timed event with start/end dateTime + timezone", async () => {
    driveApiCallWith("tok-1");
    mockEventsInsert.mockResolvedValueOnce({ id: "evt-1" });

    await createEvent(baseInput());

    const args = mockEventsInsert.mock.calls[0]![0];
    expect(args.accessToken).toBe("tok-1");
    expect(args.calendarId).toBe("primary");
    expect(args.body.summary).toBe("Standup");
    expect(args.body.start).toEqual({
      dateTime: "2026-05-08T15:00:00Z",
      timeZone: "America/New_York",
    });
    expect(args.body.end).toEqual({
      dateTime: "2026-05-08T15:30:00Z",
      timeZone: "America/New_York",
    });
    expect(args.sendUpdates).toBe("all");
  });

  it("falls back to UTC when timezone is unset", async () => {
    driveApiCallWith("t");
    mockEventsInsert.mockResolvedValueOnce({ id: "e" });

    await createEvent(
      baseInput({
        config: { ...VALID_TIMED, timezone: undefined },
      }),
    );

    expect(mockEventsInsert.mock.calls[0]![0].body.start.timeZone).toBe("UTC");
    expect(mockEventsInsert.mock.calls[0]![0].body.end.timeZone).toBe("UTC");
  });

  it("encodes all-day events with start.date / end.date (no timeZone)", async () => {
    driveApiCallWith("t");
    mockEventsInsert.mockResolvedValueOnce({ id: "e" });

    await createEvent(
      baseInput({
        config: {
          summary: "Birthday",
          allDay: true,
          startDate: "2026-06-01",
          endDate: "2026-06-02",
          sendNotifications: "none",
          guestsCanInviteOthers: false,
          guestsCanSeeOtherGuests: false,
        },
      }),
    );

    const body = mockEventsInsert.mock.calls[0]![0].body;
    expect(body.start).toEqual({ date: "2026-06-01" });
    expect(body.end).toEqual({ date: "2026-06-02" });
    expect(body.start.timeZone).toBeUndefined();
  });

  it("parses CSV attendees via parseRecipients (Q7) and only sends guest perms when attendees > 0", async () => {
    driveApiCallWith("t");
    mockEventsInsert.mockResolvedValueOnce({ id: "e" });

    await createEvent(
      baseInput({
        config: {
          ...VALID_TIMED,
          attendees: " alice@x.com, bob@x.com ,carol@x.com",
          guestsCanInviteOthers: false,
          guestsCanSeeOtherGuests: true,
        },
      }),
    );

    const body = mockEventsInsert.mock.calls[0]![0].body;
    expect(body.attendees).toEqual([
      { email: "alice@x.com" },
      { email: "bob@x.com" },
      { email: "carol@x.com" },
    ]);
    expect(body.guestsCanInviteOthers).toBe(false);
    expect(body.guestsCanSeeOtherGuests).toBe(true);
  });

  it("does NOT include guest perm fields when no attendees", async () => {
    driveApiCallWith("t");
    mockEventsInsert.mockResolvedValueOnce({ id: "e" });

    await createEvent(baseInput()); // no attendees

    const body = mockEventsInsert.mock.calls[0]![0].body;
    expect(body.attendees).toBeUndefined();
    expect(body.guestsCanInviteOthers).toBeUndefined();
    expect(body.guestsCanSeeOtherGuests).toBeUndefined();
  });

  it("attaches stable conferenceData.requestId from runId+nodeId when googleMeet=true (Q4)", async () => {
    driveApiCallWith("t");
    mockEventsInsert.mockResolvedValueOnce({ id: "e" });

    await createEvent(
      baseInput({ config: { ...VALID_TIMED, googleMeet: true } }),
    );

    const args = mockEventsInsert.mock.calls[0]![0];
    expect(args.conferenceDataVersion).toBe(1);
    expect(args.body.conferenceData.createRequest.requestId).toBe(
      "meet-run-abc:node-create",
    );
    expect(
      args.body.conferenceData.createRequest.conferenceSolutionKey.type,
    ).toBe("hangoutsMeet");
  });

  it("produces the SAME requestId on replay (different invocation, same runId+nodeId)", async () => {
    driveApiCallWith("t");
    mockEventsInsert
      .mockResolvedValueOnce({ id: "e1" })
      .mockResolvedValueOnce({ id: "e2" });

    await createEvent(baseInput({ config: { ...VALID_TIMED, googleMeet: true } }));
    await createEvent(baseInput({ config: { ...VALID_TIMED, googleMeet: true } }));

    const r1 = mockEventsInsert.mock.calls[0]![0].body.conferenceData.createRequest.requestId;
    const r2 = mockEventsInsert.mock.calls[1]![0].body.conferenceData.createRequest.requestId;
    expect(r1).toBe(r2);
  });
});

describe("createEvent — Q11 schema enforcement (no hidden defaults)", () => {
  it("throws ZodError when sendNotifications is missing", async () => {
    await expect(
      createEvent(
        baseInput({
          config: {
            summary: "S",
            startDateTime: "2026-05-08T15:00:00Z",
            endDateTime: "2026-05-08T15:30:00Z",
            // missing sendNotifications + guestsCan* fields
          },
        }),
      ),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("preserves explicit false for guestsCanInviteOthers (Q11: false is a valid choice)", async () => {
    mockRefreshAndRetry.mockImplementation(async (input: { apiCall: (t: string) => Promise<unknown> }) => input.apiCall("t"));
    mockEventsInsert.mockResolvedValueOnce({ id: "e" });

    await createEvent(
      baseInput({
        config: {
          ...VALID_TIMED,
          attendees: "alice@x.com",
          guestsCanInviteOthers: false,
          guestsCanSeeOtherGuests: false,
        },
      }),
    );

    const body = mockEventsInsert.mock.calls[0]![0].body;
    expect(body.guestsCanInviteOthers).toBe(false);
    expect(body.guestsCanSeeOtherGuests).toBe(false);
  });
});

describe("createEvent — output shape", () => {
  it("returns eventId, htmlLink, start/end, attendees, meetLink, status", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      id: "evt-99",
      htmlLink: "https://calendar.google.com/event?eid=evt-99",
      summary: "Standup",
      start: { dateTime: "2026-05-08T15:00:00Z", timeZone: "America/New_York" },
      end: { dateTime: "2026-05-08T15:30:00Z", timeZone: "America/New_York" },
      attendees: [{ email: "alice@x.com", responseStatus: "needsAction" }],
      status: "confirmed",
      conferenceData: {
        entryPoints: [
          { entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" },
        ],
      },
    });

    const result = await createEvent(baseInput());

    expect(result).toEqual({
      output: {
        eventId: "evt-99",
        htmlLink: "https://calendar.google.com/event?eid=evt-99",
        summary: "Standup",
        start: { dateTime: "2026-05-08T15:00:00Z", timeZone: "America/New_York" },
        end: { dateTime: "2026-05-08T15:30:00Z", timeZone: "America/New_York" },
        attendees: [{ email: "alice@x.com", responseStatus: "needsAction" }],
        meetLink: "https://meet.google.com/abc-defg-hij",
        status: "confirmed",
      },
    });
  });

  it("returns meetLink: null when no video entryPoint is present", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      id: "e",
      summary: "S",
      conferenceData: { entryPoints: [{ entryPointType: "phone", uri: "tel:+1" }] },
    });

    const result = await createEvent(baseInput());
    expect((result.output as Record<string, unknown>).meetLink).toBeNull();
  });
});
