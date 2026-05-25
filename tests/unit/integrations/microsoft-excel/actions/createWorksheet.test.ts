/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockAdd = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-excel/api/worksheetsAdd", () => ({
  worksheetsAdd: (...args: unknown[]) => mockAdd(...args),
}));

import { createWorksheet } from "@/integrations/microsoft-excel/actions/createWorksheet";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockAdd.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-excel",
    eventType: "new_row",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    accountId: "alice@contoso.com",
    payload: {},
  };
}

describe("create_worksheet action", () => {
  it("creates a worksheet and surfaces the assigned position", async () => {
    mockAdd.mockResolvedValueOnce({ id: "ws-new", name: "Q2", position: 2 });

    const result = await createWorksheet({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { workbookId: "wb-1", name: "Q2" },
      triggerEvent: trigger(),
    });

    const call = mockAdd.mock.calls[0]![0];
    expect(call.workbookId).toBe("wb-1");
    expect(call.name).toBe("Q2");
    expect(result.output).toEqual({
      worksheetId: "ws-new",
      name: "Q2",
      position: 2,
    });
  });

  it("rejects names longer than 31 chars (Excel limit)", async () => {
    await expect(
      createWorksheet({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { workbookId: "wb-1", name: "x".repeat(32) },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects empty name", async () => {
    await expect(
      createWorksheet({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { workbookId: "wb-1", name: "" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
