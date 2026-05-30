/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockAppend = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/notion/api/blocks", () => ({
  blocksAppendChildren: (...args: unknown[]) => mockAppend(...args),
}));

import { appendBlockChildren } from "@/integrations/notion/actions/appendBlockChildren";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockAppend.mockReset();
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

describe("append_block_children action", () => {
  it("coerces typed BlockSpec[] into Notion wire-format children", async () => {
    mockAppend.mockResolvedValueOnce({
      object: "list",
      results: [
        { object: "block", id: "b-1", type: "heading_1" },
        { object: "block", id: "b-2", type: "paragraph" },
        { object: "block", id: "b-3", type: "divider" },
      ],
    });
    await appendBlockChildren({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        blockId: "page-1",
        children: [
          { type: "heading_1", text: "Title" },
          { type: "paragraph", text: "Body" },
          { type: "divider" },
        ],
      },
      triggerEvent: trigger(),
    });
    const callArg = mockAppend.mock.calls[0]![0]!;
    expect(callArg.blockId).toBe("page-1");
    expect(callArg.children).toHaveLength(3);
    expect(callArg.children[0].type).toBe("heading_1");
    expect(callArg.children[0].heading_1.rich_text[0].text.content).toBe("Title");
    expect(callArg.children[2].divider).toEqual({});
  });

  it("returns childIds + count from Notion's response", async () => {
    mockAppend.mockResolvedValueOnce({
      object: "list",
      results: [
        { object: "block", id: "b-1" },
        { object: "block", id: "b-2" },
      ],
    });
    const result = await appendBlockChildren({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        blockId: "p",
        children: [
          { type: "paragraph", text: "x" },
          { type: "paragraph", text: "y" },
        ],
      },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({ childIds: ["b-1", "b-2"], count: 2 });
  });

  it("supports to_do with checked: true / checked: false / omitted", async () => {
    mockAppend.mockResolvedValueOnce({
      object: "list",
      results: [
        { object: "block", id: "b-1" },
        { object: "block", id: "b-2" },
        { object: "block", id: "b-3" },
      ],
    });
    await appendBlockChildren({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        blockId: "p",
        children: [
          { type: "to_do", text: "a", checked: true },
          { type: "to_do", text: "b", checked: false },
          { type: "to_do", text: "c" },
        ],
      },
      triggerEvent: trigger(),
    });
    const wireChildren = mockAppend.mock.calls[0]![0]!.children;
    expect(wireChildren[0].to_do.checked).toBe(true);
    expect(wireChildren[1].to_do.checked).toBe(false);
    expect(wireChildren[2].to_do.checked).toBe(false);
  });

  it("rejects empty children array", async () => {
    await expect(
      appendBlockChildren({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { blockId: "p", children: [] },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/at least one block/);
  });

  it("rejects > 100 children (Notion's hard cap)", async () => {
    const big = Array.from({ length: 101 }, () => ({
      type: "paragraph" as const,
      text: "x",
    }));
    await expect(
      appendBlockChildren({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { blockId: "p", children: big },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/100/);
  });

  it("rejects unsupported block types at the schema layer", async () => {
    await expect(
      appendBlockChildren({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          blockId: "p",
          children: [{ type: "image", external: { url: "x" } }],
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown fields (strict mode)", async () => {
    await expect(
      appendBlockChildren({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          blockId: "p",
          children: [{ type: "paragraph", text: "x" }],
          unknown: 1,
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
