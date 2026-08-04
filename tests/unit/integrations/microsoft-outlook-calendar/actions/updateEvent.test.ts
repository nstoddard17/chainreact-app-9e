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
import { UpdateEventConfigSchema } from "@/integrations/microsoft-outlook-calendar/actions/updateEvent.schema";

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
    providerAccountId: "alice@contoso.com",
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
      accountId: "acct-u",
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
      accountId: "acct-u",
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
      accountId: "acct-u",
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
      accountId: "acct-u",
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
      accountId: "acct-u",
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
        accountId: "acct-u",
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
        accountId: "acct-u",
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
        accountId: "acct-u",
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
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { eventId: "evt-1", subject: "x" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/graph-boom/);
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling updateEvent.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Slice 4.OUTLOOK-CAL-META-2 — Approach-A flat-time-fields shim tests
// for `UpdateEventConfigSchema`. Mirrors the create_event tests but
// accounts for `start` / `end` being OPTIONAL on update (Graph rejects
// one-sided time edits, but the schema doesn't pre-empt that).
// ---------------------------------------------------------------------------

describe("UpdateEventConfigSchema — Approach A flat-time-fields shim", () => {
  it("parses the canonical NESTED shape unchanged (regression guard)", () => {
    const parsed = UpdateEventConfigSchema.parse({
      eventId: "evt-1",
      subject: "Renamed",
      start: { dateTime: "2026-06-01T09:00:00", timeZone: "America/New_York" },
      end: { dateTime: "2026-06-01T10:00:00", timeZone: "America/New_York" },
    });
    expect(parsed).toMatchObject({
      eventId: "evt-1",
      subject: "Renamed",
      start: { dateTime: "2026-06-01T09:00:00", timeZone: "America/New_York" },
      end: { dateTime: "2026-06-01T10:00:00", timeZone: "America/New_York" },
    });
    expect(parsed).not.toHaveProperty("startDateTime");
  });

  it("normalizes the builder FLAT shape into the nested shape", () => {
    const parsed = UpdateEventConfigSchema.parse({
      eventId: "evt-1",
      subject: "Renamed",
      startDateTime: "2026-06-01T09:00:00",
      startTimeZone: "America/New_York",
      endDateTime: "2026-06-01T10:00:00",
      endTimeZone: "America/New_York",
    });
    expect(parsed.start).toEqual({
      dateTime: "2026-06-01T09:00:00",
      timeZone: "America/New_York",
    });
    expect(parsed.end).toEqual({
      dateTime: "2026-06-01T10:00:00",
      timeZone: "America/New_York",
    });
    expect(parsed).not.toHaveProperty("startDateTime");
  });

  it("normalizes one-sided flat input (start only) — Graph rejects later but schema accepts", () => {
    const parsed = UpdateEventConfigSchema.parse({
      eventId: "evt-1",
      startDateTime: "2026-06-01T09:00:00",
      startTimeZone: "America/New_York",
    });
    expect(parsed.start).toEqual({
      dateTime: "2026-06-01T09:00:00",
      timeZone: "America/New_York",
    });
    expect(parsed.end).toBeUndefined();
  });

  it("treats empty / whitespace-only flat strings as absent (preserves the ≥1-mutable-field refine)", () => {
    expect(() =>
      UpdateEventConfigSchema.parse({
        eventId: "evt-1",
        startDateTime: "   ",
        endDateTime: "",
      }),
    ).toThrow(); // start/end become undefined → no mutable field → ≥1 refine fails
  });

  it("rejects an update with no mutable fields besides eventId (existing refine)", () => {
    expect(() => UpdateEventConfigSchema.parse({ eventId: "evt-1" })).toThrow();
  });

  it("prefers nested on mixed-shape input (flat ignored when nested present)", () => {
    const parsed = UpdateEventConfigSchema.parse({
      eventId: "evt-1",
      start: { dateTime: "2026-06-01T09:00:00" },
      end: { dateTime: "2026-06-01T10:00:00" },
      // Conflicting flat — nested wins.
      startDateTime: "2099-01-01T00:00:00",
      endDateTime: "2099-01-01T01:00:00",
    });
    expect(parsed.start?.dateTime).toBe("2026-06-01T09:00:00");
    expect(parsed.end?.dateTime).toBe("2026-06-01T10:00:00");
  });

  it("preserves strict mode — unknown extra fields still rejected", () => {
    expect(() =>
      UpdateEventConfigSchema.parse({
        eventId: "evt-1",
        subject: "Renamed",
        unknownField: "leak",
      }),
    ).toThrow();
  });

  it("preserves the Q11 bodyContentType-when-body refine", () => {
    expect(() =>
      UpdateEventConfigSchema.parse({
        eventId: "evt-1",
        body: "New body",
        // bodyContentType deliberately omitted
      }),
    ).toThrow();
    expect(() =>
      UpdateEventConfigSchema.parse({
        eventId: "evt-1",
        body: "New body",
        bodyContentType: "HTML",
      }),
    ).not.toThrow();
  });
});
