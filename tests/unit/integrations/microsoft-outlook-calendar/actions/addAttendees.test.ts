/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockEventsGet = jest.fn();
const mockEventsUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook-calendar/api/eventsGet", () => ({
  eventsGet: (...args: unknown[]) => mockEventsGet(...args),
}));

jest.mock("@/integrations/microsoft-outlook-calendar/api/eventsUpdate", () => ({
  eventsUpdate: (...args: unknown[]) => mockEventsUpdate(...args),
}));

import { addAttendees } from "@/integrations/microsoft-outlook-calendar/actions/addAttendees";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockEventsGet.mockReset();
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

describe("add_attendees action", () => {
  it("does GET → merge → PATCH (preserves existing attendees, dedupes by email)", async () => {
    mockEventsGet.mockResolvedValueOnce({
      id: "evt-1",
      attendees: [
        { emailAddress: { address: "alice@x.com" }, type: "required" },
        { emailAddress: { address: "bob@x.com" }, type: "optional" },
      ],
    });
    mockEventsUpdate.mockResolvedValueOnce({
      id: "evt-1",
      attendees: [
        { emailAddress: { address: "alice@x.com" }, type: "required" },
        { emailAddress: { address: "bob@x.com" }, type: "optional" },
        { emailAddress: { address: "carol@x.com" }, type: "required" },
      ],
    });

    const result = await addAttendees({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        eventId: "evt-1",
        attendees: "carol@x.com",
        attendeeType: "required",
      },
      triggerEvent: trigger(),
    });

    expect(mockEventsGet).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "tok", eventId: "evt-1" }),
    );
    // Merge preserves existing attendee TYPE (Bob stays optional even
    // though the action's attendeeType is "required").
    expect(mockEventsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt-1",
        body: {
          attendees: [
            { emailAddress: { address: "alice@x.com" }, type: "required" },
            { emailAddress: { address: "bob@x.com" }, type: "optional" },
            { emailAddress: { address: "carol@x.com" }, type: "required" },
          ],
        },
      }),
    );
    expect(result.output).toEqual({
      id: "evt-1",
      attendeesAdded: ["carol@x.com"],
      attendeesTotal: 3,
      attendeesAlreadyPresent: [],
    });
  });

  it("dedupes case-insensitively against existing attendees (no duplicate PATCH)", async () => {
    mockEventsGet.mockResolvedValueOnce({
      id: "evt-1",
      attendees: [
        { emailAddress: { address: "Alice@X.com" }, type: "required" },
      ],
    });

    const result = await addAttendees({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        eventId: "evt-1",
        attendees: "alice@x.com",
        attendeeType: "required",
      },
      triggerEvent: trigger(),
    });

    // alice@x.com is case-insensitively equal to Alice@X.com — no PATCH.
    expect(mockEventsUpdate).not.toHaveBeenCalled();
    expect(result.output).toEqual({
      id: "evt-1",
      attendeesAdded: [],
      attendeesTotal: 1,
      attendeesAlreadyPresent: ["alice@x.com"],
    });
  });

  it("uses the configured attendeeType for NEW attendees (Q11)", async () => {
    mockEventsGet.mockResolvedValueOnce({ id: "evt-1", attendees: [] });
    mockEventsUpdate.mockResolvedValueOnce({ id: "evt-1" });

    await addAttendees({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        eventId: "evt-1",
        attendees: "alice@x.com,bob@x.com",
        attendeeType: "optional",
      },
      triggerEvent: trigger(),
    });

    const body = mockEventsUpdate.mock.calls[0]![0].body;
    expect(body.attendees).toEqual([
      { emailAddress: { address: "alice@x.com" }, type: "optional" },
      { emailAddress: { address: "bob@x.com" }, type: "optional" },
    ]);
  });

  it("rejects when attendees parses to an empty list (whitespace-only CSV)", async () => {
    await expect(
      addAttendees({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          eventId: "evt-1",
          attendees: "   ,   ",
          attendeeType: "required",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/at least one address/);
    expect(mockEventsGet).not.toHaveBeenCalled();
  });

  it("rejects missing attendeeType (Q11 — no hidden default)", async () => {
    await expect(
      addAttendees({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { eventId: "evt-1", attendees: "alice@x.com" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects empty attendees array", async () => {
    await expect(
      addAttendees({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          eventId: "evt-1",
          attendees: [],
          attendeeType: "required",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("propagates errors from getEvent verbatim (e.g. NotFoundError surfaces)", async () => {
    mockEventsGet.mockRejectedValueOnce(new Error("event evt-gone not found"));

    await expect(
      addAttendees({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          eventId: "evt-gone",
          attendees: "alice@x.com",
          attendeeType: "required",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/not found/);
    expect(mockEventsUpdate).not.toHaveBeenCalled();
  });
});
