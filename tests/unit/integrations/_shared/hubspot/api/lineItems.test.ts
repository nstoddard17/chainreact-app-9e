/**
 * @jest-environment node
 *
 * Tests for `_shared/hubspot/api/lineItems.ts`.
 */
const mockHubspotRequest = jest.fn();

jest.mock("@/integrations/_shared/hubspot/api/_request", () => ({
  hubspotRequest: (...args: unknown[]) => mockHubspotRequest(...args),
  crmPath: (rest: string) => `/crm/v3/${rest}`,
}));

import {
  lineItemsCreate,
  lineItemsDelete,
  lineItemsGet,
  lineItemsSearch,
  lineItemsUpdate,
} from "@/integrations/_shared/hubspot/api/lineItems";

beforeEach(() => {
  mockHubspotRequest.mockReset();
});

describe("lineItemsCreate", () => {
  it("POSTs /objects/line_items with { properties }", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "li-1", properties: {} });
    await lineItemsCreate({
      accessToken: "tok",
      properties: { hs_product_id: "p-1", quantity: "2" },
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.method).toBe("POST");
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe(
      "/crm/v3/objects/line_items",
    );
  });
});

describe("lineItemsUpdate", () => {
  it("PATCHes /objects/line_items/{id}", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "li-1", properties: {} });
    await lineItemsUpdate({
      accessToken: "tok",
      lineItemId: "li-1",
      properties: { quantity: "5" },
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.method).toBe("PATCH");
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe(
      "/crm/v3/objects/line_items/li-1",
    );
  });
});

describe("lineItemsDelete (HubSpot 2.1)", () => {
  it("DELETEs /objects/line_items/{id} with no body", async () => {
    mockHubspotRequest.mockResolvedValueOnce(undefined);
    await lineItemsDelete({ accessToken: "tok", lineItemId: "li-9" });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("DELETE");
    expect(call.path).toBe("/crm/v3/objects/line_items/li-9");
    expect(call.body).toBeUndefined();
  });

  it("URL-encodes lineItemId (defensive against non-numeric ids)", async () => {
    mockHubspotRequest.mockResolvedValueOnce(undefined);
    await lineItemsDelete({
      accessToken: "tok",
      lineItemId: "li/with/slashes",
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe(
      "/crm/v3/objects/line_items/li%2Fwith%2Fslashes",
    );
  });

  it("threads the resourceForNotFound tag", async () => {
    mockHubspotRequest.mockResolvedValueOnce(undefined);
    await lineItemsDelete({ accessToken: "tok", lineItemId: "li-42" });
    expect(mockHubspotRequest.mock.calls[0]![0]!.resourceForNotFound).toBe(
      "line item li-42",
    );
  });

  it("propagates 404 NotFoundError from hubspotRequest", async () => {
    mockHubspotRequest.mockRejectedValueOnce(new Error("not found"));
    await expect(
      lineItemsDelete({ accessToken: "tok", lineItemId: "li-x" }),
    ).rejects.toThrow("not found");
  });

  it("returns void on success", async () => {
    mockHubspotRequest.mockResolvedValueOnce(undefined);
    const result = await lineItemsDelete({
      accessToken: "tok",
      lineItemId: "li-1",
    });
    expect(result).toBeUndefined();
  });
});

describe("lineItemsGet", () => {
  it("GETs /objects/line_items/{id} with properties projection", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "li-1", properties: {} });
    await lineItemsGet({
      accessToken: "tok",
      lineItemId: "li-1",
      properties: ["name", "quantity"],
    });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("GET");
    expect(call.path).toBe("/crm/v3/objects/line_items/li-1");
    expect((call.query as URLSearchParams).get("properties")).toBe("name,quantity");
  });

  it("GETs without query when properties omitted", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "li-1", properties: {} });
    await lineItemsGet({ accessToken: "tok", lineItemId: "li-1" });
    expect(mockHubspotRequest.mock.calls[0]![0]!.query).toBeUndefined();
  });
});

describe("lineItemsSearch (HubSpot 2.1)", () => {
  it("POSTs /objects/line_items/search with limit defaulting to 100", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await lineItemsSearch({ accessToken: "tok" });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/crm/v3/objects/line_items/search");
    expect(call.body).toEqual({ limit: 100 });
  });

  it("clamps limit to 100 even when caller asks for more", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await lineItemsSearch({ accessToken: "tok", limit: 500 });
    expect(mockHubspotRequest.mock.calls[0]![0]!.body).toEqual({ limit: 100 });
  });

  it("forwards properties + after cursor when supplied", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await lineItemsSearch({
      accessToken: "tok",
      limit: 25,
      after: "cursor-1",
      properties: ["name", "quantity", "price"],
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.body).toEqual({
      limit: 25,
      after: "cursor-1",
      properties: ["name", "quantity", "price"],
    });
  });

  it("wraps single-group filters under filterGroups[].filters[]", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await lineItemsSearch({
      accessToken: "tok",
      filters: [
        { propertyName: "hs_product_id", operator: "EQ", value: "p-1" },
        { propertyName: "quantity", operator: "GTE", value: "5" },
      ],
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.body).toEqual({
      limit: 100,
      filterGroups: [
        {
          filters: [
            { propertyName: "hs_product_id", operator: "EQ", value: "p-1" },
            { propertyName: "quantity", operator: "GTE", value: "5" },
          ],
        },
      ],
    });
  });

  it("omits filterGroups when filters array is empty", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await lineItemsSearch({ accessToken: "tok", filters: [] });
    expect(mockHubspotRequest.mock.calls[0]![0]!.body).toEqual({ limit: 100 });
  });

  it("returns the response shape verbatim including paging cursor", async () => {
    mockHubspotRequest.mockResolvedValueOnce({
      total: 250,
      results: [
        { id: "li-1", properties: { name: "Widget" } },
        { id: "li-2", properties: { name: "Gadget" } },
      ],
      paging: { next: { after: "cursor-xyz", link: "https://x" } },
    });
    const result = await lineItemsSearch({ accessToken: "tok" });
    expect(result.total).toBe(250);
    expect(result.results).toHaveLength(2);
    expect(result.paging?.next?.after).toBe("cursor-xyz");
  });
});
