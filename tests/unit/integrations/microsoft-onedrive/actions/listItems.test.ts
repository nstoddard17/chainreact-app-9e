/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-onedrive/api/driveItemsList", () => ({
  driveItemsList: (...args: unknown[]) => mockList(...args),
}));

import { listItems } from "@/integrations/microsoft-onedrive/actions/listItems";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-onedrive",
    eventType: "file_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    accountId: "alice@contoso.com",
    payload: {},
  };
}

describe("list_items action", () => {
  it("normalizes items and surfaces { count, hasMore, nextLink }", async () => {
    mockList.mockResolvedValueOnce({
      items: [
        {
          id: "i-1",
          name: "report.pdf",
          file: { mimeType: "application/pdf" },
          size: 4096,
          webUrl: "https://1drv.ms/r",
          createdDateTime: "2026-05-08T10:00:00Z",
          lastModifiedDateTime: "2026-05-09T11:00:00Z",
        },
        {
          id: "f-1",
          name: "Subfolder",
          folder: { childCount: 3 },
        },
      ],
      nextLink: "https://graph.microsoft.com/v1.0/...&$skiptoken=abc",
    });

    const result = await listItems({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });

    expect(result.output.count).toBe(2);
    expect(result.output.hasMore).toBe(true);
    expect(result.output.nextLink).toMatch(/skiptoken/);
    const items = result.output.items as Array<Record<string, unknown>>;
    expect(items[0]).toEqual(
      expect.objectContaining({
        itemId: "i-1",
        kind: "file",
        mimeType: "application/pdf",
        size: 4096,
      }),
    );
    expect(items[1]).toEqual(
      expect.objectContaining({
        itemId: "f-1",
        kind: "folder",
        mimeType: null,
      }),
    );
  });

  it("forwards parentItemId / top / orderBy to the wrapper", async () => {
    mockList.mockResolvedValueOnce({ items: [], nextLink: null });

    await listItems({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        parentItemId: "f-1",
        top: 50,
        orderBy: "name asc",
      },
      triggerEvent: trigger(),
    });

    const call = mockList.mock.calls[0]![0];
    expect(call.parentItemId).toBe("f-1");
    expect(call.top).toBe(50);
    expect(call.orderBy).toBe("name asc");
  });

  it("returns hasMore: false when nextLink is null", async () => {
    mockList.mockResolvedValueOnce({ items: [], nextLink: null });

    const result = await listItems({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });

    expect(result.output.hasMore).toBe(false);
    expect(result.output.nextLink).toBeNull();
  });

  it("rejects top out of range (Graph 1..1000)", async () => {
    await expect(
      listItems({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { top: 0 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();

    await expect(
      listItems({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { top: 1001 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
