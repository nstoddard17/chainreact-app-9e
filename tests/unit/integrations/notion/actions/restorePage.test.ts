/**
 * @jest-environment node
 *
 * Tests for integrations/notion/actions/restorePage (Notion 2.1 Commit 1).
 *
 * Mirrors archivePage.test.ts but for the un-archive direction.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import { RestorePageConfigSchema } from "@/integrations/notion/actions/restorePage.schema";

const mockRefreshAndRetry = jest.fn();
const mockUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/notion/api/pages", () => ({
  pagesCreate: jest.fn(),
  pagesRetrieve: jest.fn(),
  pagesUpdate: (...args: unknown[]) => mockUpdate(...args),
}));

import { restorePage } from "@/integrations/notion/actions/restorePage";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUpdate.mockReset();
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

describe("restore_page schema (RestorePageConfigSchema)", () => {
  it("accepts a valid pageId", () => {
    const parsed = RestorePageConfigSchema.parse({ pageId: "page-abc" });
    expect(parsed).toEqual({ pageId: "page-abc" });
  });

  it("rejects when pageId is missing", () => {
    expect(() => RestorePageConfigSchema.parse({})).toThrow();
  });

  it("rejects an empty pageId", () => {
    expect(() => RestorePageConfigSchema.parse({ pageId: "" })).toThrow();
  });

  it("rejects unknown fields (.strict)", () => {
    expect(() =>
      RestorePageConfigSchema.parse({ pageId: "p1", extra: "x" }),
    ).toThrow();
  });

  it("rejects `archived` as a config field — handler controls it", () => {
    // Workflow authors cannot bypass the restore_page → archived:false
    // contract by passing archived:true through this schema.
    expect(() =>
      RestorePageConfigSchema.parse({ pageId: "p1", archived: true }),
    ).toThrow();
  });

  it("rejects `properties` (this action does not mutate properties)", () => {
    expect(() =>
      RestorePageConfigSchema.parse({ pageId: "p1", properties: {} }),
    ).toThrow();
  });

  it("rejects a non-string pageId", () => {
    expect(() => RestorePageConfigSchema.parse({ pageId: 123 })).toThrow();
  });
});

describe("restore_page handler", () => {
  it("calls pagesUpdate with archived: false and the given pageId", async () => {
    mockUpdate.mockResolvedValueOnce({
      object: "page",
      id: "p-1",
      archived: false,
    });
    await restorePage({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1" },
      triggerEvent: trigger(),
    });
    const callArg = mockUpdate.mock.calls[0]![0]!;
    expect(callArg.pageId).toBe("p-1");
    expect(callArg.archived).toBe(false);
    expect(callArg.properties).toBeUndefined();
    expect(callArg.icon).toBeUndefined();
    expect(callArg.cover).toBeUndefined();
  });

  it("returns { pageId, url, archived, lastEditedTime } from the response", async () => {
    mockUpdate.mockResolvedValueOnce({
      object: "page",
      id: "p-1",
      url: "https://notion.so/p1",
      archived: false,
      last_edited_time: "2026-05-14T12:01:00Z",
    });
    const result = await restorePage({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1" },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      pageId: "p-1",
      url: "https://notion.so/p1",
      archived: false,
      lastEditedTime: "2026-05-14T12:01:00Z",
    });
  });

  it("nulls url + lastEditedTime when response omits them", async () => {
    mockUpdate.mockResolvedValueOnce({ object: "page", id: "p-1" });
    const result = await restorePage({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1" },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      pageId: "p-1",
      url: null,
      archived: false,
      lastEditedTime: null,
    });
  });

  it("propagates Notion API errors verbatim", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("notion_404"));
    await expect(
      restorePage({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { pageId: "p-missing" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow("notion_404");
  });

  it("does NOT spread input config into output", async () => {
    mockUpdate.mockResolvedValueOnce({
      object: "page",
      id: "p-1",
      archived: false,
    });
    const result = await restorePage({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1" },
      triggerEvent: trigger(),
    });
    const outKeys = Object.keys(result.output ?? {});
    expect(outKeys.sort()).toEqual(
      ["pageId", "url", "archived", "lastEditedTime"].sort(),
    );
  });
});
