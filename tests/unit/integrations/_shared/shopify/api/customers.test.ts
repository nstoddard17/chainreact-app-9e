const mockShopifyRequest = jest.fn();

jest.mock("@/integrations/_shared/shopify/api/_request", () => ({
  shopifyRequest: (...args: unknown[]) => mockShopifyRequest(...args),
}));

import {
  customersCreate,
  customersUpdate,
} from "@/integrations/_shared/shopify/api/customers";

beforeEach(() => {
  mockShopifyRequest.mockReset();
});

describe("customersCreate", () => {
  it("POSTs /customers.json with send_email_welcome (Q11 gate at wire layer)", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ customer: { id: 1 } });
    await customersCreate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      email: "alice@example.com",
      send_email_welcome: false,
      first_name: "Alice",
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.body).toEqual({
      customer: {
        email: "alice@example.com",
        send_email_welcome: false,
        first_name: "Alice",
      },
    });
  });

  it("propagates the boolean value through to the wire field (no silent flip)", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ customer: { id: 1 } });
    await customersCreate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      email: "alice@example.com",
      send_email_welcome: true,
    });
    expect(
      mockShopifyRequest.mock.calls[0]![0]!.body.customer.send_email_welcome,
    ).toBe(true);
  });
});

describe("customersUpdate", () => {
  it("PUTs /customers/{id}.json with id and supplied fields", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ customer: { id: 5 } });
    await customersUpdate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      customerId: 5,
      email: "new@example.com",
      accepts_marketing: true,
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.body).toEqual({
      customer: { id: 5, email: "new@example.com", accepts_marketing: true },
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.method).toBe("PUT");
  });

  it("omits unsupplied optional fields", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ customer: { id: 5 } });
    await customersUpdate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      customerId: 5,
      note: "VIP",
    });
    const customer = mockShopifyRequest.mock.calls[0]![0]!.body.customer;
    expect(customer.note).toBe("VIP");
    expect(customer.email).toBeUndefined();
    expect(customer.first_name).toBeUndefined();
  });
});
