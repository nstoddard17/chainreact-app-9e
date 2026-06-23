/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockRetrieve = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/notion/api/pages", () => ({
  pagesRetrieve: (...args: unknown[]) => mockRetrieve(...args),
}));

import { getPage } from "@/integrations/notion/actions/getPage";

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
    occurredAt: "2026-05-09T12:00:00Z",
    providerAccountId: "bot-123",
    payload: {},
  };
}

describe("get_page action", () => {
  it("returns parsed properties + skipped list", async () => {
    mockRetrieve.mockResolvedValueOnce({
      object: "page",
      id: "p-1",
      url: "https://www.notion.so/p-1",
      archived: false,
      parent: { database_id: "db-1" },
      created_time: "2026-05-08T10:00:00Z",
      last_edited_time: "2026-05-09T11:00:00Z",
      properties: {
        Name: { type: "title", title: [{ plain_text: "Q2 plan" }] },
        Score: { type: "number", number: 99 },
        Owner: { type: "people", people: [{ id: "u-1" }] },
      },
    });

    const result = await getPage({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1" },
      triggerEvent: trigger(),
    });

    expect(result.output).toMatchObject({
      pageId: "p-1",
      // top-level title convenience: extracted from the title-type property
      // regardless of its name ("Name" here), bounded to the plain-text value.
      title: "Q2 plan",
      url: "https://www.notion.so/p-1",
      archived: false,
      parent: { database_id: "db-1" },
      properties: {
        Name: { type: "title", value: "Q2 plan" },
        Score: { type: "number", value: 99 },
      },
      skippedProperties: [{ name: "Owner", type: "people" }],
    });
  });

  it("title is null when the page has no title property", async () => {
    mockRetrieve.mockResolvedValueOnce({ object: "page", id: "p-2", properties: {} });
    const result = await getPage({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-2" },
      triggerEvent: trigger(),
    });
    expect(result.output.title).toBeNull();
  });

  it("rejects empty pageId", async () => {
    await expect(
      getPage({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { pageId: "" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown fields (strict mode)", async () => {
    await expect(
      getPage({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { pageId: "p", extra: 1 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("calls refreshAndRetry with provider=notion and accountId from trigger", async () => {
    mockRetrieve.mockResolvedValueOnce({
      object: "page",
      id: "p-1",
      properties: {},
    });
    await getPage({
      workflowId: "wf",
      userId: "user-1",
      accountId: "acct-user-1",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "notion",
        providerAccountId: "bot-123",
      }),
    );
  });

  it("passes accountId=null when triggerEvent.provider differs", async () => {
    mockRetrieve.mockResolvedValueOnce({
      object: "page",
      id: "p-1",
      properties: {},
    });
    await getPage({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1" },
      triggerEvent: { ...trigger(), provider: "slack" },
    });
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ providerAccountId: null }),
    );
  });
});
