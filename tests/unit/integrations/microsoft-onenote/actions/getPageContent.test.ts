/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockPagesGet = jest.fn();
const mockPageContentGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-onenote/api/pagesGet", () => ({
  pagesGet: (...args: unknown[]) => mockPagesGet(...args),
}));
jest.mock("@/integrations/microsoft-onenote/api/pageContentGet", () => ({
  pageContentGet: (...args: unknown[]) => mockPageContentGet(...args),
}));

import { getPageContent } from "@/integrations/microsoft-onenote/actions/getPageContent";
import { GetPageContentConfigSchema } from "@/integrations/microsoft-onenote/actions/getPageContent.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockPagesGet.mockReset();
  mockPageContentGet.mockReset();
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
    accountId: "alice@contoso.com",
    payload: {},
  };
}

describe("get_page_content schema", () => {
  it("V1-preserved defaults: includeIDs=false, preGenerated=true", () => {
    const parsed = GetPageContentConfigSchema.parse({ pageId: "p" });
    expect(parsed.includeIDs).toBe(false);
    expect(parsed.preGenerated).toBe(true);
  });

  it("requires pageId", () => {
    expect(() => GetPageContentConfigSchema.parse({})).toThrow();
  });
});

describe("get_page_content handler", () => {
  it("fetches metadata + body and returns combined output with `content` (HTML body)", async () => {
    mockPagesGet.mockResolvedValueOnce({
      id: "p-1",
      title: "Notes",
      contentUrl: "https://x/c",
      links: { oneNoteWebUrl: { href: "https://x/edit" } },
      createdDateTime: "2026-05-01T00:00:00Z",
      lastModifiedDateTime: "2026-05-09T00:00:00Z",
      level: 0,
    });
    mockPageContentGet.mockResolvedValueOnce({
      html: "<html><body><p>Hello</p></body></html>",
    });

    const result = await getPageContent({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1" },
      triggerEvent: trigger(),
    });

    expect(result.output.id).toBe("p-1");
    expect(result.output.title).toBe("Notes");
    expect(result.output.content).toBe(
      "<html><body><p>Hello</p></body></html>",
    );
    expect(result.output.webUrl).toBe("https://x/edit");
  });

  it("forwards includeIDs + preGenerated to the content wrapper", async () => {
    mockPagesGet.mockResolvedValueOnce({ id: "p", title: "x" });
    mockPageContentGet.mockResolvedValueOnce({ html: "<p/>" });

    await getPageContent({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p", includeIDs: true, preGenerated: false },
      triggerEvent: trigger(),
    });

    const call = mockPageContentGet.mock.calls[0]![0];
    expect(call.includeIDs).toBe(true);
    expect(call.preGenerated).toBe(false);
  });
});
