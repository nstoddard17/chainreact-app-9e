/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockItemsCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/itemsCreate", () => ({
  itemsCreate: (...args: unknown[]) => mockItemsCreate(...args),
}));

import { createItem } from "@/integrations/monday/actions/items/createItem";
import { CreateItemConfigSchema } from "@/integrations/monday/actions/items/createItem.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockItemsCreate.mockReset();
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
    providerAccountId: "alice@example.com",
    payload: {},
  };
}

describe("create_item schema", () => {
  it("preserves V1 camelCase field names", () => {
    const parsed = CreateItemConfigSchema.parse({
      boardId: "b",
      groupId: "g",
      itemName: "n",
    });
    expect(parsed).toEqual({ boardId: "b", groupId: "g", itemName: "n" });
  });

  it("requires boardId / groupId / itemName", () => {
    expect(() =>
      CreateItemConfigSchema.parse({ groupId: "g", itemName: "n" }),
    ).toThrow();
    expect(() =>
      CreateItemConfigSchema.parse({ boardId: "b", itemName: "n" }),
    ).toThrow();
    expect(() =>
      CreateItemConfigSchema.parse({ boardId: "b", groupId: "g" }),
    ).toThrow();
  });

  it("accepts columnValues as string OR object", () => {
    expect(() =>
      CreateItemConfigSchema.parse({
        boardId: "b",
        groupId: "g",
        itemName: "n",
        columnValues: '{"x":1}',
      }),
    ).not.toThrow();
    expect(() =>
      CreateItemConfigSchema.parse({
        boardId: "b",
        groupId: "g",
        itemName: "n",
        columnValues: { x: 1 },
      }),
    ).not.toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      CreateItemConfigSchema.parse({
        boardId: "b",
        groupId: "g",
        itemName: "n",
        bogus: 1,
      }),
    ).toThrow();
  });
});

describe("create_item handler", () => {
  it("forwards camelCase fields to itemsCreate variables", async () => {
    mockItemsCreate.mockResolvedValueOnce({
      id: "i-1",
      name: "n",
      board: { id: "b" },
      group: { id: "g" },
      created_at: "2026-05-24T00:00:00Z",
    });
    await createItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", groupId: "g", itemName: "n" },
      triggerEvent: trigger(),
    });
    const call = mockItemsCreate.mock.calls[0]![0];
    expect(call.boardId).toBe("b");
    expect(call.groupId).toBe("g");
    expect(call.itemName).toBe("n");
    expect(call.columnValuesJson).toBeUndefined();
  });

  it("serializes columnValues object to JSON string for the wrapper", async () => {
    mockItemsCreate.mockResolvedValueOnce({
      id: "i",
      name: "n",
      board: { id: "b" },
      group: { id: "g" },
      created_at: null,
    });
    await createItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        boardId: "b",
        groupId: "g",
        itemName: "n",
        columnValues: { status: { label: "Done" } },
      },
      triggerEvent: trigger(),
    });
    const call = mockItemsCreate.mock.calls[0]![0];
    expect(call.columnValuesJson).toBe('{"status":{"label":"Done"}}');
  });

  it("passes string columnValues through verbatim", async () => {
    mockItemsCreate.mockResolvedValueOnce({
      id: "i",
      name: "n",
      board: null,
      group: null,
      created_at: null,
    });
    await createItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        boardId: "b",
        groupId: "g",
        itemName: "n",
        columnValues: '{"raw":"json"}',
      },
      triggerEvent: trigger(),
    });
    expect(mockItemsCreate.mock.calls[0]![0].columnValuesJson).toBe(
      '{"raw":"json"}',
    );
  });

  it("uses refreshAndRetry with provider='monday' and triggerEvent accountId", async () => {
    mockItemsCreate.mockResolvedValueOnce({
      id: "i",
      name: "n",
      board: { id: "b" },
      group: { id: "g" },
      created_at: null,
    });
    await createItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", groupId: "g", itemName: "n" },
      triggerEvent: trigger(),
    });
    const call = mockRefreshAndRetry.mock.calls[0]![0];
    expect(call.provider).toBe("monday");
    expect(call.accountId).toBe("alice@example.com");
  });

  it("returns null accountId when trigger provider isn't monday", async () => {
    mockItemsCreate.mockResolvedValueOnce({
      id: "i",
      name: "n",
      board: { id: "b" },
      group: { id: "g" },
      created_at: null,
    });
    await createItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", groupId: "g", itemName: "n" },
      triggerEvent: { ...trigger(), provider: "manual" },
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].accountId).toBeNull();
  });

  it("output shape: itemId / itemName / boardId / groupId / createdAt", async () => {
    mockItemsCreate.mockResolvedValueOnce({
      id: "i-1",
      name: "Returned Name",
      board: { id: "b-1" },
      group: { id: "g-1" },
      created_at: "2026-05-24T00:00:00Z",
    });
    const result = await createItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", groupId: "g", itemName: "Original Name" },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      itemId: "i-1",
      itemName: "Returned Name",
      boardId: "b-1",
      groupId: "g-1",
      createdAt: "2026-05-24T00:00:00Z",
    });
  });

  it("falls back to config values when API response omits ids", async () => {
    mockItemsCreate.mockResolvedValueOnce({
      id: "i",
      name: null,
      board: null,
      group: null,
      created_at: null,
    });
    const result = await createItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", groupId: "g", itemName: "fallback" },
      triggerEvent: trigger(),
    });
    expect(result.output.itemName).toBe("fallback");
    expect(result.output.boardId).toBe("b");
    expect(result.output.groupId).toBe("g");
    expect(result.output.createdAt).toBeNull();
  });
});
