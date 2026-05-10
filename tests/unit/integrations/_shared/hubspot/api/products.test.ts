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
