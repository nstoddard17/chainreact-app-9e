/**
 * @jest-environment node
 *
 * Tests for integrations/notion/actions/listComments (Notion 2.1 Commit 3).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import { ListCommentsConfigSchema } from "@/integrations/notion/actions/listComments.schema";

const mockRefreshAndRetry = jest.fn();
const mockList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/notion/api/comments", () => ({
  commentsCreate: jest.fn(),
  commentsList: (...args: unknown[]) => mockList(...args),
}));

import { listComments } from "@/integrations/notion/actions/listComments";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "notion",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-14T12:00:00Z",
    accountId: "bot-123",
    payload: {},
  };
}

describe("list_comments schema (ListCommentsConfigSchema)", () => {
  it("accepts blockId only", () => {
    expect(ListCommentsConfigSchema.parse({ blockId: "p-1" })).toEqual({
      blockId: "p-1",
    });
  });

  it("accepts blockId + pageSize + startCursor", () => {
    expect(
      ListCommentsConfigSchema.parse({
        blockId: "p-1",
        pageSize: 25,
        startCursor: "cur-1",
      }),
    ).toEqual({ blockId: "p-1", pageSize: 25, startCursor: "cur-1" });
  });

  it("rejects when blockId is missing", () => {
    expect(() => ListCommentsConfigSchema.parse({})).toThrow();
  });

  it("rejects an empty blockId", () => {
    expect(() => ListCommentsConfigSchema.parse({ blockId: "" })).toThrow();
  });

  it("rejects pageSize > 100 (Notion's hard ceiling)", () => {
    expect(() =>
      ListCommentsConfigSchema.parse({ blockId: "p-1", pageSize: 101 }),
    ).toThrow();
  });

  it("rejects pageSize = 0 / negative / non-integer", () => {
    expect(() =>
      ListCommentsConfigSchema.parse({ blockId: "p-1", pageSize: 0 }),
    ).toThrow();
    expect(() =>
      ListCommentsConfigSchema.parse({ blockId: "p-1", pageSize: -5 }),
    ).toThrow();
    expect(() =>
      ListCommentsConfigSchema.parse({ blockId: "p-1", pageSize: 10.5 }),
    ).toThrow();
  });

  it("rejects unknown fields (.strict — no filter / operation passthrough)", () => {
    expect(() =>
      ListCommentsConfigSchema.parse({
        blockId: "p-1",
        operation: "list",
      }),
    ).toThrow();
    expect(() =>
      ListCommentsConfigSchema.parse({
        blockId: "p-1",
        pageId: "p-1",
      }),
    ).toThrow();
  });
});

describe("list_comments handler", () => {
  it("calls commentsList once with the resolved blockId", async () => {
    mockList.mockResolvedValueOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    await listComments({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { blockId: "p-1" },
      triggerEvent: trigger(),
    });
    expect(mockList).toHaveBeenCalledTimes(1);
    const callArg = mockList.mock.calls[0]![0]!;
    expect(callArg.accessToken).toBe("tok");
    expect(callArg.blockId).toBe("p-1");
    expect(callArg.pageSize).toBeUndefined();
    expect(callArg.startCursor).toBeUndefined();
  });

  it("forwards pageSize + startCursor to the wrapper", async () => {
    mockList.mockResolvedValueOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    await listComments({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { blockId: "p-1", pageSize: 10, startCursor: "cur-x" },
      triggerEvent: trigger(),
    });
    const callArg = mockList.mock.calls[0]![0]!;
    expect(callArg.pageSize).toBe(10);
    expect(callArg.startCursor).toBe("cur-x");
  });

  it("maps comments array (each via mapNotionComment), nextCursor, hasMore", async () => {
    mockList.mockResolvedValueOnce({
      object: "list",
      results: [
        {
          object: "comment",
          id: "c-1",
          parent: { type: "page_id", page_id: "p-1" },
          discussion_id: "d-1",
          rich_text: [{ type: "text", plain_text: "First" }],
          created_time: "2026-05-14T10:00:00Z",
          last_edited_time: "2026-05-14T10:00:00Z",
          created_by: { object: "user", id: "u-a" },
        },
        {
          object: "comment",
          id: "c-2",
          parent: { type: "page_id", page_id: "p-1" },
          discussion_id: "d-1",
          rich_text: [{ type: "text", plain_text: "Second" }],
          created_time: "2026-05-14T10:01:00Z",
          last_edited_time: "2026-05-14T10:01:00Z",
          created_by: { object: "user", id: "u-b" },
        },
      ],
      has_more: true,
      next_cursor: "cur-next",
    });
    const result = await listComments({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { blockId: "p-1" },
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.hasMore).toBe(true);
    expect(output.nextCursor).toBe("cur-next");
    const comments = output.comments as Array<Record<string, unknown>>;
    expect(comments).toHaveLength(2);
    expect(comments[0]!.commentId).toBe("c-1");
    expect(comments[0]!.plainText).toBe("First");
    expect(comments[0]!.parentType).toBe("page_id");
    expect(comments[0]!.parentId).toBe("p-1");
    expect(comments[0]!.createdByUserId).toBe("u-a");
    expect(comments[1]!.commentId).toBe("c-2");
    expect(comments[1]!.plainText).toBe("Second");
  });

  it("maps nextCursor: null when the list is fully drained", async () => {
    mockList.mockResolvedValueOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    const result = await listComments({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { blockId: "p-1" },
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.hasMore).toBe(false);
    expect(output.nextCursor).toBeNull();
    expect(output.comments).toEqual([]);
  });

  it("does NOT auto-paginate — exactly one commentsList call regardless of hasMore", async () => {
    mockList.mockResolvedValueOnce({
      object: "list",
      results: [{ object: "comment", id: "c-1" }],
      has_more: true,
      next_cursor: "cur-next",
    });
    await listComments({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { blockId: "p-1" },
      triggerEvent: trigger(),
    });
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it("propagates Notion API errors verbatim", async () => {
    mockList.mockRejectedValueOnce(new Error("notion_404"));
    await expect(
      listComments({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { blockId: "p-missing" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow("notion_404");
  });
});
