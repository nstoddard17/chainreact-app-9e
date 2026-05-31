/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockProductsSearch = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/_shared/hubspot/api/products", () => ({
  productsSearch: (...a: unknown[]) => mockProductsSearch(...a),
}));

import { getProducts } from "@/integrations/hubspot/actions/getProducts";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockProductsSearch.mockReset();
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

describe("get_products", () => {
  it("uses default properties when omitted", async () => {
    mockProductsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getProducts({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(mockProductsSearch.mock.calls[0]![0]!.properties).toEqual([
      "name",
      "description",
      "price",
      "hs_sku",
    ]);
  });

  it("accepts comma-separated string for properties", async () => {
    mockProductsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getProducts({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { properties: "name, price" },
      triggerEvent: trigger,
    });
    expect(mockProductsSearch.mock.calls[0]![0]!.properties).toEqual([
      "name",
      "price",
    ]);
  });

  it("accepts array for properties", async () => {
    mockProductsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getProducts({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { properties: ["name", "hs_sku"] },
      triggerEvent: trigger,
    });
    expect(mockProductsSearch.mock.calls[0]![0]!.properties).toEqual([
      "name",
      "hs_sku",
    ]);
  });

  it("builds an EQ filter when both filterProperty + filterValue are present", async () => {
    mockProductsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getProducts({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { filterProperty: "hs_sku", filterValue: "SKU-001" },
      triggerEvent: trigger,
    });
    expect(mockProductsSearch.mock.calls[0]![0]!.filters).toEqual([
      { propertyName: "hs_sku", operator: "EQ", value: "SKU-001" },
    ]);
  });

  it("omits filters when only filterValue is supplied", async () => {
    mockProductsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getProducts({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { filterValue: "x" },
      triggerEvent: trigger,
    });
    expect(mockProductsSearch.mock.calls[0]![0]!.filters).toEqual([]);
  });

  it("returns bounded { products, count, total, nextCursor, hasMore }", async () => {
    mockProductsSearch.mockResolvedValueOnce({
      total: 42,
      results: [
        { id: "p-1", properties: { name: "Widget" } },
        { id: "p-2", properties: { name: "Gadget" } },
      ],
      paging: { next: { after: "cursor-q", link: "https://x" } },
    });
    const result = await getProducts({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(result.output.products).toHaveLength(2);
    expect(result.output.count).toBe(2);
    expect(result.output.total).toBe(42);
    expect(result.output.nextCursor).toBe("cursor-q");
    expect(result.output.hasMore).toBe(true);
  });

  it("does NOT leak paging.next.link in output", async () => {
    mockProductsSearch.mockResolvedValueOnce({
      total: 1,
      results: [{ id: "p-1", properties: {} }],
      paging: { next: { after: "c", link: "https://api.hubapi.com/secret" } },
    });
    const result = await getProducts({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(JSON.stringify(result.output)).not.toContain("hubapi.com");
    expect(JSON.stringify(result.output)).not.toContain("link");
  });

  it("returns hasMore=false when paging.next is absent", async () => {
    mockProductsSearch.mockResolvedValueOnce({ total: 1, results: [] });
    const result = await getProducts({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(result.output.hasMore).toBe(false);
    expect(result.output.nextCursor).toBeNull();
  });

  it("rejects limit > 100 at schema time", async () => {
    await expect(
      getProducts({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { limit: 1000 },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
    expect(mockProductsSearch).not.toHaveBeenCalled();
  });

  it("rejects unknown fields (strict mode)", async () => {
    await expect(
      getProducts({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { hasHeaders: true } as Record<string, unknown>,
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
  });

  it("wraps in refreshAndRetry with provider+userId+accountId", async () => {
    mockProductsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getProducts({
      workflowId: "wf",
      userId: "user-7",
      accountId: "acct-user-7",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    const arg = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(arg.provider).toBe("hubspot");
    expect(arg.accountId).toBe("acct-user-7");
    expect(arg.providerAccountId).toBe("portal-1");
  });

  it("forwards after cursor when supplied", async () => {
    mockProductsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getProducts({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { after: "cursor-7" },
      triggerEvent: trigger,
    });
    expect(mockProductsSearch.mock.calls[0]![0]!.after).toBe("cursor-7");
  });
});
