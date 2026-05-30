/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-onedrive/api/driveItemsDelete", () => ({
  driveItemsDelete: (...args: unknown[]) => mockDelete(...args),
}));

import { deleteItem } from "@/integrations/microsoft-onedrive/actions/deleteItem";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDelete.mockReset();
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

describe("delete_item action", () => {
  it("DELETEs the item and returns deleted: true on success", async () => {
    mockDelete.mockResolvedValueOnce(undefined);

    const result = await deleteItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "i-1" },
      triggerEvent: trigger(),
    });

    expect(mockDelete).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "tok", itemId: "i-1" }),
    );
    expect(result.output).toEqual({
      itemId: "i-1",
      deleted: true,
      alreadyMissing: false,
    });
  });

  it("returns alreadyMissing: true on 404 (idempotent — Slice 7 delete_event convention)", async () => {
    mockDelete.mockRejectedValueOnce(new NotFoundError("driveItem gone"));

    const result = await deleteItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "gone" },
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({
      itemId: "gone",
      deleted: true,
      alreadyMissing: true,
    });
  });

  it("propagates non-NotFoundError errors verbatim", async () => {
    mockDelete.mockRejectedValueOnce(
      new Error("Microsoft Graph me/drive/items/{id} DELETE failed: HTTP 500"),
    );

    await expect(
      deleteItem({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { itemId: "i" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("rejects empty itemId", async () => {
    await expect(
      deleteItem({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { itemId: "" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
