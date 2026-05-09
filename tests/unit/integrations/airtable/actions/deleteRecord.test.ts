/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/airtable/api/records", () => ({
  recordsCreate: jest.fn(),
  recordsGet: jest.fn(),
  recordsList: jest.fn(),
  recordsUpdate: jest.fn(),
  recordsDelete: (...args: unknown[]) => mockDelete(...args),
}));

import { deleteRecord } from "@/integrations/airtable/actions/deleteRecord";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDelete.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "airtable",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    accountId: "usrXXX",
    payload: {},
  };
}

describe("delete_record action", () => {
  it("returns { id, deleted: true } on success", async () => {
    mockDelete.mockResolvedValueOnce({ id: "rec1", deleted: true });
    const result = await deleteRecord({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "Tasks",
        recordId: "rec1",
      },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({ id: "rec1", deleted: true });
    expect(mockDelete.mock.calls[0]![0]!.recordId).toBe("rec1");
  });

  it("propagates NotFoundError on 404 (NOT idempotent — distinct from find_record)", async () => {
    class NotFoundError extends Error {
      constructor(public resource: string) {
        super(`not found: ${resource}`);
      }
    }
    mockDelete.mockRejectedValueOnce(new NotFoundError("record rec1"));
    await expect(
      deleteRecord({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "Tasks",
          recordId: "rec1",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/not found: record rec1/);
  });
});
