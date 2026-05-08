/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockEventsGet = jest.fn();
const mockEventsDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-calendar/api/eventsGet", () => ({
  eventsGet: (...args: unknown[]) => mockEventsGet(...args),
}));

jest.mock("@/integrations/google-calendar/api/eventsDelete", () => ({
  eventsDelete: (...args: unknown[]) => mockEventsDelete(...args),
}));

// NotFoundError is real (we want instanceof checks to work)
import { NotFoundError } from "@/integrations/google-calendar/api/errors";
import { deleteEvent } from "@/integrations/google-calendar/actions/deleteEvent";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockEventsGet.mockReset();
  mockEventsDelete.mockReset();
});

function trigger(): TriggerEvent {
  return {
    provider: "google-calendar",
    eventType: "manual",
    eventId: "x",
    occurredAt: "2026-05-08T12:00:00Z",
    accountId: "alice@example.com",
    payload: {},
  };
}

function input(config: Record<string, unknown>) {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    runId: "run-del",
    nodeId: "node-del",
    config,
    triggerEvent: trigger(),
  };
}

/**
 * Drive refreshAndRetry: it accepts an apiCall and runs it. We delegate
 * to the underlying mock function so each call exercises the real
 * eventsGet / eventsDelete mocks (with the configured outcomes).
 */
function passthroughRefreshAndRetry() {
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
}

describe("deleteEvent — happy path (event exists)", () => {
  it("fetches the event, then deletes it, and returns snapshot details", async () => {
    passthroughRefreshAndRetry();
    mockEventsGet.mockResolvedValueOnce({
      id: "evt-1",
      summary: "Standup",
      start: { dateTime: "2026-05-08T15:00:00Z" },
      end: { dateTime: "2026-05-08T15:30:00Z" },
    });
    mockEventsDelete.mockResolvedValueOnce(undefined);

    const result = await deleteEvent(
      input({
        eventId: "evt-1",
        sendNotifications: "all",
      }),
    );

    expect(mockEventsGet).toHaveBeenCalledTimes(1);
    expect(mockEventsDelete).toHaveBeenCalledTimes(1);
    expect(mockEventsDelete.mock.calls[0]![0].sendUpdates).toBe("all");

    const out = result.output as Record<string, unknown>;
    expect(out.eventId).toBe("evt-1");
    expect(out.deleted).toBe(true);
    expect(out.alreadyDeleted).toBe(false);
    expect(out.eventTitle).toBe("Standup");
    expect(out.eventStart).toEqual({ dateTime: "2026-05-08T15:00:00Z" });
  });
});

describe("deleteEvent — alreadyDeleted (idempotent on 404)", () => {
  it("sets alreadyDeleted=true when get returns 404 and skips the delete call", async () => {
    passthroughRefreshAndRetry();
    mockEventsGet.mockRejectedValueOnce(new NotFoundError("event evt-1"));

    const result = await deleteEvent(
      input({ eventId: "evt-1", sendNotifications: "none" }),
    );

    expect(mockEventsDelete).not.toHaveBeenCalled();
    const out = result.output as Record<string, unknown>;
    expect(out.deleted).toBe(true);
    expect(out.alreadyDeleted).toBe(true);
    expect(out.eventTitle).toBeNull();
  });

  it("sets alreadyDeleted=true when delete returns 404 (race)", async () => {
    passthroughRefreshAndRetry();
    mockEventsGet.mockResolvedValueOnce({
      id: "evt-1",
      summary: "Going Going",
    });
    mockEventsDelete.mockRejectedValueOnce(new NotFoundError("event evt-1"));

    const result = await deleteEvent(
      input({ eventId: "evt-1", sendNotifications: "none" }),
    );

    const out = result.output as Record<string, unknown>;
    expect(out.deleted).toBe(true);
    expect(out.alreadyDeleted).toBe(true);
    expect(out.eventTitle).toBe("Going Going");
  });
});

describe("deleteEvent — error propagation", () => {
  it("throws when get fails with non-404 error", async () => {
    passthroughRefreshAndRetry();
    mockEventsGet.mockRejectedValueOnce(new Error("Google Calendar events.get failed: PERMISSION_DENIED"));

    await expect(
      deleteEvent(input({ eventId: "evt-1", sendNotifications: "all" })),
    ).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it("throws ZodError when sendNotifications is missing (Q11)", async () => {
    await expect(
      deleteEvent(input({ eventId: "evt-1" })),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});
