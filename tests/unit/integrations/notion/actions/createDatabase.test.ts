/**
 * @jest-environment node
 *
 * Tests for integrations/notion/actions/createDatabase (Notion 2.1 Commit 4).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import { CreateDatabaseConfigSchema } from "@/integrations/notion/actions/createDatabase.schema";

const mockRefreshAndRetry = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/notion/api/databases", () => ({
  databasesQuery: jest.fn(),
  databasesCreate: (...args: unknown[]) => mockCreate(...args),
}));

import { createDatabase } from "@/integrations/notion/actions/createDatabase";

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

describe("create_database schema (CreateDatabaseConfigSchema)", () => {
  it("accepts a minimal valid config (parent + title + one title property)", () => {
    const parsed = CreateDatabaseConfigSchema.parse({
      parentPageId: "p-1",
      title: "My DB",
      properties: { Name: { type: "title" } },
    });
    expect(parsed.parentPageId).toBe("p-1");
    expect(parsed.title).toBe("My DB");
    expect(parsed.properties).toEqual({ Name: { type: "title" } });
  });

  it("accepts multiple properties including optional fields", () => {
    expect(() =>
      CreateDatabaseConfigSchema.parse({
        parentPageId: "p-1",
        title: "DB",
        description: "Some description",
        isInline: true,
        properties: {
          Name: { type: "title" },
          Notes: { type: "rich_text" },
          Done: { type: "checkbox" },
          Score: { type: "number" },
        },
      }),
    ).not.toThrow();
  });

  it("rejects when parentPageId is missing", () => {
    expect(() =>
      CreateDatabaseConfigSchema.parse({
        title: "T",
        properties: { Name: { type: "title" } },
      }),
    ).toThrow();
  });

  it("rejects when title is missing", () => {
    expect(() =>
      CreateDatabaseConfigSchema.parse({
        parentPageId: "p-1",
        properties: { Name: { type: "title" } },
      }),
    ).toThrow();
  });

  it("rejects empty parentPageId / title", () => {
    expect(() =>
      CreateDatabaseConfigSchema.parse({
        parentPageId: "",
        title: "T",
        properties: { Name: { type: "title" } },
      }),
    ).toThrow();
    expect(() =>
      CreateDatabaseConfigSchema.parse({
        parentPageId: "p-1",
        title: "",
        properties: { Name: { type: "title" } },
      }),
    ).toThrow();
  });

  it("rejects when properties has zero entries", () => {
    expect(() =>
      CreateDatabaseConfigSchema.parse({
        parentPageId: "p-1",
        title: "T",
        properties: {},
      }),
    ).toThrow(/at least one property/);
  });

  it("rejects when properties has ZERO title-type entries", () => {
    expect(() =>
      CreateDatabaseConfigSchema.parse({
        parentPageId: "p-1",
        title: "T",
        properties: { Notes: { type: "rich_text" } },
      }),
    ).toThrow(/EXACTLY ONE property of type 'title'/);
  });

  it("rejects when properties has MULTIPLE title-type entries", () => {
    expect(() =>
      CreateDatabaseConfigSchema.parse({
        parentPageId: "p-1",
        title: "T",
        properties: {
          Name: { type: "title" },
          AltName: { type: "title" },
        },
      }),
    ).toThrow(/EXACTLY ONE property of type 'title'/);
  });

  it("rejects an unsupported property type (e.g. multi_select — deferred)", () => {
    expect(() =>
      CreateDatabaseConfigSchema.parse({
        parentPageId: "p-1",
        title: "T",
        properties: {
          Name: { type: "title" },
          Tags: { type: "multi_select" },
        },
      }),
    ).toThrow();
  });

  it("rejects raw Notion wire-format property shape (e.g. { select: { options } })", () => {
    expect(() =>
      CreateDatabaseConfigSchema.parse({
        parentPageId: "p-1",
        title: "T",
        properties: {
          Name: { type: "title" },
          Status: { select: { options: [{ name: "Done" }] } },
        },
      }),
    ).toThrow();
  });

  it("rejects unknown top-level fields (.strict)", () => {
    expect(() =>
      CreateDatabaseConfigSchema.parse({
        parentPageId: "p-1",
        title: "T",
        properties: { Name: { type: "title" } },
        parent: { workspace: true }, // workspace-parent NOT supported
      }),
    ).toThrow();
    expect(() =>
      CreateDatabaseConfigSchema.parse({
        parentPageId: "p-1",
        title: "T",
        properties: { Name: { type: "title" } },
        rich_text: [],
      }),
    ).toThrow();
  });
});

describe("create_database handler", () => {
  it("forwards parentPageId / title / properties / optional fields to the wrapper", async () => {
    mockCreate.mockResolvedValueOnce({
      object: "database",
      id: "db-new",
    });
    await createDatabase({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        parentPageId: "p-1",
        title: "T",
        description: "desc",
        isInline: true,
        properties: { Name: { type: "title" }, Done: { type: "checkbox" } },
      },
      triggerEvent: trigger(),
    });
    const callArg = mockCreate.mock.calls[0]![0]!;
    expect(callArg).toEqual({
      accessToken: "tok",
      parentPageId: "p-1",
      title: "T",
      description: "desc",
      isInline: true,
      properties: { Name: { type: "title" }, Done: { type: "checkbox" } },
    });
  });

  it("returns the locked output key set with mapped values", async () => {
    mockCreate.mockResolvedValueOnce({
      object: "database",
      id: "db-new",
      url: "https://notion.so/db-new",
      title: [{ plain_text: "My DB" }],
      description: [{ plain_text: "Hello" }],
      archived: false,
      is_inline: true,
      parent: { type: "page_id", page_id: "p-1" },
      created_time: "2026-05-14T10:00:00Z",
      last_edited_time: "2026-05-14T10:00:00Z",
      properties: { Name: { id: "n", type: "title", title: {} } },
    });
    const result = await createDatabase({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        parentPageId: "p-1",
        title: "My DB",
        description: "Hello",
        isInline: true,
        properties: { Name: { type: "title" } },
      },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      databaseId: "db-new",
      object: "database",
      url: "https://notion.so/db-new",
      title: "My DB",
      description: "Hello",
      archived: false,
      isInline: true,
      parentType: "page_id",
      parentId: "p-1",
      createdTime: "2026-05-14T10:00:00Z",
      lastEditedTime: "2026-05-14T10:00:00Z",
      properties: { Name: { id: "n", type: "title", title: {} } },
    });
  });

  it("null-coalesces optional fields when Notion omits them", async () => {
    mockCreate.mockResolvedValueOnce({
      object: "database",
      id: "db-new",
      // no url, title, description, parent, timestamps, properties
    });
    const result = await createDatabase({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        parentPageId: "p-1",
        title: "T",
        properties: { Name: { type: "title" } },
      },
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.url).toBeNull();
    expect(output.title).toBe("");
    expect(output.description).toBe("");
    expect(output.archived).toBe(false);
    expect(output.isInline).toBe(false);
    expect(output.parentType).toBeNull();
    expect(output.parentId).toBeNull();
    expect(output.createdTime).toBeNull();
    expect(output.lastEditedTime).toBeNull();
    expect(output.properties).toEqual({});
  });

  it("propagates Notion API errors verbatim", async () => {
    mockCreate.mockRejectedValueOnce(new Error("notion_404"));
    await expect(
      createDatabase({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          parentPageId: "p-missing",
          title: "T",
          properties: { Name: { type: "title" } },
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow("notion_404");
  });

  it("does NOT spread input config into output (output key set is locked)", async () => {
    mockCreate.mockResolvedValueOnce({
      object: "database",
      id: "db-new",
    });
    const result = await createDatabase({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        parentPageId: "p-1",
        title: "T",
        properties: { Name: { type: "title" } },
      },
      triggerEvent: trigger(),
    });
    const outKeys = Object.keys(result.output ?? {}).sort();
    expect(outKeys).toEqual(
      [
        "databaseId",
        "object",
        "url",
        "title",
        "description",
        "archived",
        "isInline",
        "parentType",
        "parentId",
        "createdTime",
        "lastEditedTime",
        "properties",
      ].sort(),
    );
  });
});
