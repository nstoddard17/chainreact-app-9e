/**
 * @jest-environment node
 *
 * Tests for create_line_item + update_line_item.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockLineItemsCreate = jest.fn();
const mockLineItemsUpdate = jest.fn();
const mockAttachAssociations = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/_shared/hubspot/api/lineItems", () => ({
  lineItemsCreate: (...a: unknown[]) => mockLineItemsCreate(...a),
  lineItemsUpdate: (...a: unknown[]) => mockLineItemsUpdate(...a),
}));
jest.mock("@/integrations/_shared/hubspot/api/associations", () => ({
  attachAssociations: (...a: unknown[]) => mockAttachAssociations(...a),
}));

import { createLineItem } from "@/integrations/hubspot/actions/createLineItem";
import { updateLineItem } from "@/integrations/hubspot/actions/updateLineItem";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockLineItemsCreate.mockReset();
  mockLineItemsUpdate.mockReset();
  mockAttachAssociations.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockAttachAssociations.mockResolvedValue({ attached: [], warnings: [] });
});

const trigger: TriggerEvent = {
  provider: "hubspot",
  eventType: "manual",
  eventId: "e",
  occurredAt: "x",
  accountId: "p",
  payload: {},
};

// ─── createLineItem ─────────────────────────────────────────────────────────

describe("create_line_item", () => {
  it("rejects missing dealId or quantity at schema", async () => {
    await expect(
      createLineItem({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { hs_product_id: "p-1", quantity: "1" }, // missing dealId
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
    await expect(
      createLineItem({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { dealId: "d-1", hs_product_id: "p-1" }, // missing quantity
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
  });

  it("rejects when both hs_product_id AND name are missing (handler enforces)", async () => {
    await expect(
      createLineItem({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { dealId: "d-1", quantity: "1" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow(/hs_product_id.*name/i);
  });

  it("accepts hs_product_id-only payloads", async () => {
    mockLineItemsCreate.mockResolvedValueOnce({
      id: "li-1",
      properties: { hs_product_id: "p-1", quantity: "2" },
    });
    await createLineItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { dealId: "d-1", hs_product_id: "p-1", quantity: "2" },
      triggerEvent: trigger,
    });
    expect(mockLineItemsCreate.mock.calls[0]![0]!.properties).toEqual({
      hs_product_id: "p-1",
      quantity: "2",
    });
  });

  it("accepts name-only payloads (free-form line item)", async () => {
    mockLineItemsCreate.mockResolvedValueOnce({
      id: "li-1",
      properties: { name: "Custom", quantity: "1" },
    });
    await createLineItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { dealId: "d-1", name: "Custom", quantity: "1" },
      triggerEvent: trigger,
    });
    expect(mockLineItemsCreate.mock.calls[0]![0]!.properties).toEqual({
      name: "Custom",
      quantity: "1",
    });
  });

  it("ALWAYS associates to dealId after create (line-item-to-deal is mandatory)", async () => {
    mockLineItemsCreate.mockResolvedValueOnce({
      id: "li-1",
      properties: {},
    });
    await createLineItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { dealId: "d-1", hs_product_id: "p-1", quantity: "1" },
      triggerEvent: trigger,
    });
    expect(mockAttachAssociations).toHaveBeenCalledTimes(1);
    expect(mockAttachAssociations.mock.calls[0]![0]!).toMatchObject({
      fromType: "line_items",
      fromId: "li-1",
      toIds: { deals: "d-1" },
    });
  });
});

// ─── updateLineItem ─────────────────────────────────────────────────────────

describe("update_line_item", () => {
  it("PATCHes lineItemsUpdate; throws on empty property set", async () => {
    await expect(
      updateLineItem({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { lineItemId: "li-1" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow(/at least one property/);
  });

  it("PATCHes with supplied fields", async () => {
    mockLineItemsUpdate.mockResolvedValueOnce({
      id: "li-1",
      properties: { quantity: "5" },
      updatedAt: "y",
    });
    await updateLineItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { lineItemId: "li-1", quantity: "5" },
      triggerEvent: trigger,
    });
    expect(mockLineItemsUpdate.mock.calls[0]![0]!).toMatchObject({
      lineItemId: "li-1",
      properties: { quantity: "5" },
    });
  });
});
