/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockPagesList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-onenote/api/pagesList", () => ({
  pagesList: (...args: unknown[]) => mockPagesList(...args),
}));

import { listPages } from "@/integrations/microsoft-onenote/actions/listPages";
import { ListPagesConfigSchema } from "@/integrations/microsoft-onenote/actions/listPages.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockPagesList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-onenote",
    eventType: "manual",
    eventId: "e",
    occurredAt: "t",
    providerAccountId: "alice@contoso.com",
    payload: {},
  };
}

describe("list_pages schema", () => {
  it("defaults: orderBy='lastModifiedDateTime desc', top=20 (V1-preserved)", () => {
    const parsed = ListPagesConfigSchema.parse({ sectionId: "s-1" });
    expect(parsed.orderBy).toBe("lastModifiedDateTime desc");
    expect(parsed.top).toBe(20);
  });

  it("ONENOTE-1 D-defer: rejects V1's raw OData `filter` field (strict mode)", () => {
    expect(() =>
      ListPagesConfigSchema.parse({
        sectionId: "s",
        filter: "createdDateTime ge 2024-01-01",
      }),
    ).toThrow();
  });

  it("rejects unknown orderBy values", () => {
    expect(() =>
      ListPagesConfigSchema.parse({
        sectionId: "s",
        orderBy: "rating desc",
      }),
    ).toThrow();
  });

  it("rejects top > 100 (Graph cap) and top < 1", () => {
    expect(() =>
      ListPagesConfigSchema.parse({ sectionId: "s", top: 101 }),
    ).toThrow();
    expect(() =>
      ListPagesConfigSchema.parse({ sectionId: "s", top: 0 }),
    ).toThrow();
  });

  it("requires sectionId", () => {
    expect(() => ListPagesConfigSchema.parse({})).toThrow();
  });
});

describe("list_pages handler", () => {
  it("normalizes Graph page entries to the V2 output shape", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        {
          id: "p-1",
          title: "First",
          contentUrl: "https://x/p-1/content",
          links: { oneNoteWebUrl: { href: "https://x/p-1/edit" } },
          createdDateTime: "2026-05-01T00:00:00Z",
          lastModifiedDateTime: "2026-05-09T00:00:00Z",
          level: 0,
          order: 0,
        },
        {
          id: "p-2",
          title: "Second",
        },
      ],
      nextLink: "https://graph/next-token",
    });

    const result = await listPages({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { sectionId: "s-1" },
      triggerEvent: trigger(),
    });

    const pages = result.output.pages as Array<Record<string, unknown>>;
    expect(pages).toHaveLength(2);
    expect(pages[0]).toEqual({
      id: "p-1",
      title: "First",
      contentUrl: "https://x/p-1/content",
      webUrl: "https://x/p-1/edit",
      createdDateTime: "2026-05-01T00:00:00Z",
      lastModifiedDateTime: "2026-05-09T00:00:00Z",
      level: 0,
      order: 0,
    });
    expect(pages[1]!.webUrl).toBeNull();
    expect(pages[1]!.contentUrl).toBeNull();
    expect(result.output.count).toBe(2);
    expect(result.output.hasMore).toBe(true);
    expect(result.output.nextLink).toBe("https://graph/next-token");
  });

  it("returns empty pages array + hasMore=false when there are no results", async () => {
    mockPagesList.mockResolvedValueOnce({ pages: [], nextLink: null });
    const result = await listPages({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { sectionId: "s-1" },
      triggerEvent: trigger(),
    });
    expect(result.output.pages).toEqual([]);
    expect(result.output.count).toBe(0);
    expect(result.output.hasMore).toBe(false);
    expect(result.output.nextLink).toBeNull();
  });

  it("does NOT auto-paginate — single Graph call regardless of nextLink", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [{ id: "p" }],
      nextLink: "https://graph/page2",
    });
    await listPages({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { sectionId: "s-1" },
      triggerEvent: trigger(),
    });
    expect(mockPagesList).toHaveBeenCalledTimes(1);
  });
});
