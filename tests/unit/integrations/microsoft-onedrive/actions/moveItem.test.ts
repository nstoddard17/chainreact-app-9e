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

jest.mock("@/integrations/microsoft-onedrive/api/driveItemsUpdate", () => ({
  driveItemsUpdate: (...args: unknown[]) => mockUpdate(...args),
}));

import { moveItem } from "@/integrations/microsoft-onedrive/actions/moveItem";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUpdate.mockReset();
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

describe("move_item action", () => {
  it("renames in place when only newName is supplied (V1 rename_item collapsed in)", async () => {
    mockUpdate.mockResolvedValueOnce({
      id: "i-1",
      name: "renamed.txt",
      parentReference: { id: "p-orig" },
      lastModifiedDateTime: "2026-05-09T11:00:00Z",
    });

    const result = await moveItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "i-1", newName: "renamed.txt" },
      triggerEvent: trigger(),
    });

    const call = mockUpdate.mock.calls[0]![0];
    expect(call.itemId).toBe("i-1");
    expect(call.newName).toBe("renamed.txt");
    expect(call.targetParentItemId).toBeUndefined();
    expect(result.output.name).toBe("renamed.txt");
  });

  it("moves when only targetParentItemId is supplied", async () => {
    mockUpdate.mockResolvedValueOnce({
      id: "i-1",
      name: "x.txt",
      parentReference: { id: "p-2" },
    });

    await moveItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "i-1", targetParentItemId: "p-2" },
      triggerEvent: trigger(),
    });

    const call = mockUpdate.mock.calls[0]![0];
    expect(call.targetParentItemId).toBe("p-2");
    expect(call.newName).toBeUndefined();
  });

  it("atomically moves + renames when both supplied", async () => {
    mockUpdate.mockResolvedValueOnce({
      id: "i-1",
      name: "moved.txt",
      parentReference: { id: "p-2" },
    });

    await moveItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        itemId: "i-1",
        targetParentItemId: "p-2",
        newName: "moved.txt",
      },
      triggerEvent: trigger(),
    });

    const call = mockUpdate.mock.calls[0]![0];
    expect(call.targetParentItemId).toBe("p-2");
    expect(call.newName).toBe("moved.txt");
  });

  it("rejects when neither targetParentItemId nor newName is supplied (cross-field refine)", async () => {
    await expect(
      moveItem({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { itemId: "i-1" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/At least one of targetParentItemId or newName/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects empty itemId", async () => {
    await expect(
      moveItem({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { itemId: "", newName: "x" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
