/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/notion/api/pages", () => ({
  pagesCreate: (...args: unknown[]) => mockCreate(...args),
  pagesRetrieve: jest.fn(),
  pagesUpdate: jest.fn(),
}));

import { createDatabaseEntry } from "@/integrations/notion/actions/createDatabaseEntry";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreate.mockReset();
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

describe("create_database_entry action", () => {
  it("posts to /v1/pages with database parent baked in", async () => {
    mockCreate.mockResolvedValueOnce({
      object: "page",
      id: "row-1",
      url: "https://www.notion.so/row-1",
      parent: { database_id: "db-1" },
    });
    await createDatabaseEntry({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        databaseId: "db-1",
        properties: {
          Name: { type: "title", value: "Row 1" },
          Score: { type: "number", value: 42 },
        },
      },
      triggerEvent: trigger(),
    });
    const callArg = mockCreate.mock.calls[0]![0]!;
    expect(callArg.parent).toEqual({ database_id: "db-1" });
    expect(callArg.properties).toEqual({
      Name: { title: [{ type: "text", text: { content: "Row 1" } }] },
      Score: { number: 42 },
    });
  });

  it("returns mirror-of-create_page output shape", async () => {
    mockCreate.mockResolvedValueOnce({
      object: "page",
      id: "row-2",
      url: "https://x",
      parent: { database_id: "db-2" },
      created_time: "2026-05-09T10:00:00Z",
      last_edited_time: "2026-05-09T11:00:00Z",
    });
    const result = await createDatabaseEntry({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        databaseId: "db-2",
        properties: { Name: { type: "title", value: "x" } },
      },
      triggerEvent: trigger(),
    });
    expect(result.output).toMatchObject({
      pageId: "row-2",
      url: "https://x",
      parent: { database_id: "db-2" },
      createdTime: "2026-05-09T10:00:00Z",
      lastEditedTime: "2026-05-09T11:00:00Z",
    });
  });

  it("supports optional children + icon + cover", async () => {
    mockCreate.mockResolvedValueOnce({ object: "page", id: "row-1" });
    await createDatabaseEntry({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        databaseId: "db-1",
        properties: { Name: { type: "title", value: "x" } },
        children: [{ type: "paragraph", text: "body" }],
        icon: { type: "emoji", emoji: "📁" },
      },
      triggerEvent: trigger(),
    });
    const callArg = mockCreate.mock.calls[0]![0]!;
    expect(callArg.children).toHaveLength(1);
    expect(callArg.icon).toEqual({ type: "emoji", emoji: "📁" });
  });

  it("rejects empty properties", async () => {
    await expect(
      createDatabaseEntry({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { databaseId: "db-1", properties: {} },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects empty databaseId", async () => {
    await expect(
      createDatabaseEntry({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          databaseId: "",
          properties: { Name: { type: "title", value: "x" } },
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown fields (strict mode)", async () => {
    await expect(
      createDatabaseEntry({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          databaseId: "db-1",
          properties: { Name: { type: "title", value: "x" } },
          extra: 1,
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
