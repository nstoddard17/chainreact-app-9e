/**
 * @jest-environment node
 *
 * Tests for `_shared/hubspot/api/products.ts`.
 */
const mockHubspotRequest = jest.fn();

jest.mock("@/integrations/_shared/hubspot/api/_request", () => ({
  hubspotRequest: (...args: unknown[]) => mockHubspotRequest(...args),
  crmPath: (rest: string) => `/crm/v3/${rest}`,
}));

import {
  productsCreate,
  productsSearch,
  productsUpdate,
} from "@/integrations/_shared/hubspot/api/products";

beforeEach(() => {
  mockHubspotRequest.mockReset();
});

describe("productsCreate", () => {
  it("POSTs /objects/products with { properties }", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "p-1", properties: {} });
    await productsCreate({
      accessToken: "tok",
      properties: { name: "Widget", price: "99.99" },
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.method).toBe("POST");
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe(
      "/crm/v3/objects/products",
    );
    expect(mockHubspotRequest.mock.calls[0]![0]!.body).toEqual({
      properties: { name: "Widget", price: "99.99" },
    });
  });
});

describe("productsUpdate", () => {
  it("PATCHes /objects/products/{id}", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "p-1", properties: {} });
    await productsUpdate({
      accessToken: "tok",
      productId: "p-1",
      properties: { price: "129.99" },
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.method).toBe("PATCH");
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe(
      "/crm/v3/objects/products/p-1",
    );
  });
});

describe("productsSearch (HubSpot 2.1)", () => {
  it("POSTs /objects/products/search with limit defaulting to 100", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await productsSearch({ accessToken: "tok" });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/crm/v3/objects/products/search");
    expect(call.body).toEqual({ limit: 100 });
  });

  it("clamps limit to 100 even when caller asks for more", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await productsSearch({ accessToken: "tok", limit: 500 });
    expect(mockHubspotRequest.mock.calls[0]![0]!.body).toEqual({ limit: 100 });
  });

  it("forwards properties + after cursor when supplied", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await productsSearch({
      accessToken: "tok",
      limit: 25,
      after: "cursor-7",
      properties: ["name", "price", "description"],
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.body).toEqual({
      limit: 25,
      after: "cursor-7",
      properties: ["name", "price", "description"],
    });
  });

  it("wraps single-group filters under filterGroups[].filters[]", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await productsSearch({
      accessToken: "tok",
      filters: [
        { propertyName: "name", operator: "CONTAINS_TOKEN", value: "Widget" },
      ],
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.body).toEqual({
      limit: 100,
      filterGroups: [
        {
          filters: [
            {
              propertyName: "name",
              operator: "CONTAINS_TOKEN",
              value: "Widget",
            },
          ],
        },
      ],
    });
  });

  it("omits filterGroups when filters array is empty", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await productsSearch({ accessToken: "tok", filters: [] });
    expect(mockHubspotRequest.mock.calls[0]![0]!.body).toEqual({ limit: 100 });
  });

  it("returns the response shape verbatim including paging cursor", async () => {
    mockHubspotRequest.mockResolvedValueOnce({
      total: 12,
      results: [
        { id: "p-1", properties: { name: "Widget" } },
        { id: "p-2", properties: { name: "Gadget" } },
      ],
      paging: { next: { after: "cursor-z", link: "https://x" } },
    });
    const result = await productsSearch({ accessToken: "tok" });
    expect(result.total).toBe(12);
    expect(result.results).toHaveLength(2);
    expect(result.paging?.next?.after).toBe("cursor-z");
  });
});
