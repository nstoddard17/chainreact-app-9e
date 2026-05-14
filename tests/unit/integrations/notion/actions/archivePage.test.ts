/**
 * @jest-environment node
 *
 * Tests for integrations/notion/actions/archivePage (Notion 2.1 Commit 1).
 *
 * Covers:
 *   - schema: valid pageId, missing pageId, empty pageId, unknown fields
 *     rejected (.strict), `archived` rejected as config (handler-controlled)
 *   - handler: calls pagesUpdate with archived: true, output shape,
 *     null-coalescing for url + lastEditedTime, error propagation
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import { ArchivePageConfigSchema } from "@/integrations/notion/actions/archivePage.schema";

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

import { archivePage } from "@/integrations/notion/actions/archivePage";

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
    accountId: "bot-123",
    payload: {},
  };
}

describe("archive_page schema (ArchivePageConfigSchema)", () => {
  it("accepts a valid pageId", () => {
    const parsed = ArchivePageConfigSchema.parse({ pageId: "page-abc" });
    expect(parsed).toEqual({ pageId: "page-abc" });
  });

  it("rejects when pageId is missing", () => {
    expect(() => ArchivePageConfigSchema.parse({})).toThrow();
  });

  it("rejects an empty pageId", () => {
    expect(() => ArchivePageConfigSchema.parse({ pageId: "" })).toThrow();
  });

  it("rejects unknown fields (.strict)", () => {
    expect(() =>
      ArchivePageConfigSchema.parse({ pageId: "p1", extra: "x" }),
    ).toThrow();
  });

  it("rejects `archived` as a config field — handler controls it", () => {
    // Workflow authors cannot bypass the archive_page → archived:true
    // contract by passing archived:false through this schema.
    expect(() =>
      ArchivePageConfigSchema.parse({ pageId: "p1", archived: false }),
    ).toThrow();
  });

  it("rejects `properties` (this action does not mutate properties)", () => {
    expect(() =>
      ArchivePageConfigSchema.parse({ pageId: "p1", properties: {} }),
    ).toThrow();
  });

  it("rejects a non-string pageId", () => {
    expect(() => ArchivePageConfigSchema.parse({ pageId: 123 })).toThrow();
  });
});

describe("archive_page handler", () => {
  it("calls pagesUpdate with archived: true and the given pageId", async () => {
    mockUpdate.mockResolvedValueOnce({
      object: "page",
      id: "p-1",
      archived: true,
    });
    await archivePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1" },
      triggerEvent: trigger(),
    });
    const callArg = mockUpdate.mock.calls[0]![0]!;
    expect(callArg.pageId).toBe("p-1");
    expect(callArg.archived).toBe(true);
    // No other fields sent — strict archive contract.
    expect(callArg.properties).toBeUndefined();
    expect(callArg.icon).toBeUndefined();
    expect(callArg.cover).toBeUndefined();
  });

  it("returns { pageId, url, archived, lastEditedTime } from the response", async () => {
    mockUpdate.mockResolvedValueOnce({
      object: "page",
      id: "p-1",
      url: "https://notion.so/p1",
      archived: true,
      last_edited_time: "2026-05-14T12:01:00Z",
    });
    const result = await archivePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1" },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      pageId: "p-1",
      url: "https://notion.so/p1",
      archived: true,
      lastEditedTime: "2026-05-14T12:01:00Z",
    });
  });

  it("nulls url + lastEditedTime when response omits them", async () => {
    mockUpdate.mockResolvedValueOnce({ object: "page", id: "p-1" });
    const result = await archivePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1" },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      pageId: "p-1",
      url: null,
      archived: true,
      lastEditedTime: null,
    });
  });

  it("propagates Notion API errors verbatim (no swallowing)", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("notion_404"));
    await expect(
      archivePage({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { pageId: "p-missing" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow("notion_404");
  });

  it("does NOT spread input config into output (no `properties` leak)", async () => {
    // Defense — even if someone tries to widen the schema later, the
    // output should never carry input fields beyond pageId.
    mockUpdate.mockResolvedValueOnce({
      object: "page",
      id: "p-1",
      archived: true,
    });
    const result = await archivePage({
      workflowId: "wf",
      userId: "u",
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
