/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockLineItemsSearch = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/_shared/hubspot/api/lineItems", () => ({
  lineItemsSearch: (...a: unknown[]) => mockLineItemsSearch(...a),
}));

import { getLineItems } from "@/integrations/hubspot/actions/line_items/getLineItems";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockLineItemsSearch.mockReset();
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

describe("get_line_items", () => {
  it("uses default properties when config.properties is omitted", async () => {
    mockLineItemsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getLineItems({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(mockLineItemsSearch.mock.calls[0]![0]!.properties).toEqual([
      "name",
      "hs_product_id",
      "quantity",
      "price",
      "amount",
    ]);
  });

  it("accepts comma-separated string for properties", async () => {
    mockLineItemsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getLineItems({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { properties: "name, price" },
      triggerEvent: trigger,
    });
    expect(mockLineItemsSearch.mock.calls[0]![0]!.properties).toEqual([
      "name",
      "price",
    ]);
  });

  it("accepts array for properties", async () => {
    mockLineItemsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getLineItems({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { properties: ["name", "amount"] },
      triggerEvent: trigger,
    });
    expect(mockLineItemsSearch.mock.calls[0]![0]!.properties).toEqual([
      "name",
      "amount",
    ]);
  });

  it("builds an EQ filter when both filterProperty + filterValue are present", async () => {
    mockLineItemsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getLineItems({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        filterProperty: "hs_product_id",
        filterValue: "p-123",
      },
      triggerEvent: trigger,
    });
    expect(mockLineItemsSearch.mock.calls[0]![0]!.filters).toEqual([
      { propertyName: "hs_product_id", operator: "EQ", value: "p-123" },
    ]);
  });

  it("omits filters when only filterProperty is supplied", async () => {
    mockLineItemsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getLineItems({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { filterProperty: "name" },
      triggerEvent: trigger,
    });
    expect(mockLineItemsSearch.mock.calls[0]![0]!.filters).toEqual([]);
  });

  it("returns bounded { lineItems, count, total, nextCursor, hasMore } shape", async () => {
    mockLineItemsSearch.mockResolvedValueOnce({
      total: 250,
      results: [
        { id: "li-1", properties: { name: "Widget" } },
        { id: "li-2", properties: { name: "Gadget" } },
      ],
      paging: { next: { after: "cursor-xyz", link: "https://x" } },
    });
    const result = await getLineItems({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(result.output.lineItems).toHaveLength(2);
    expect(result.output.count).toBe(2);
    expect(result.output.total).toBe(250);
    expect(result.output.nextCursor).toBe("cursor-xyz");
    expect(result.output.hasMore).toBe(true);
  });

  it("does NOT leak paging.next.link in output", async () => {
    mockLineItemsSearch.mockResolvedValueOnce({
      total: 1,
      results: [{ id: "li-1", properties: {} }],
      paging: { next: { after: "c", link: "https://api.hubapi.com/secret" } },
    });
    const result = await getLineItems({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    // link should NOT appear anywhere in the output
    expect(JSON.stringify(result.output)).not.toContain("hubapi.com");
    expect(JSON.stringify(result.output)).not.toContain("link");
  });

  it("returns hasMore=false when paging.next is absent", async () => {
    mockLineItemsSearch.mockResolvedValueOnce({ total: 1, results: [] });
    const result = await getLineItems({
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
      getLineItems({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { limit: 500 },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
    expect(mockLineItemsSearch).not.toHaveBeenCalled();
  });

  it("rejects unknown fields (strict mode)", async () => {
    await expect(
      getLineItems({
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
    mockLineItemsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getLineItems({
      workflowId: "wf",
      userId: "user-xyz",
      accountId: "acct-user-xyz",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    const arg = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(arg.provider).toBe("hubspot");
    expect(arg.userId).toBe("user-xyz");
    expect(arg.accountId).toBe("portal-1");
  });

  it("forwards after cursor when supplied", async () => {
    mockLineItemsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getLineItems({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { after: "cursor-a" },
      triggerEvent: trigger,
    });
    expect(mockLineItemsSearch.mock.calls[0]![0]!.after).toBe("cursor-a");
  });
});
