/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockQuery = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/notion/api/databases", () => ({
  databasesQuery: (...args: unknown[]) => mockQuery(...args),
}));

import { queryDatabase } from "@/integrations/notion/actions/queryDatabase";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockQuery.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "notion",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    accountId: "bot-123",
    payload: {},
  };
}

describe("query_database action", () => {
  it("parses each row's properties + reports skipped types", async () => {
    mockQuery.mockResolvedValueOnce({
      object: "list",
      has_more: false,
      next_cursor: null,
      results: [
        {
          object: "page",
          id: "row-1",
          url: "https://www.notion.so/row-1",
          archived: false,
          created_time: "2026-05-09T10:00:00Z",
          last_edited_time: "2026-05-09T11:00:00Z",
          properties: {
            Name: { type: "title", title: [{ plain_text: "Row 1" }] },
            Done: { type: "checkbox", checkbox: true },
            Owner: { type: "people", people: [{ id: "u-1" }] },
          },
        },
      ],
    });
    const result = await queryDatabase({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { databaseId: "db-1" },
      triggerEvent: trigger(),
    });
    expect(result.output.results).toHaveLength(1);
    const row = (result.output.results as Array<Record<string, unknown>>)[0]!;
    expect(row.id).toBe("row-1");
    expect(row.properties).toEqual({
      Name: { type: "title", value: "Row 1" },
      Done: { type: "checkbox", value: true },
    });
    expect(row.skippedProperties).toEqual([{ name: "Owner", type: "people" }]);
    expect(result.output.hasMore).toBe(false);
    expect(result.output.nextCursor).toBeNull();
  });

  it("forward-passes filter / sorts / page_size / start_cursor", async () => {
    mockQuery.mockResolvedValueOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    await queryDatabase({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        databaseId: "db-1",
        filter: { property: "Status", status: { equals: "Done" } },
        sorts: [{ property: "Name", direction: "ascending" }],
        pageSize: 50,
        startCursor: "cur-x",
      },
      triggerEvent: trigger(),
    });
    expect(mockQuery).toHaveBeenCalledWith({
      accessToken: "tok",
      databaseId: "db-1",
      filter: { property: "Status", status: { equals: "Done" } },
      sorts: [{ property: "Name", direction: "ascending" }],
      pageSize: 50,
      startCursor: "cur-x",
    });
  });

  it("rejects pageSize > 100", async () => {
    await expect(
      queryDatabase({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { databaseId: "db-1", pageSize: 200 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects empty databaseId", async () => {
    await expect(
      queryDatabase({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { databaseId: "" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
