/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockEventsCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook-calendar/api/eventsCreate", () => ({
  eventsCreate: (...args: unknown[]) => mockEventsCreate(...args),
}));

import { createEvent } from "@/integrations/microsoft-outlook-calendar/actions/createEvent";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockEventsCreate.mockReset();
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
    providerAccountId: "alice@contoso.com",
    payload: {},
  };
}

const VALID_CONFIG = {
  subject: "Standup",
  start: { dateTime: "2026-05-15T14:30:00", timeZone: "America/New_York" },
  end: { dateTime: "2026-05-15T15:30:00", timeZone: "America/New_York" },
  isAllDay: false,
  responseRequested: true,
};

describe("create_event action", () => {
  it("forwards Graph payload with required fields and resolved timezones", async () => {
    mockEventsCreate.mockResolvedValueOnce({
      id: "evt-graph-1",
      subject: "Standup",
      start: VALID_CONFIG.start,
      end: VALID_CONFIG.end,
      webLink: "https://outlook.office.com/...",
      organizer: { emailAddress: { name: "Alice", address: "alice@x.com" } },
      attendees: [],
    });

    const result = await createEvent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: VALID_CONFIG,
      triggerEvent: trigger(),
    });

    expect(mockEventsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "tok",
        body: expect.objectContaining({
          subject: "Standup",
          start: {
            dateTime: "2026-05-15T14:30:00",
            timeZone: "America/New_York",
          },
          end: {
            dateTime: "2026-05-15T15:30:00",
            timeZone: "America/New_York",
          },
          isAllDay: false,
          responseRequested: true,
        }),
      }),
    );
    expect(result.output).toEqual(
      expect.objectContaining({
        id: "evt-graph-1",
        subject: "Standup",
        webLink: "https://outlook.office.com/...",
        organizer: { name: "Alice", address: "alice@x.com" },
      }),
    );
  });

  it("falls back to UTC when timeZone is omitted (Q12 explicit-or-UTC)", async () => {
    mockEventsCreate.mockResolvedValueOnce({ id: "x" });

    await createEvent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        ...VALID_CONFIG,
        start: { dateTime: "2026-05-15T14:30:00" },
        end: { dateTime: "2026-05-15T15:30:00" },
      },
      triggerEvent: trigger(),
    });

    const body = mockEventsCreate.mock.calls[0]![0].body;
    expect(body.start.timeZone).toBe("UTC");
    expect(body.end.timeZone).toBe("UTC");
  });

  it("invalid timezone falls back to UTC silently (matches resolveTimezone helper)", async () => {
    mockEventsCreate.mockResolvedValueOnce({ id: "x" });

    await createEvent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        ...VALID_CONFIG,
        start: { dateTime: "2026-05-15T14:30:00", timeZone: "Not/A/Real/Tz" },
        end: { dateTime: "2026-05-15T15:30:00", timeZone: "Not/A/Real/Tz" },
      },
      triggerEvent: trigger(),
    });

    const body = mockEventsCreate.mock.calls[0]![0].body;
    expect(body.start.timeZone).toBe("UTC");
    expect(body.end.timeZone).toBe("UTC");
  });

  it("parses attendees CSV into Graph attendee shape with type=required", async () => {
    mockEventsCreate.mockResolvedValueOnce({ id: "x" });

    await createEvent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        ...VALID_CONFIG,
        attendees: "alice@x.com, bob@x.com,carol@x.com",
      },
      triggerEvent: trigger(),
    });

    const body = mockEventsCreate.mock.calls[0]![0].body;
    expect(body.attendees).toEqual([
      { emailAddress: { address: "alice@x.com" }, type: "required" },
      { emailAddress: { address: "bob@x.com" }, type: "required" },
      { emailAddress: { address: "carol@x.com" }, type: "required" },
    ]);
  });

  it("omits attendees from the Graph payload when none provided (cleaner request)", async () => {
    mockEventsCreate.mockResolvedValueOnce({ id: "x" });

    await createEvent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: VALID_CONFIG,
      triggerEvent: trigger(),
    });

    const body = mockEventsCreate.mock.calls[0]![0].body;
    expect(body.attendees).toBeUndefined();
  });

  it("forwards body + bodyContentType when provided", async () => {
    mockEventsCreate.mockResolvedValueOnce({ id: "x" });

    await createEvent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        ...VALID_CONFIG,
        body: "<p>Agenda</p>",
        bodyContentType: "HTML",
      },
      triggerEvent: trigger(),
    });

    const body = mockEventsCreate.mock.calls[0]![0].body;
    expect(body.body).toEqual({
      contentType: "HTML",
      content: "<p>Agenda</p>",
    });
  });

  it("forwards location, reminderMinutesBeforeStart, showAs, sensitivity, importance when provided", async () => {
    mockEventsCreate.mockResolvedValueOnce({ id: "x" });

    await createEvent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        ...VALID_CONFIG,
        location: "Conference Room A",
        reminderMinutesBeforeStart: 15,
        showAs: "busy",
        sensitivity: "private",
        importance: "high",
      },
      triggerEvent: trigger(),
    });

    const body = mockEventsCreate.mock.calls[0]![0].body;
    expect(body.location).toEqual({ displayName: "Conference Room A" });
    expect(body.reminderMinutesBeforeStart).toBe(15);
    expect(body.showAs).toBe("busy");
    expect(body.sensitivity).toBe("private");
    expect(body.importance).toBe("high");
  });

  it("threads accountId from same-provider trigger; passes null for cross-provider", async () => {
    mockEventsCreate.mockResolvedValue({ id: "x" });

    await createEvent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: VALID_CONFIG,
      triggerEvent: trigger("microsoft-outlook-calendar"),
    });
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u",
        provider: "microsoft-outlook-calendar",
        accountId: "alice@contoso.com",
      }),
    );

    mockRefreshAndRetry.mockClear();

    await createEvent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: VALID_CONFIG,
      triggerEvent: trigger("gmail"),
    });
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: null }),
    );
  });

  it("rejects missing isAllDay (Q11 — no hidden default)", async () => {
    const { isAllDay: _isAllDay, ...rest } = VALID_CONFIG;
    await expect(
      createEvent({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: rest,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockEventsCreate).not.toHaveBeenCalled();
  });

  it("rejects missing responseRequested (Q11 — no hidden default)", async () => {
    const { responseRequested: _r, ...rest } = VALID_CONFIG;
    await expect(
      createEvent({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: rest,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects body without bodyContentType (Q11 cross-field refine)", async () => {
    await expect(
      createEvent({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { ...VALID_CONFIG, body: "Hello!" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/bodyContentType/);
    expect(mockEventsCreate).not.toHaveBeenCalled();
  });

  it("rejects unknown fields (strict mode)", async () => {
    await expect(
      createEvent({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { ...VALID_CONFIG, unknownExtra: "leak" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("propagates non-401 errors from the wrapper verbatim", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Error("graph-boom"));

    await expect(
      createEvent({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: VALID_CONFIG,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/graph-boom/);
  });
});
