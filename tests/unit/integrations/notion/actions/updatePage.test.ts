/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

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

import { updatePage } from "@/integrations/notion/actions/updatePage";

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
    occurredAt: "2026-05-09T12:00:00Z",
    accountId: "bot-123",
    payload: {},
  };
}

describe("update_page action", () => {
  it("sends only properties when only properties supplied (Q11)", async () => {
    mockUpdate.mockResolvedValueOnce({
      object: "page",
      id: "p-1",
      archived: false,
      last_edited_time: "2026-05-09T12:00:00Z",
    });
    await updatePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        pageId: "p-1",
        properties: { Done: { type: "checkbox", value: true } },
      },
      triggerEvent: trigger(),
    });
    const callArg = mockUpdate.mock.calls[0]![0]!;
    expect(callArg.pageId).toBe("p-1");
    expect(callArg.properties).toEqual({ Done: { checkbox: true } });
    expect(callArg.archived).toBeUndefined();
    expect(callArg.icon).toBeUndefined();
    expect(callArg.cover).toBeUndefined();
  });

  it("sends only archived when only archived supplied", async () => {
    mockUpdate.mockResolvedValueOnce({
      object: "page",
      id: "p-1",
      archived: true,
    });
    await updatePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1", archived: true },
      triggerEvent: trigger(),
    });
    const callArg = mockUpdate.mock.calls[0]![0]!;
    expect(callArg.archived).toBe(true);
    expect(callArg.properties).toBeUndefined();
  });

  it("supports archived: false (un-archive)", async () => {
    mockUpdate.mockResolvedValueOnce({
      object: "page",
      id: "p-1",
      archived: false,
    });
    await updatePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1", archived: false },
      triggerEvent: trigger(),
    });
    expect(mockUpdate.mock.calls[0]![0]!.archived).toBe(false);
  });

  it("returns the updated page id + url + archived + lastEditedTime", async () => {
    mockUpdate.mockResolvedValueOnce({
      object: "page",
      id: "p-1",
      url: "https://x",
      archived: true,
      last_edited_time: "2026-05-09T12:00:00Z",
    });
    const result = await updatePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1", archived: true },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      pageId: "p-1",
      url: "https://x",
      archived: true,
      lastEditedTime: "2026-05-09T12:00:00Z",
    });
  });

  it("rejects when no field is set (refine)", async () => {
    await expect(
      updatePage({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { pageId: "p-1" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/at least one of/);
  });

  it("rejects empty pageId", async () => {
    await expect(
      updatePage({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { pageId: "", archived: true },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("supports null icon (clears) vs undefined (unchanged)", async () => {
    mockUpdate.mockResolvedValueOnce({
      object: "page",
      id: "p-1",
    });
    await updatePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1", icon: null },
      triggerEvent: trigger(),
    });
    expect(mockUpdate.mock.calls[0]![0]!.icon).toBeNull();
  });
});
