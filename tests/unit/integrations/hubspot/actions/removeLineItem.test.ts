/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockLineItemsDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/_shared/hubspot/api/lineItems", () => ({
  lineItemsDelete: (...a: unknown[]) => mockLineItemsDelete(...a),
}));

import { removeLineItem } from "@/integrations/hubspot/actions/line_items/removeLineItem";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockLineItemsDelete.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const trigger: TriggerEvent = {
  provider: "hubspot",
  eventType: "webhook_received",
  eventId: "e",
  occurredAt: "x",
  providerAccountId: "portal-1",
  payload: {},
};

describe("remove_line_item", () => {
  it("calls lineItemsDelete with the configured lineItemId", async () => {
    mockLineItemsDelete.mockResolvedValueOnce(undefined);
    await removeLineItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { lineItemId: "li-42" },
      triggerEvent: trigger,
    });
    expect(mockLineItemsDelete.mock.calls[0]![0]!.lineItemId).toBe("li-42");
  });

  it("returns bounded output { lineItemId, deleted: true }", async () => {
    mockLineItemsDelete.mockResolvedValueOnce(undefined);
    const result = await removeLineItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { lineItemId: "li-7" },
      triggerEvent: trigger,
    });
    expect(result.output).toEqual({
      lineItemId: "li-7",
      deleted: true,
    });
  });

  it("wraps the wrapper call in refreshAndRetry with provider+userId+accountId", async () => {
    mockLineItemsDelete.mockResolvedValueOnce(undefined);
    await removeLineItem({
      workflowId: "wf",
      userId: "user-xyz",
      accountId: "acct-user-xyz",
      runId: "r",
      nodeId: "n",
      config: { lineItemId: "li-1" },
      triggerEvent: trigger,
    });
    const callArg = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(callArg.provider).toBe("hubspot");
    expect(callArg.userId).toBe("user-xyz");
    expect(callArg.accountId).toBe("portal-1");
  });

  it("threads accountId=null when triggerEvent is not from hubspot", async () => {
    mockLineItemsDelete.mockResolvedValueOnce(undefined);
    await removeLineItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { lineItemId: "li-1" },
      triggerEvent: {
        provider: "slack",
        eventType: "manual",
        eventId: "e",
        occurredAt: "x",
        providerAccountId: "T-other",
        payload: {},
      },
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.accountId).toBeNull();
  });

  it("rejects empty lineItemId at schema time", async () => {
    await expect(
      removeLineItem({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { lineItemId: "" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
    expect(mockLineItemsDelete).not.toHaveBeenCalled();
  });

  it("rejects unknown fields at schema time (strict mode)", async () => {
    await expect(
      removeLineItem({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { lineItemId: "li-1", deleteBy: "id" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
    expect(mockLineItemsDelete).not.toHaveBeenCalled();
  });

  it("propagates wrapper errors (e.g. 404 NotFoundError) verbatim", async () => {
    mockLineItemsDelete.mockRejectedValueOnce(new Error("line item li-9 not found"));
    await expect(
      removeLineItem({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { lineItemId: "li-9" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow(/not found/);
  });
});
