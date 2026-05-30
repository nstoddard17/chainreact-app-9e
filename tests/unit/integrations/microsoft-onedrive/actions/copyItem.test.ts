/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCopy = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-onedrive/api/driveItemsCopy", () => ({
  driveItemsCopy: (...args: unknown[]) => mockCopy(...args),
}));

import { copyItem } from "@/integrations/microsoft-onedrive/actions/copyItem";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCopy.mockReset();
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
    providerAccountId: "alice@contoso.com",
    payload: {},
  };
}

describe("copy_item action", () => {
  it("returns { status: 'pending', monitorUrl, ... } and does NOT poll", async () => {
    mockCopy.mockResolvedValueOnce({
      status: "pending",
      monitorUrl: "https://graph.microsoft.com/v1.0/operations/op-42",
    });

    const result = await copyItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        itemId: "src-1",
        targetParentItemId: "dest-1",
      },
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({
      status: "pending",
      monitorUrl: "https://graph.microsoft.com/v1.0/operations/op-42",
      sourceItemId: "src-1",
      targetParentItemId: "dest-1",
      newName: null,
    });
    // Wrapper is called exactly once — no polling loop on the action layer.
    expect(mockCopy).toHaveBeenCalledTimes(1);
  });

  it("forwards newName to the wrapper when supplied and surfaces it on output", async () => {
    mockCopy.mockResolvedValueOnce({
      status: "pending",
      monitorUrl: "https://graph/op",
    });

    const result = await copyItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        itemId: "src-1",
        targetParentItemId: "dest-1",
        newName: "copy.txt",
      },
      triggerEvent: trigger(),
    });

    expect(mockCopy.mock.calls[0]![0].newName).toBe("copy.txt");
    expect(result.output.newName).toBe("copy.txt");
  });

  it("rejects empty itemId", async () => {
    await expect(
      copyItem({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { itemId: "", targetParentItemId: "p" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects empty targetParentItemId (Graph /copy mandates a destination)", async () => {
    await expect(
      copyItem({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { itemId: "i", targetParentItemId: "" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/destination/);
  });

  it("rejects unknown fields (strict mode catches V1's waitForCompletion / conflictBehavior leftovers)", async () => {
    await expect(
      copyItem({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          itemId: "i",
          targetParentItemId: "p",
          waitForCompletion: true,
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
