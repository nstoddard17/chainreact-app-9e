/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockEventsGet = jest.fn();
const mockEventsPatch = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-calendar/api/eventsGet", () => ({
  eventsGet: (...args: unknown[]) => mockEventsGet(...args),
}));

jest.mock("@/integrations/google-calendar/api/eventsPatch", () => ({
  eventsPatch: (...args: unknown[]) => mockEventsPatch(...args),
}));

import { addAttendees } from "@/integrations/google-calendar/actions/addAttendees";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockEventsGet.mockReset();
  mockEventsPatch.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
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
    runId: "run-add",
    nodeId: "node-add",
    config,
    triggerEvent: trigger(),
  };
}

describe("addAttendees", () => {
  it("merges new attendees with existing ones (case-insensitive dedup)", async () => {
    mockEventsGet.mockResolvedValueOnce({
      id: "evt-1",
      attendees: [
        { email: "Alice@Example.com" },
        { email: "carol@example.com" },
      ],
    });
    mockEventsPatch.mockResolvedValueOnce({
      id: "evt-1",
      attendees: [
        { email: "Alice@Example.com" },
        { email: "carol@example.com" },
        { email: "bob@example.com" },
      ],
    });

    const result = await addAttendees(
      input({
        eventId: "evt-1",
        attendees: "alice@example.com, bob@example.com",
        sendNotifications: "all",
      }),
    );

    // Patch should only add bob (alice already invited, case-insensitive).
    const patchedBody = mockEventsPatch.mock.calls[0]![0].body;
    expect(patchedBody.attendees).toEqual([
      { email: "Alice@Example.com" },
      { email: "carol@example.com" },
      { email: "bob@example.com" },
    ]);

    const out = result.output as Record<string, unknown>;
    expect(out.actuallyAdded).toBe(1);
    expect(out.addedAttendees).toEqual(["bob@example.com"]);
    expect(out.alreadyInvited).toEqual(["alice@example.com"]);
  });

  it("short-circuits when all proposed attendees are already invited", async () => {
    mockEventsGet.mockResolvedValueOnce({
      id: "evt-1",
      attendees: [{ email: "alice@example.com" }, { email: "bob@example.com" }],
    });

    const result = await addAttendees(
      input({
        eventId: "evt-1",
        attendees: "alice@example.com, bob@example.com",
        sendNotifications: "all",
      }),
    );

    expect(mockEventsPatch).not.toHaveBeenCalled();
    const out = result.output as Record<string, unknown>;
    expect(out.actuallyAdded).toBe(0);
    expect(out.addedAttendees).toEqual([]);
    expect(out.alreadyInvited).toEqual([
      "alice@example.com",
      "bob@example.com",
    ]);
    expect(out.totalAttendees).toBe(2);
  });

  it("handles event with no existing attendees", async () => {
    mockEventsGet.mockResolvedValueOnce({ id: "evt-1" }); // no attendees field
    mockEventsPatch.mockResolvedValueOnce({
      id: "evt-1",
      attendees: [{ email: "alice@example.com" }],
    });

    const result = await addAttendees(
      input({
        eventId: "evt-1",
        attendees: ["alice@example.com"],
        sendNotifications: "all",
      }),
    );

    const out = result.output as Record<string, unknown>;
    expect(out.actuallyAdded).toBe(1);
    expect(mockEventsPatch.mock.calls[0]![0].body.attendees).toEqual([
      { email: "alice@example.com" },
    ]);
  });

  it("returns empty result without calling get/patch when attendees is empty CSV", async () => {
    const result = await addAttendees(
      input({
        eventId: "evt-1",
        attendees: " , , ",
        sendNotifications: "all",
      }),
    );

    expect(mockEventsGet).not.toHaveBeenCalled();
    expect(mockEventsPatch).not.toHaveBeenCalled();
    const out = result.output as Record<string, unknown>;
    expect(out.actuallyAdded).toBe(0);
  });

  it("throws ZodError when sendNotifications is missing (Q11)", async () => {
    mockRefreshAndRetry.mockReset(); // we want to assert no call
    await expect(
      addAttendees(
        input({
          eventId: "evt-1",
          attendees: "alice@x.com",
        }),
      ),
    ).rejects.toThrow();
    expect(mockEventsGet).not.toHaveBeenCalled();
  });
});
