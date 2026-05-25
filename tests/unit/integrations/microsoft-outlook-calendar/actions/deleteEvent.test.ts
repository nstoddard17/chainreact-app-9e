/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockEventsDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook-calendar/api/eventsDelete", () => ({
  eventsDelete: (...args: unknown[]) => mockEventsDelete(...args),
}));

import { deleteEvent } from "@/integrations/microsoft-outlook-calendar/actions/deleteEvent";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockEventsDelete.mockReset();
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

describe("delete_event action", () => {
  it("DELETEs the event and returns deleted: true on success", async () => {
    mockEventsDelete.mockResolvedValueOnce(undefined);

    const result = await deleteEvent({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { eventId: "evt-1" },
      triggerEvent: trigger(),
    });

    expect(mockEventsDelete).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "tok", eventId: "evt-1" }),
    );
    expect(result.output).toEqual({
      eventId: "evt-1",
      deleted: true,
      alreadyMissing: false,
    });
  });

  it("returns alreadyMissing: true on 404 (idempotent — Slice 4 deleteFile convention)", async () => {
    mockEventsDelete.mockRejectedValueOnce(new NotFoundError("event evt-gone"));

    const result = await deleteEvent({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { eventId: "evt-gone" },
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({
      eventId: "evt-gone",
      deleted: true,
      alreadyMissing: true,
    });
  });

  it("propagates non-NotFoundError errors verbatim", async () => {
    mockEventsDelete.mockRejectedValueOnce(
      new Error("Microsoft Graph me/events/{id} DELETE failed: HTTP 500"),
    );

    await expect(
      deleteEvent({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { eventId: "evt-1" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("rejects missing eventId", async () => {
    await expect(
      deleteEvent({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {},
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockEventsDelete).not.toHaveBeenCalled();
  });

  it("rejects unknown fields (strict mode)", async () => {
    await expect(
      deleteEvent({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { eventId: "evt-1", extra: "leak" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
