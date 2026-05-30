/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockEventsPatch = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-calendar/api/eventsPatch", () => ({
  eventsPatch: (...args: unknown[]) => mockEventsPatch(...args),
}));

import { updateEvent } from "@/integrations/google-calendar/actions/updateEvent";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockEventsPatch.mockReset();
});

function trigger(): TriggerEvent {
  return {
    provider: "google-calendar",
    eventType: "manual",
    eventId: "x",
    occurredAt: "2026-05-08T12:00:00Z",
    providerAccountId: "alice@example.com",
    payload: {},
  };
}

function input(config: Record<string, unknown>) {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run-update",
    nodeId: "node-update",
    config,
    triggerEvent: trigger(),
  };
}

function driveApiCallWith(token: string) {
  mockRefreshAndRetry.mockImplementation(async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall(token));
}

describe("updateEvent — partial patch (only sends provided fields)", () => {
  it("sends only summary when only summary is supplied", async () => {
    driveApiCallWith("tok");
    mockEventsPatch.mockResolvedValueOnce({ id: "evt-1", summary: "New" });

    await updateEvent(
      input({
        eventId: "evt-1",
        summary: "New",
        sendNotifications: "none",
      }),
    );

    const args = mockEventsPatch.mock.calls[0]![0];
    expect(args.body).toEqual({ summary: "New" });
    expect(args.body.start).toBeUndefined();
    expect(args.body.end).toBeUndefined();
    expect(args.sendUpdates).toBe("none");
  });

  it("sends start + end + timezone when both times are provided", async () => {
    driveApiCallWith("tok");
    mockEventsPatch.mockResolvedValueOnce({ id: "evt-1" });

    await updateEvent(
      input({
        eventId: "evt-1",
        startDateTime: "2026-06-01T10:00:00Z",
        endDateTime: "2026-06-01T11:00:00Z",
        timezone: "Europe/Berlin",
        sendNotifications: "all",
      }),
    );

    const args = mockEventsPatch.mock.calls[0]![0];
    expect(args.body.start).toEqual({
      dateTime: "2026-06-01T10:00:00Z",
      timeZone: "Europe/Berlin",
    });
    expect(args.body.end).toEqual({
      dateTime: "2026-06-01T11:00:00Z",
      timeZone: "Europe/Berlin",
    });
  });
});

describe("updateEvent — V1 bug: NO synthetic '09:00' fallback (Q11/Q12 fix)", () => {
  it("rejects supplying ONLY startDateTime without endDateTime (no synthesis)", async () => {
    await expect(
      updateEvent(
        input({
          eventId: "evt-1",
          startDateTime: "2026-06-01T10:00:00Z",
          // endDateTime missing
          sendNotifications: "all",
        }),
      ),
    ).rejects.toThrow(/BOTH startDateTime and endDateTime/);
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
    expect(mockEventsPatch).not.toHaveBeenCalled();
  });

  it("rejects supplying ONLY endDateTime without startDateTime", async () => {
    await expect(
      updateEvent(
        input({
          eventId: "evt-1",
          endDateTime: "2026-06-01T11:00:00Z",
          sendNotifications: "all",
        }),
      ),
    ).rejects.toThrow(/BOTH startDateTime and endDateTime/);
  });
});

describe("updateEvent — googleMeet boolean (V1 mixed object/boolean shape fixed)", () => {
  it("sends conferenceData.createRequest with stable requestId when googleMeet=true", async () => {
    driveApiCallWith("tok");
    mockEventsPatch.mockResolvedValueOnce({ id: "evt-1" });

    await updateEvent(
      input({
        eventId: "evt-1",
        googleMeet: true,
        sendNotifications: "all",
      }),
    );

    const args = mockEventsPatch.mock.calls[0]![0];
    expect(args.conferenceDataVersion).toBe(1);
    expect(args.body.conferenceData.createRequest.requestId).toBe(
      "meet-run-update:node-update",
    );
  });

  it("googleMeet=false is a no-op for now (no conferenceData in patch)", async () => {
    driveApiCallWith("tok");
    mockEventsPatch.mockResolvedValueOnce({ id: "evt-1" });

    await updateEvent(
      input({
        eventId: "evt-1",
        googleMeet: false,
        sendNotifications: "all",
      }),
    );

    const args = mockEventsPatch.mock.calls[0]![0];
    expect(args.conferenceDataVersion).toBeUndefined();
    expect(args.body.conferenceData).toBeUndefined();
  });
});

describe("updateEvent — output", () => {
  it("returns updated event fields", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      id: "evt-1",
      htmlLink: "https://...",
      summary: "Updated",
      start: { dateTime: "2026-06-01T10:00:00Z" },
      end: { dateTime: "2026-06-01T11:00:00Z" },
      attendees: [],
      status: "confirmed",
      updated: "2026-06-01T09:00:00Z",
    });

    const result = await updateEvent(
      input({
        eventId: "evt-1",
        summary: "Updated",
        sendNotifications: "all",
      }),
    );

    expect((result.output as Record<string, unknown>).eventId).toBe("evt-1");
    expect((result.output as Record<string, unknown>).updated).toBe(
      "2026-06-01T09:00:00Z",
    );
  });
});
