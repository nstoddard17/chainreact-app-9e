const mockShopifyRequest = jest.fn();

jest.mock("@/integrations/_shared/shopify/api/_request", () => ({
  shopifyRequest: (...args: unknown[]) => mockShopifyRequest(...args),
}));

import {
  productsCreate,
  productsUpdate,
  variantsCreate,
} from "@/integrations/_shared/shopify/api/products";

beforeEach(() => {
  mockShopifyRequest.mockReset();
});

describe("productsCreate", () => {
  it("POSTs /products.json with default-variant nested for price+sku+inventory", async () => {
    mockShopifyRequest.mockResolvedValueOnce({
      product: { id: 1, variants: [{ id: 11 }] },
    });
    await productsCreate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      title: "Hat",
      price: "29.99",
      sku: "HAT-001",
      inventory_quantity: 100,
      vendor: "Acme",
    });
    const body = mockShopifyRequest.mock.calls[0]![0]!.body;
    expect(body.product.title).toBe("Hat");
    expect(body.product.vendor).toBe("Acme");
    expect(body.product.variants).toEqual([
      { price: "29.99", sku: "HAT-001", inventory_quantity: 100 },
    ]);
  });

  it("omits optional product fields when not supplied", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ product: { id: 1 } });
    await productsCreate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      title: "Hat",
      price: "29.99",
    });
    const product = mockShopifyRequest.mock.calls[0]![0]!.body.product;
    expect(product.body_html).toBeUndefined();
    expect(product.vendor).toBeUndefined();
    expect(product.variants).toEqual([{ price: "29.99" }]);
  });
});

describe("productsUpdate", () => {
  it("PUTs /products/{id}.json with id + supplied fields", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ product: { id: 9 } });
    await productsUpdate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      productId: 9,
      title: "Updated",
      tags: "new, sale",
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.body).toEqual({
      product: { id: 9, title: "Updated", tags: "new, sale" },
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.method).toBe("PUT");
  });

  it("maps published=true → status=active and false → draft", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ product: { id: 9 } });
    await productsUpdate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      productId: 9,
      published: true,
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.body.product.status).toBe(
      "active",
    );

    mockShopifyRequest.mockResolvedValueOnce({ product: { id: 9 } });
    await productsUpdate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      productId: 9,
      published: false,
    });
    expect(mockShopifyRequest.mock.calls[1]![0]!.body.product.status).toBe(
      "draft",
    );
  });

  it("omits status when published is undefined", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ product: { id: 9 } });
    await productsUpdate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      productId: 9,
      title: "Updated",
    });
    const product = mockShopifyRequest.mock.calls[0]![0]!.body.product;
    expect(product.status).toBeUndefined();
  });
});

describe("variantsCreate", () => {
  it("POSTs /products/{id}/variants.json with all supplied fields", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ variant: { id: 22 } });
    await variantsCreate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      productId: 9,
      price: "39.99",
      option1: "Large",
      option2: "Red",
      sku: "PROD-LRG-RED",
      inventory_quantity: 50,
      weight: 1.5,
      barcode: "1234567",
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.path).toBe(
      "/products/9/variants.json",
    );
    expect(mockShopifyRequest.mock.calls[0]![0]!.body).toEqual({
      variant: {
        price: "39.99",
        option1: "Large",
        option2: "Red",
        sku: "PROD-LRG-RED",
        inventory_quantity: 50,
        weight: 1.5,
        barcode: "1234567",
      },
    });
  });
});
