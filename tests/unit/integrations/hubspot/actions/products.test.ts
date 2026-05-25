/**
 * @jest-environment node
 *
 * Tests for create_product + update_product.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockProductsCreate = jest.fn();
const mockProductsUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/_shared/hubspot/api/products", () => ({
  productsCreate: (...a: unknown[]) => mockProductsCreate(...a),
  productsUpdate: (...a: unknown[]) => mockProductsUpdate(...a),
}));

import { createProduct } from "@/integrations/hubspot/actions/createProduct";
import { updateProduct } from "@/integrations/hubspot/actions/updateProduct";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockProductsCreate.mockReset();
  mockProductsUpdate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const trigger: TriggerEvent = {
  provider: "hubspot",
  eventType: "manual",
  eventId: "e",
  occurredAt: "x",
  accountId: "p",
  payload: {},
};

// ─── createProduct ──────────────────────────────────────────────────────────

describe("create_product", () => {
  it("rejects missing name", async () => {
    await expect(
      createProduct({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { price: "99.99" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
  });

  it("POSTs productsCreate with name + supplied optional fields", async () => {
    mockProductsCreate.mockResolvedValueOnce({
      id: "p-1",
      properties: { name: "Widget", price: "99.99" },
      createdAt: "x",
      updatedAt: "y",
    });
    await createProduct({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        name: "Widget",
        price: "99.99",
        hs_sku: "WGT-001",
      },
      triggerEvent: trigger,
    });
    expect(mockProductsCreate.mock.calls[0]![0]!.properties).toEqual({
      name: "Widget",
      price: "99.99",
      hs_sku: "WGT-001",
    });
  });

  it("returns canonical output", async () => {
    mockProductsCreate.mockResolvedValueOnce({
      id: "p-1",
      properties: { name: "X", price: "10", hs_sku: "SKU" },
      createdAt: "x",
      updatedAt: "y",
    });
    const result = await createProduct({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { name: "X" },
      triggerEvent: trigger,
    });
    expect(result.output).toMatchObject({
      productId: "p-1",
      name: "X",
      price: "10",
      sku: "SKU",
    });
  });
});

// ─── updateProduct ──────────────────────────────────────────────────────────

describe("update_product", () => {
  it("PATCHes productsUpdate; throws on empty property set", async () => {
    await expect(
      updateProduct({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { productId: "p-1" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow(/at least one property/);
  });

  it("PATCHes with supplied fields", async () => {
    mockProductsUpdate.mockResolvedValueOnce({
      id: "p-1",
      properties: { price: "129.99" },
      updatedAt: "y",
    });
    await updateProduct({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { productId: "p-1", price: "129.99" },
      triggerEvent: trigger,
    });
    expect(mockProductsUpdate.mock.calls[0]![0]!).toMatchObject({
      productId: "p-1",
      properties: { price: "129.99" },
    });
  });
});
