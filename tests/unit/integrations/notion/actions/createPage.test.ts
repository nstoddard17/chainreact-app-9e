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

import { createPage } from "@/integrations/notion/actions/createPage";

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
    providerAccountId: "bot-123",
    payload: {},
  };
}

describe("create_page action — database parent", () => {
  it("creates a page under a database with typed properties", async () => {
    mockCreate.mockResolvedValueOnce({
      object: "page",
      id: "p-1",
      url: "https://www.notion.so/p-1",
      parent: { database_id: "db-1" },
      created_time: "2026-05-09T10:00:00Z",
      last_edited_time: "2026-05-09T10:00:00Z",
    });
    const result = await createPage({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        parent: { databaseId: "db-1" },
        properties: {
          Name: { type: "title", value: "Q2 plan" },
          Score: { type: "number", value: 99 },
          Done: { type: "checkbox", value: false },
        },
      },
      triggerEvent: trigger(),
    });
    const callArg = mockCreate.mock.calls[0]![0]!;
    expect(callArg.parent).toEqual({ database_id: "db-1" });
    expect(callArg.properties).toEqual({
      Name: { title: [{ type: "text", text: { content: "Q2 plan" } }] },
      Score: { number: 99 },
      Done: { checkbox: false },
    });
    expect(result.output.pageId).toBe("p-1");
    expect(result.output.url).toBe("https://www.notion.so/p-1");
  });
});

describe("create_page action — page parent", () => {
  it("creates a subpage under an existing page", async () => {
    mockCreate.mockResolvedValueOnce({
      object: "page",
      id: "p-2",
      parent: { page_id: "parent-1" },
    });
    await createPage({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        parent: { pageId: "parent-1" },
        properties: {
          title: { type: "title", value: "Sub" },
        },
      },
      triggerEvent: trigger(),
    });
    expect(mockCreate.mock.calls[0]![0]!.parent).toEqual({
      page_id: "parent-1",
    });
  });
});

describe("create_page action — children + icon + cover", () => {
  it("coerces typed BlockSpec[] children into wire-format", async () => {
    mockCreate.mockResolvedValueOnce({
      object: "page",
      id: "p-1",
    });
    await createPage({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        parent: { databaseId: "db-1" },
        properties: { Name: { type: "title", value: "x" } },
        children: [
          { type: "heading_1", text: "Title" },
          { type: "divider" },
        ],
        icon: { type: "emoji", emoji: "📄" },
        cover: { type: "external", external: { url: "https://x.test/c.png" } },
      },
      triggerEvent: trigger(),
    });
    const callArg = mockCreate.mock.calls[0]![0]!;
    expect(callArg.children).toHaveLength(2);
    expect(callArg.children[0].type).toBe("heading_1");
    expect(callArg.children[1].type).toBe("divider");
    expect(callArg.icon).toEqual({ type: "emoji", emoji: "📄" });
    expect(callArg.cover).toEqual({
      type: "external",
      external: { url: "https://x.test/c.png" },
    });
  });
});

describe("create_page action — schema validation", () => {
  it("rejects parent without databaseId or pageId", async () => {
    await expect(
      createPage({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          parent: {},
          properties: { Name: { type: "title", value: "x" } },
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects deferred property types at the schema layer", async () => {
    await expect(
      createPage({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          parent: { databaseId: "db-1" },
          properties: {
            // multi_select is deferred; the discriminated union rejects it.
            Tags: { type: "multi_select", value: ["a"] },
          },
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown fields (strict mode)", async () => {
    await expect(
      createPage({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          parent: { databaseId: "db" },
          properties: { x: { type: "title", value: "y" } },
          oldField: 1,
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects > 100 children", async () => {
    const big = Array.from({ length: 101 }, () => ({
      type: "paragraph" as const,
      text: "x",
    }));
    await expect(
      createPage({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          parent: { databaseId: "db" },
          properties: { x: { type: "title", value: "y" } },
          children: big,
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});

// V2-READY-15: meta/handler output contract. The builder variable picker
// advertises `notionCreatePageMeta.outputs` as the references downstream nodes
// may use; if the meta named an output the handler never emits, the picker would
// offer a `{{create_page.<x>}}` that fails at runtime with MISSING_VARIABLE (the
// native `delay` drift class). Pin the advertised names to the handler's actual
// emitted keys so this can't drift.
describe("create_page — meta/handler output contract", () => {
  it("advertised meta output names match the handler's emitted output keys", async () => {
    const { notionCreatePageMeta } = await import(
      "@/integrations/notion/actions/createPage.meta"
    );
    mockCreate.mockResolvedValueOnce({
      object: "page",
      id: "p-1",
      url: "https://www.notion.so/p-1",
      parent: { database_id: "db-1" },
      created_time: "2026-05-09T10:00:00Z",
      last_edited_time: "2026-05-09T10:00:00Z",
    });
    const result = await createPage({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        parent: { databaseId: "db-1" },
        properties: { Name: { type: "title", value: "x" } },
      },
      triggerEvent: trigger(),
    });
    const handlerKeys = Object.keys(result.output).sort();
    const metaKeys = notionCreatePageMeta.outputs.map((o) => o.name).sort();
    expect(metaKeys).toEqual(handlerKeys);
  });
});
