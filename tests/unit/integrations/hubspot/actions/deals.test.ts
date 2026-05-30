/**
 * @jest-environment node
 *
 * Tests for `create_deal`, `update_deal`, `get_deals`.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockDealsCreate = jest.fn();
const mockDealsUpdate = jest.fn();
const mockDealsSearch = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/_shared/hubspot/api/deals", () => ({
  dealsCreate: (...a: unknown[]) => mockDealsCreate(...a),
  dealsUpdate: (...a: unknown[]) => mockDealsUpdate(...a),
  dealsSearch: (...a: unknown[]) => mockDealsSearch(...a),
}));

import { createDeal } from "@/integrations/hubspot/actions/createDeal";
import { updateDeal } from "@/integrations/hubspot/actions/updateDeal";
import { getDeals } from "@/integrations/hubspot/actions/getDeals";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDealsCreate.mockReset();
  mockDealsUpdate.mockReset();
  mockDealsSearch.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const trigger: TriggerEvent = {
  provider: "hubspot",
  eventType: "manual",
  eventId: "e",
  occurredAt: "x",
  providerAccountId: "9876543",
  payload: {},
};

// ─── createDeal ─────────────────────────────────────────────────────────────

describe("create_deal", () => {
  it("rejects missing dealname or dealstage", async () => {
    await expect(
      createDeal({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { dealname: "X" }, // missing dealstage
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();

    await expect(
      createDeal({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { dealstage: "proposalsent" }, // missing dealname
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
  });

  it("POSTs dealsCreate with required + non-empty optional fields", async () => {
    mockDealsCreate.mockResolvedValueOnce({
      id: "d-1",
      properties: {
        dealname: "Acme contract",
        dealstage: "proposalsent",
        amount: "5000",
      },
      createdAt: "x",
      updatedAt: "y",
    });
    await createDeal({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        dealname: "Acme contract",
        dealstage: "proposalsent",
        amount: "5000",
      },
      triggerEvent: trigger,
    });
    expect(mockDealsCreate.mock.calls[0]![0]!.properties).toEqual({
      dealname: "Acme contract",
      dealstage: "proposalsent",
      amount: "5000",
    });
  });

  it("returns canonical output", async () => {
    mockDealsCreate.mockResolvedValueOnce({
      id: "d-1",
      properties: { dealname: "x", dealstage: "s", amount: "1" },
      createdAt: "x",
      updatedAt: "y",
    });
    const result = await createDeal({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { dealname: "x", dealstage: "s" },
      triggerEvent: trigger,
    });
    expect(result.output.dealId).toBe("d-1");
    expect(result.output.dealname).toBe("x");
  });
});

// ─── updateDeal ─────────────────────────────────────────────────────────────

describe("update_deal", () => {
  it("PATCHes dealsUpdate with supplied fields only", async () => {
    mockDealsUpdate.mockResolvedValueOnce({
      id: "d-1",
      properties: { amount: "9999" },
      updatedAt: "y",
    });
    await updateDeal({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { dealId: "d-1", amount: "9999" },
      triggerEvent: trigger,
    });
    expect(mockDealsUpdate.mock.calls[0]![0]!).toMatchObject({
      dealId: "d-1",
      properties: { amount: "9999" },
    });
    expect(
      mockDealsUpdate.mock.calls[0]![0]!.properties.description,
    ).toBeUndefined();
  });

  it("throws when no property fields are provided", async () => {
    await expect(
      updateDeal({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { dealId: "d-1" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow(/at least one property/);
  });
});

// ─── getDeals ───────────────────────────────────────────────────────────────

describe("get_deals", () => {
  it("uses default properties (dealname, amount, dealstage, pipeline, closedate)", async () => {
    mockDealsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getDeals({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(mockDealsSearch.mock.calls[0]![0]!.properties).toEqual([
      "dealname",
      "amount",
      "dealstage",
      "pipeline",
      "closedate",
    ]);
  });

  it("returns deals + paging shape", async () => {
    mockDealsSearch.mockResolvedValueOnce({
      total: 7,
      results: [
        { id: "d1", properties: {} },
        { id: "d2", properties: {} },
      ],
    });
    const r = await getDeals({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(r.output.deals).toHaveLength(2);
    expect(r.output.total).toBe(7);
    expect(r.output.hasMore).toBe(false);
  });
});
