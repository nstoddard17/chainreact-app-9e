/**
 * @jest-environment node
 *
 * Tests for integrations/notion/actions/getBlockChildren (Notion 2.1 Commit 4).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import { GetBlockChildrenConfigSchema } from "@/integrations/notion/actions/getBlockChildren.schema";

const mockRefreshAndRetry = jest.fn();
const mockList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/notion/api/blocks", () => ({
  blocksAppendChildren: jest.fn(),
  blocksRetrieve: jest.fn(),
  blocksChildrenList: (...args: unknown[]) => mockList(...args),
}));

import { getBlockChildren } from "@/integrations/notion/actions/getBlockChildren";

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
    providerAccountId: "bot-123",
    payload: {},
  };
}

describe("get_block_children schema", () => {
  it("accepts blockId only", () => {
    expect(GetBlockChildrenConfigSchema.parse({ blockId: "p-1" })).toEqual({
      blockId: "p-1",
    });
  });

  it("accepts blockId + pageSize + startCursor", () => {
    expect(
      GetBlockChildrenConfigSchema.parse({
        blockId: "p-1",
        pageSize: 25,
        startCursor: "cur-1",
      }),
    ).toEqual({ blockId: "p-1", pageSize: 25, startCursor: "cur-1" });
  });

  it("rejects missing / empty blockId", () => {
    expect(() => GetBlockChildrenConfigSchema.parse({})).toThrow();
    expect(() =>
      GetBlockChildrenConfigSchema.parse({ blockId: "" }),
    ).toThrow();
  });

  it("rejects pageSize > 100, 0, negative, non-integer", () => {
    expect(() =>
      GetBlockChildrenConfigSchema.parse({ blockId: "p", pageSize: 101 }),
    ).toThrow();
    expect(() =>
      GetBlockChildrenConfigSchema.parse({ blockId: "p", pageSize: 0 }),
    ).toThrow();
    expect(() =>
      GetBlockChildrenConfigSchema.parse({ blockId: "p", pageSize: -5 }),
    ).toThrow();
    expect(() =>
      GetBlockChildrenConfigSchema.parse({ blockId: "p", pageSize: 10.5 }),
    ).toThrow();
  });

  it("rejects unknown fields (.strict — no selectedBlock dual mode, no filters)", () => {
    expect(() =>
      GetBlockChildrenConfigSchema.parse({
        blockId: "p",
        selectedBlock: "x",
      }),
    ).toThrow();
    expect(() =>
      GetBlockChildrenConfigSchema.parse({
        blockId: "p",
        filter: { type: "paragraph" },
      }),
    ).toThrow();
  });
});

describe("get_block_children handler", () => {
  it("calls blocksChildrenList once with blockId only", async () => {
    mockList.mockResolvedValueOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    await getBlockChildren({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
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

  it("forwards pageSize + startCursor when supplied", async () => {
    mockList.mockResolvedValueOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    await getBlockChildren({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { blockId: "p-1", pageSize: 25, startCursor: "cur-x" },
      triggerEvent: trigger(),
    });
    const callArg = mockList.mock.calls[0]![0]!;
    expect(callArg.pageSize).toBe(25);
    expect(callArg.startCursor).toBe("cur-x");
  });

  it("maps each child block via mapNotionBlock (shape consistent with get_block)", async () => {
    mockList.mockResolvedValueOnce({
      object: "list",
      results: [
        {
          object: "block",
          id: "b-1",
          type: "paragraph",
          has_children: false,
          paragraph: { rich_text: [{ plain_text: "First" }] },
        },
        {
          object: "block",
          id: "b-2",
          type: "divider",
          divider: {},
        },
      ],
      has_more: true,
      next_cursor: "cur-next",
    });
    const result = await getBlockChildren({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { blockId: "p-1" },
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.hasMore).toBe(true);
    expect(output.nextCursor).toBe("cur-next");
    const blocks = output.blocks as Array<Record<string, unknown>>;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.blockId).toBe("b-1");
    expect(blocks[0]!.type).toBe("paragraph");
    expect(blocks[0]!.plainText).toBe("First");
    expect(blocks[1]!.blockId).toBe("b-2");
    expect(blocks[1]!.type).toBe("divider");
    expect(blocks[1]!.plainText).toBe("");
  });

  it("maps nextCursor: null when the list is fully drained", async () => {
    mockList.mockResolvedValueOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    const result = await getBlockChildren({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { blockId: "p-1" },
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.hasMore).toBe(false);
    expect(output.nextCursor).toBeNull();
    expect(output.blocks).toEqual([]);
  });

  it("does NOT auto-paginate — exactly one blocksChildrenList call regardless of hasMore", async () => {
    mockList.mockResolvedValueOnce({
      object: "list",
      results: [{ object: "block", id: "b-1", type: "divider", divider: {} }],
      has_more: true,
      next_cursor: "cur-next",
    });
    await getBlockChildren({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { blockId: "p-1" },
      triggerEvent: trigger(),
    });
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it("propagates Notion API errors verbatim", async () => {
    mockList.mockRejectedValueOnce(new Error("notion_403"));
    await expect(
      getBlockChildren({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { blockId: "p-1" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow("notion_403");
  });
});
