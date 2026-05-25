/**
 * @jest-environment node
 *
 * Tests for integrations/notion/actions/createComment (Notion 2.1 Commit 3).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import { CreateCommentConfigSchema } from "@/integrations/notion/actions/createComment.schema";

const mockRefreshAndRetry = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/notion/api/comments", () => ({
  commentsCreate: (...args: unknown[]) => mockCreate(...args),
  commentsList: jest.fn(),
}));

import { createComment } from "@/integrations/notion/actions/createComment";

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
    occurredAt: "2026-05-14T12:00:00Z",
    accountId: "bot-123",
    payload: {},
  };
}

describe("create_comment schema (CreateCommentConfigSchema)", () => {
  it("accepts pageId + text (new discussion target)", () => {
    expect(
      CreateCommentConfigSchema.parse({ pageId: "p-1", text: "hi" }),
    ).toEqual({ pageId: "p-1", text: "hi" });
  });

  it("accepts discussionId + text (reply target)", () => {
    expect(
      CreateCommentConfigSchema.parse({ discussionId: "d-1", text: "hi" }),
    ).toEqual({ discussionId: "d-1", text: "hi" });
  });

  it("rejects when both pageId and discussionId are set (ambiguous)", () => {
    expect(() =>
      CreateCommentConfigSchema.parse({
        pageId: "p-1",
        discussionId: "d-1",
        text: "hi",
      }),
    ).toThrow(/exactly one of pageId or discussionId/);
  });

  it("rejects when neither pageId nor discussionId is set", () => {
    expect(() =>
      CreateCommentConfigSchema.parse({ text: "hi" }),
    ).toThrow(/exactly one of pageId or discussionId/);
  });

  it("rejects when text is missing", () => {
    expect(() =>
      CreateCommentConfigSchema.parse({ pageId: "p-1" }),
    ).toThrow();
  });

  it("rejects an empty text string", () => {
    expect(() =>
      CreateCommentConfigSchema.parse({ pageId: "p-1", text: "" }),
    ).toThrow();
  });

  it("rejects an empty pageId", () => {
    expect(() =>
      CreateCommentConfigSchema.parse({ pageId: "", text: "hi" }),
    ).toThrow();
  });

  it("rejects unknown fields (.strict — no rich_text passthrough, no parent_type / block_id)", () => {
    expect(() =>
      CreateCommentConfigSchema.parse({
        pageId: "p-1",
        text: "hi",
        rich_text: [{ type: "text" }],
      }),
    ).toThrow();
    expect(() =>
      CreateCommentConfigSchema.parse({
        pageId: "p-1",
        text: "hi",
        blockId: "b-1",
      }),
    ).toThrow();
    expect(() =>
      CreateCommentConfigSchema.parse({
        pageId: "p-1",
        text: "hi",
        parent_type: "page",
      }),
    ).toThrow();
  });
});

describe("create_comment handler — page parent target", () => {
  it("forwards target.pageId + text to the wrapper", async () => {
    mockCreate.mockResolvedValueOnce({
      object: "comment",
      id: "c-1",
      parent: { type: "page_id", page_id: "p-1" },
      discussion_id: "d-new",
      created_time: "2026-05-14T10:00:00Z",
      last_edited_time: "2026-05-14T10:00:00Z",
      created_by: { object: "user", id: "u-1" },
      rich_text: [{ type: "text", plain_text: "Hello", text: { content: "Hello" } }],
    });
    await createComment({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1", text: "Hello" },
      triggerEvent: trigger(),
    });
    const callArg = mockCreate.mock.calls[0]![0]!;
    expect(callArg).toEqual({
      accessToken: "tok",
      target: { pageId: "p-1" },
      text: "Hello",
    });
  });

  it("maps the response to the locked output shape", async () => {
    mockCreate.mockResolvedValueOnce({
      object: "comment",
      id: "c-1",
      parent: { type: "page_id", page_id: "p-1" },
      discussion_id: "d-new",
      created_time: "2026-05-14T10:00:00Z",
      last_edited_time: "2026-05-14T10:00:00Z",
      created_by: { object: "user", id: "u-1" },
      rich_text: [{ type: "text", plain_text: "Hello", text: { content: "Hello" } }],
    });
    const result = await createComment({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1", text: "Hello" },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      commentId: "c-1",
      object: "comment",
      parentType: "page_id",
      parentId: "p-1",
      parentBlockId: null,
      discussionId: "d-new",
      plainText: "Hello",
      createdTime: "2026-05-14T10:00:00Z",
      lastEditedTime: "2026-05-14T10:00:00Z",
      createdByUserId: "u-1",
    });
  });
});

describe("create_comment handler — discussion target", () => {
  it("forwards target.discussionId + text to the wrapper", async () => {
    mockCreate.mockResolvedValueOnce({
      object: "comment",
      id: "c-2",
      parent: { type: "block_id", block_id: "b-x" },
      discussion_id: "d-existing",
    });
    await createComment({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { discussionId: "d-existing", text: "Reply" },
      triggerEvent: trigger(),
    });
    const callArg = mockCreate.mock.calls[0]![0]!;
    expect(callArg).toEqual({
      accessToken: "tok",
      target: { discussionId: "d-existing" },
      text: "Reply",
    });
  });

  it("maps block_id parent type correctly in output", async () => {
    mockCreate.mockResolvedValueOnce({
      object: "comment",
      id: "c-2",
      parent: { type: "block_id", block_id: "b-x" },
      discussion_id: "d-existing",
    });
    const result = await createComment({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { discussionId: "d-existing", text: "Reply" },
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.parentType).toBe("block_id");
    expect(output.parentId).toBeNull();
    expect(output.parentBlockId).toBe("b-x");
    expect(output.discussionId).toBe("d-existing");
  });
});

describe("create_comment handler — output discipline + error propagation", () => {
  it("nulls optional fields when Notion omits them", async () => {
    mockCreate.mockResolvedValueOnce({
      object: "comment",
      id: "c-3",
      parent: { type: "page_id", page_id: "p-1" },
      discussion_id: "d-1",
      // no rich_text, created_time, last_edited_time, created_by
    });
    const result = await createComment({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1", text: "hi" },
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.plainText).toBe("");
    expect(output.createdTime).toBeNull();
    expect(output.lastEditedTime).toBeNull();
    expect(output.createdByUserId).toBeNull();
  });

  it("concatenates plain_text across multi-segment rich_text arrays", async () => {
    mockCreate.mockResolvedValueOnce({
      object: "comment",
      id: "c-4",
      parent: { type: "page_id", page_id: "p-1" },
      discussion_id: "d-1",
      rich_text: [
        { type: "text", plain_text: "Hello, " },
        { type: "text", plain_text: "world!" },
      ],
    });
    const result = await createComment({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1", text: "Hello, world!" },
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.plainText).toBe("Hello, world!");
  });

  it("propagates Notion API errors verbatim", async () => {
    mockCreate.mockRejectedValueOnce(new Error("notion_404"));
    await expect(
      createComment({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { pageId: "p-missing", text: "hi" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow("notion_404");
  });

  it("does NOT spread input config into output (output key set is locked)", async () => {
    mockCreate.mockResolvedValueOnce({
      object: "comment",
      id: "c-1",
      parent: { type: "page_id", page_id: "p-1" },
      discussion_id: "d-1",
    });
    const result = await createComment({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1", text: "hi" },
      triggerEvent: trigger(),
    });
    const outKeys = Object.keys(result.output ?? {}).sort();
    expect(outKeys).toEqual(
      [
        "commentId",
        "object",
        "parentType",
        "parentId",
        "parentBlockId",
        "discussionId",
        "plainText",
        "createdTime",
        "lastEditedTime",
        "createdByUserId",
      ].sort(),
    );
  });
});
