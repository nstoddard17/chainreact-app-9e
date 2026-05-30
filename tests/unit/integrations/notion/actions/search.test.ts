/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockSearch = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/notion/api/search", () => ({
  search: (...args: unknown[]) => mockSearch(...args),
}));

import { search } from "@/integrations/notion/actions/search";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSearch.mockReset();
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
    providerAccountId: "bot-123",
    payload: {},
  };
}

describe("search action", () => {
  it("returns the Notion list response under typed output keys", async () => {
    mockSearch.mockResolvedValueOnce({
      object: "list",
      results: [
        { object: "page", id: "p-1", url: "https://x" },
        { object: "database", id: "db-1" },
      ],
      has_more: true,
      next_cursor: "next-1",
    });
    const result = await search({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { query: "Q2" },
      triggerEvent: trigger(),
    });
    expect(result.output.results).toHaveLength(2);
    expect(result.output.hasMore).toBe(true);
    expect(result.output.nextCursor).toBe("next-1");
  });

  it("forwards filter / pageSize / startCursor to the API wrapper", async () => {
    mockSearch.mockResolvedValueOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    await search({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        query: "",
        filter: { value: "page", property: "object" },
        pageSize: 10,
        startCursor: "cur-x",
      },
      triggerEvent: trigger(),
    });
    expect(mockSearch).toHaveBeenCalledWith({
      accessToken: "tok",
      query: "",
      filter: { value: "page", property: "object" },
      pageSize: 10,
      startCursor: "cur-x",
    });
  });

  it("rejects invalid filter values (only page/database allowed)", async () => {
    await expect(
      search({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          query: "x",
          filter: { value: "block", property: "object" },
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects pageSize > 100", async () => {
    await expect(
      search({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { query: "x", pageSize: 101 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown fields (strict mode)", async () => {
    await expect(
      search({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { query: "x", oldField: 1 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
