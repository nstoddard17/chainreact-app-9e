const mockShopifyRequest = jest.fn();

jest.mock("@/integrations/_shared/shopify/api/_request", () => ({
  shopifyRequest: (...args: unknown[]) => mockShopifyRequest(...args),
}));

import {
  productsCreate,
  productsUpdate,
  variantsCreate,
  variantsUpdate,
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

describe("variantsUpdate (Shopify 2.1 Commit 1)", () => {
  it("PUTs /variants/{variantId}.json with body.variant containing id + supplied fields", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ variant: { id: 22 } });
    await variantsUpdate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      variantId: 22,
      price: "44.99",
      sku: "PROD-V2",
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.method).toBe("PUT");
    expect(mockShopifyRequest.mock.calls[0]![0]!.path).toBe(
      "/variants/22.json",
    );
    expect(mockShopifyRequest.mock.calls[0]![0]!.body).toEqual({
      variant: { id: 22, price: "44.99", sku: "PROD-V2" },
    });
  });

  it("URL-encodes a string variantId", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ variant: { id: 22 } });
    await variantsUpdate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      variantId: "gid with space",
      price: "44.99",
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.path).toBe(
      "/variants/gid%20with%20space.json",
    );
  });

  it("maps every documented optional field to Shopify REST snake_case", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ variant: { id: 22 } });
    await variantsUpdate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      variantId: 22,
      price: "44.99",
      compare_at_price: "59.99",
      sku: "PROD-V2",
      barcode: "1234567",
      option1: "Large",
      option2: "Red",
      option3: "Cotton",
      weight: 1.5,
      weight_unit: "kg",
      taxable: true,
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.body).toEqual({
      variant: {
        id: 22,
        price: "44.99",
        compare_at_price: "59.99",
        sku: "PROD-V2",
        barcode: "1234567",
        option1: "Large",
        option2: "Red",
        option3: "Cotton",
        weight: 1.5,
        weight_unit: "kg",
        taxable: true,
      },
    });
  });

  it("omits optional fields when not supplied (no nulls / no inventory keys ever)", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ variant: { id: 22 } });
    await variantsUpdate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      variantId: 22,
      price: "44.99",
    });
    const variant = mockShopifyRequest.mock.calls[0]![0]!.body.variant;
    // The wrapper must NEVER smuggle inventory keys onto the wire.
    expect(variant.inventory_quantity).toBeUndefined();
    expect(variant.inventory_item_id).toBeUndefined();
    expect(variant.inventory_management).toBeUndefined();
    // Other untouched fields stay off the wire too.
    expect(variant.sku).toBeUndefined();
    expect(variant.barcode).toBeUndefined();
    expect(variant.compare_at_price).toBeUndefined();
    expect(variant.option1).toBeUndefined();
    expect(variant.weight).toBeUndefined();
    expect(variant.weight_unit).toBeUndefined();
    expect(variant.taxable).toBeUndefined();
  });

  it("forwards shopDomain + accessToken to shopifyRequest unchanged", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ variant: { id: 22 } });
    await variantsUpdate({
      shopDomain: "alpha.myshopify.com",
      accessToken: "tok-abc",
      variantId: 22,
      price: "44.99",
    });
    const call = mockShopifyRequest.mock.calls[0]![0]!;
    expect(call.shopDomain).toBe("alpha.myshopify.com");
    expect(call.accessToken).toBe("tok-abc");
    expect(call.resourceForNotFound).toBe("variant 22");
  });

  it("returns the unwrapped variant object", async () => {
    mockShopifyRequest.mockResolvedValueOnce({
      variant: {
        id: 22,
        product_id: 9,
        price: "44.99",
        sku: "PROD-V2",
      },
    });
    const result = await variantsUpdate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      variantId: 22,
      price: "44.99",
    });
    expect(result.id).toBe(22);
    expect(result.product_id).toBe(9);
    expect(result.sku).toBe("PROD-V2");
  });

  it("propagates Shopify error from the request helper", async () => {
    mockShopifyRequest.mockRejectedValueOnce(
      new Error("Shopify PUT /variants/22.json failed: invalid weight_unit"),
    );
    await expect(
      variantsUpdate({
        shopDomain: "s.myshopify.com",
        accessToken: "tok",
        variantId: 22,
        price: "44.99",
      }),
    ).rejects.toThrow(/invalid weight_unit/);
  });
});
