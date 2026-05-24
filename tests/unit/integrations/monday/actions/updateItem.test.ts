/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockItemsUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/itemsUpdate", () => ({
  itemsUpdate: (...args: unknown[]) => mockItemsUpdate(...args),
}));

import { updateItem } from "@/integrations/monday/actions/items/updateItem";
import { UpdateItemConfigSchema } from "@/integrations/monday/actions/items/updateItem.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockItemsUpdate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "monday",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-24T00:00:00Z",
    accountId: "alice@example.com",
    payload: {},
  };
}

describe("update_item schema", () => {
  it("preserves V1 camelCase field names", () => {
    expect(() =>
      UpdateItemConfigSchema.parse({
        boardId: "b",
        itemId: "i",
        columnId: "c",
        columnValue: "val",
      }),
    ).not.toThrow();
  });

  it("accepts columnValue as string / number / object / array", () => {
    for (const value of ["x", 1, { label: "Done" }, ["a"]]) {
      expect(() =>
        UpdateItemConfigSchema.parse({
          boardId: "b",
          itemId: "i",
          columnId: "c",
          columnValue: value,
        }),
      ).not.toThrow();
    }
  });

  it("requires boardId / itemId / columnId / columnValue", () => {
    expect(() =>
      UpdateItemConfigSchema.parse({ itemId: "i", columnId: "c", columnValue: "v" }),
    ).toThrow();
    expect(() =>
      UpdateItemConfigSchema.parse({ boardId: "b", columnId: "c", columnValue: "v" }),
    ).toThrow();
  });
});

describe("update_item handler", () => {
  it("builds single-column map when no additionalColumns", async () => {
    mockItemsUpdate.mockResolvedValueOnce({ id: "i", name: "n" });
    await updateItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", itemId: "i", columnId: "status", columnValue: "Done" },
      triggerEvent: trigger(),
    });
    const call = mockItemsUpdate.mock.calls[0]![0];
    expect(call.boardId).toBe("b");
    expect(call.itemId).toBe("i");
    expect(JSON.parse(call.columnValuesJson)).toEqual({ status: "Done" });
  });

  it("merges additionalColumns object with single column (single wins on conflict)", async () => {
    mockItemsUpdate.mockResolvedValueOnce({ id: "i", name: "n" });
    await updateItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        boardId: "b",
        itemId: "i",
        columnId: "status",
        columnValue: "Done",
        additionalColumns: { priority: "High", status: "Pending" },
      },
      triggerEvent: trigger(),
    });
    const merged = JSON.parse(mockItemsUpdate.mock.calls[0]![0].columnValuesJson);
    expect(merged.priority).toBe("High");
    // The single (columnId, columnValue) pair wins on conflict.
    expect(merged.status).toBe("Done");
  });

  it("parses additionalColumns JSON string", async () => {
    mockItemsUpdate.mockResolvedValueOnce({ id: "i", name: "n" });
    await updateItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        boardId: "b",
        itemId: "i",
        columnId: "status",
        columnValue: "Done",
        additionalColumns: '{"priority":"High"}',
      },
      triggerEvent: trigger(),
    });
    const merged = JSON.parse(mockItemsUpdate.mock.calls[0]![0].columnValuesJson);
    expect(merged.priority).toBe("High");
    expect(merged.status).toBe("Done");
  });

  it("throws on invalid JSON additionalColumns", async () => {
    await expect(
      updateItem({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          boardId: "b",
          itemId: "i",
          columnId: "status",
          columnValue: "Done",
          additionalColumns: "not json",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/additionalColumns must be valid JSON/);
  });

  it("output: itemId / itemName / updatedColumns / updatedAt", async () => {
    mockItemsUpdate.mockResolvedValueOnce({ id: "i-1", name: "Returned" });
    const result = await updateItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        boardId: "b",
        itemId: "i",
        columnId: "status",
        columnValue: "Done",
        additionalColumns: { priority: "High" },
      },
      triggerEvent: trigger(),
    });
    expect(result.output.itemId).toBe("i-1");
    expect(result.output.itemName).toBe("Returned");
    expect((result.output.updatedColumns as string[]).sort()).toEqual([
      "priority",
      "status",
    ]);
    expect(typeof result.output.updatedAt).toBe("string");
  });

  it("uses refreshAndRetry with provider='monday'", async () => {
    mockItemsUpdate.mockResolvedValueOnce({ id: "i", name: "n" });
    await updateItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", itemId: "i", columnId: "c", columnValue: "v" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
  });
});
