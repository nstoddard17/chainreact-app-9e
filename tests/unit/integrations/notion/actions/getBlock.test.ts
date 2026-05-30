/**
 * @jest-environment node
 *
 * Tests for integrations/notion/actions/getBlock (Notion 2.1 Commit 4).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import { GetBlockConfigSchema } from "@/integrations/notion/actions/getBlock.schema";

const mockRefreshAndRetry = jest.fn();
const mockRetrieve = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/notion/api/blocks", () => ({
  blocksAppendChildren: jest.fn(),
  blocksRetrieve: (...args: unknown[]) => mockRetrieve(...args),
  blocksChildrenList: jest.fn(),
}));

import { getBlock } from "@/integrations/notion/actions/getBlock";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRetrieve.mockReset();
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

describe("get_block schema (GetBlockConfigSchema)", () => {
  it("accepts a valid blockId", () => {
    expect(GetBlockConfigSchema.parse({ blockId: "b-1" })).toEqual({
      blockId: "b-1",
    });
  });

  it("rejects missing / empty blockId", () => {
    expect(() => GetBlockConfigSchema.parse({})).toThrow();
    expect(() => GetBlockConfigSchema.parse({ blockId: "" })).toThrow();
  });

  it("rejects unknown fields (.strict — no selectedBlock dual-mode)", () => {
    expect(() =>
      GetBlockConfigSchema.parse({
        blockId: "b-1",
        selectedBlock: "b-x",
      }),
    ).toThrow();
  });
});

describe("get_block handler — rich-text-bearing blocks", () => {
  it("forwards blockId to the wrapper", async () => {
    mockRetrieve.mockResolvedValueOnce({
      object: "block",
      id: "b-1",
      type: "paragraph",
      paragraph: { rich_text: [{ plain_text: "hi" }] },
    });
    await getBlock({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { blockId: "b-1" },
      triggerEvent: trigger(),
    });
    expect(mockRetrieve.mock.calls[0]![0]!).toEqual({
      accessToken: "tok",
      blockId: "b-1",
    });
  });

  it("maps a paragraph block with plainText extraction + content payload", async () => {
    mockRetrieve.mockResolvedValueOnce({
      object: "block",
      id: "b-1",
      type: "paragraph",
      archived: false,
      has_children: false,
      parent: { type: "page_id", page_id: "p-1" },
      created_time: "2026-05-14T10:00:00Z",
      last_edited_time: "2026-05-14T10:00:00Z",
      paragraph: {
        rich_text: [
          { plain_text: "Hello, " },
          { plain_text: "world!" },
        ],
      },
    });
    const result = await getBlock({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { blockId: "b-1" },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      blockId: "b-1",
      object: "block",
      type: "paragraph",
      archived: false,
      hasChildren: false,
      parentType: "page_id",
      parentId: "p-1",
      createdTime: "2026-05-14T10:00:00Z",
      lastEditedTime: "2026-05-14T10:00:00Z",
      plainText: "Hello, world!",
      content: {
        rich_text: [
          { plain_text: "Hello, " },
          { plain_text: "world!" },
        ],
      },
    });
  });

  it("maps a heading block and extracts plainText", async () => {
    mockRetrieve.mockResolvedValueOnce({
      object: "block",
      id: "b-h",
      type: "heading_2",
      heading_2: { rich_text: [{ plain_text: "Section" }] },
    });
    const result = await getBlock({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { blockId: "b-h" },
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.type).toBe("heading_2");
    expect(output.plainText).toBe("Section");
  });
});

describe("get_block handler — non-text blocks", () => {
  it("returns empty plainText for divider blocks (no rich_text)", async () => {
    mockRetrieve.mockResolvedValueOnce({
      object: "block",
      id: "b-d",
      type: "divider",
      divider: {},
    });
    const result = await getBlock({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { blockId: "b-d" },
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.type).toBe("divider");
    expect(output.plainText).toBe("");
    expect(output.content).toEqual({});
  });

  it("returns empty plainText + raw content for image blocks (URL accessible via content)", async () => {
    mockRetrieve.mockResolvedValueOnce({
      object: "block",
      id: "b-i",
      type: "image",
      image: {
        type: "external",
        external: { url: "https://x/img.png" },
      },
    });
    const result = await getBlock({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { blockId: "b-i" },
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.plainText).toBe("");
    const content = output.content as Record<string, unknown>;
    expect(content.type).toBe("external");
  });
});

describe("get_block handler — output discipline + parent + error propagation", () => {
  it("resolves parentId from block_id when parent is a block", async () => {
    mockRetrieve.mockResolvedValueOnce({
      object: "block",
      id: "b-1",
      type: "paragraph",
      parent: { type: "block_id", block_id: "parent-b" },
      paragraph: { rich_text: [] },
    });
    const result = await getBlock({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { blockId: "b-1" },
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.parentType).toBe("block_id");
    expect(output.parentId).toBe("parent-b");
  });

  it("resolves parentId from database_id when parent is a database", async () => {
    mockRetrieve.mockResolvedValueOnce({
      object: "block",
      id: "b-1",
      type: "child_page",
      parent: { type: "database_id", database_id: "db-x" },
      child_page: { title: "Row" },
    });
    const result = await getBlock({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { blockId: "b-1" },
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.parentType).toBe("database_id");
    expect(output.parentId).toBe("db-x");
  });

  it("propagates Notion API errors verbatim", async () => {
    mockRetrieve.mockRejectedValueOnce(new Error("notion_404"));
    await expect(
      getBlock({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { blockId: "b-missing" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow("notion_404");
  });

  it("does NOT echo the entire raw block object (V1 leak guard)", async () => {
    mockRetrieve.mockResolvedValueOnce({
      object: "block",
      id: "b-1",
      type: "paragraph",
      paragraph: { rich_text: [] },
      // Simulated unknown fields Notion might add in the future:
      undocumented_future_field: { secret: "hi" },
    });
    const result = await getBlock({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { blockId: "b-1" },
      triggerEvent: trigger(),
    });
    const outKeys = Object.keys(result.output ?? {}).sort();
    expect(outKeys).toEqual(
      [
        "blockId",
        "object",
        "type",
        "archived",
        "hasChildren",
        "parentType",
        "parentId",
        "createdTime",
        "lastEditedTime",
        "plainText",
        "content",
      ].sort(),
    );
    // The undocumented future field is NOT in the output.
    expect(outKeys).not.toContain("undocumented_future_field");
    // And the `content` field is bounded to the type-specific payload,
    // not the entire block object.
    const content = result.output!.content as Record<string, unknown>;
    expect("secret" in content).toBe(false);
  });
});
