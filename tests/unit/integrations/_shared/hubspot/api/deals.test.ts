/**
 * @jest-environment node
 *
 * Tests for `_shared/hubspot/api/deals.ts`. Mocks `hubspotRequest`.
 */
const mockHubspotRequest = jest.fn();

jest.mock("@/integrations/_shared/hubspot/api/_request", () => ({
  hubspotRequest: (...args: unknown[]) => mockHubspotRequest(...args),
  crmPath: (rest: string) => `/crm/v3/${rest}`,
}));

import {
  dealsArchive,
  dealsCreate,
  dealsGet,
  dealsSearch,
  dealsUpdate,
} from "@/integrations/_shared/hubspot/api/deals";

beforeEach(() => {
  mockHubspotRequest.mockReset();
});

describe("dealsCreate", () => {
  it("POSTs /objects/deals with { properties }", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "d1", properties: {} });
    await dealsCreate({
      accessToken: "tok",
      properties: { dealname: "Acme contract", dealstage: "proposalsent" },
    });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/crm/v3/objects/deals");
  });
});

describe("dealsUpdate", () => {
  it("PATCHes /objects/deals/{id}", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "d1", properties: {} });
    await dealsUpdate({
      accessToken: "tok",
      dealId: "d1",
      properties: { amount: "5000" },
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.method).toBe("PATCH");
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe(
      "/crm/v3/objects/deals/d1",
    );
  });
});

describe("dealsGet", () => {
  it("GETs without query when properties omitted", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "d1", properties: {} });
    await dealsGet({ accessToken: "tok", dealId: "d1" });
    expect(mockHubspotRequest.mock.calls[0]![0]!.query).toBeUndefined();
  });
});

describe("dealsArchive", () => {
  it("DELETEs /objects/deals/{id} with no body and returns void", async () => {
    mockHubspotRequest.mockResolvedValueOnce(undefined);
    const result = await dealsArchive({ accessToken: "tok", dealId: "d-9" });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("DELETE");
    expect(call.path).toBe("/crm/v3/objects/deals/d-9");
    expect(call.body).toBeUndefined();
    expect(call.resourceForNotFound).toBe("deal d-9");
    expect(result).toBeUndefined();
  });
});

describe("dealsSearch", () => {
  it("uses filterGroups", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await dealsSearch({
      accessToken: "tok",
      filters: [
        { propertyName: "dealstage", operator: "EQ", value: "closedwon" },
      ],
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.body.filterGroups).toEqual([
      {
        filters: [
          { propertyName: "dealstage", operator: "EQ", value: "closedwon" },
        ],
      },
    ]);
  });

  it("threads `after` + `properties` when supplied", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await dealsSearch({
      accessToken: "tok",
      after: "cursor-1",
      properties: ["dealname", "amount"],
    });
    const body = mockHubspotRequest.mock.calls[0]![0]!.body;
    expect(body.after).toBe("cursor-1");
    expect(body.properties).toEqual(["dealname", "amount"]);
  });
});
