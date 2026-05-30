/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockColumnsCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/columnsCreate", () => ({
  columnsCreate: (...args: unknown[]) => mockColumnsCreate(...args),
}));

import { addColumn } from "@/integrations/monday/actions/boards/addColumn";
import { AddColumnConfigSchema } from "@/integrations/monday/actions/boards/addColumn.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockColumnsCreate.mockReset();
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

describe("add_column schema", () => {
  it("requires boardId + columnTitle + columnType", () => {
    expect(() =>
      AddColumnConfigSchema.parse({
        boardId: "b",
        columnTitle: "T",
        columnType: "status",
      }),
    ).not.toThrow();
    expect(() =>
      AddColumnConfigSchema.parse({ boardId: "b", columnTitle: "T" }),
    ).toThrow();
  });

  it("accepts columnType as any non-empty string (not a restrictive enum)", () => {
    for (const t of ["text", "status", "dropdown", "some_new_type"]) {
      expect(() =>
        AddColumnConfigSchema.parse({
          boardId: "b",
          columnTitle: "T",
          columnType: t,
        }),
      ).not.toThrow();
    }
  });

  it("accepts defaults as string OR object", () => {
    expect(() =>
      AddColumnConfigSchema.parse({
        boardId: "b",
        columnTitle: "T",
        columnType: "status",
        defaults: '{"labels":{}}',
      }),
    ).not.toThrow();
    expect(() =>
      AddColumnConfigSchema.parse({
        boardId: "b",
        columnTitle: "T",
        columnType: "status",
        defaults: { labels: {} },
      }),
    ).not.toThrow();
  });
});

describe("add_column handler", () => {
  it("serializes object defaults to JSON string for the wrapper", async () => {
    mockColumnsCreate.mockResolvedValueOnce({
      id: "c-1",
      title: "T",
      type: "status",
    });
    await addColumn({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        boardId: "b",
        columnTitle: "T",
        columnType: "status",
        defaults: { labels: { "1": "Done" } },
      },
      triggerEvent: trigger(),
    });
    expect(mockColumnsCreate.mock.calls[0]![0].defaultsJson).toBe(
      '{"labels":{"1":"Done"}}',
    );
  });

  it("passes string defaults verbatim", async () => {
    mockColumnsCreate.mockResolvedValueOnce({ id: "c", title: "T", type: "text" });
    await addColumn({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        boardId: "b",
        columnTitle: "T",
        columnType: "text",
        defaults: '{"raw":true}',
      },
      triggerEvent: trigger(),
    });
    expect(mockColumnsCreate.mock.calls[0]![0].defaultsJson).toBe('{"raw":true}');
  });

  it("omits defaultsJson when no defaults given", async () => {
    mockColumnsCreate.mockResolvedValueOnce({ id: "c", title: "T", type: "text" });
    await addColumn({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", columnTitle: "T", columnType: "text" },
      triggerEvent: trigger(),
    });
    expect(mockColumnsCreate.mock.calls[0]![0].defaultsJson).toBeUndefined();
  });

  it("output: columnId / columnTitle / columnType / boardId / createdAt", async () => {
    mockColumnsCreate.mockResolvedValueOnce({
      id: "c-1",
      title: "Returned",
      type: "status",
    });
    const result = await addColumn({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", columnTitle: "T", columnType: "status" },
      triggerEvent: trigger(),
    });
    expect(result.output.columnId).toBe("c-1");
    expect(result.output.columnTitle).toBe("Returned");
    expect(result.output.columnType).toBe("status");
    expect(result.output.boardId).toBe("b");
  });

  it("uses refreshAndRetry provider='monday'", async () => {
    mockColumnsCreate.mockResolvedValueOnce({ id: "c", title: "T", type: "text" });
    await addColumn({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", columnTitle: "T", columnType: "text" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
  });
});
