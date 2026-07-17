/**
 * @jest-environment node
 *
 * Tests for the RESOLVERS-2 read-only Shopify list wrappers:
 *   - `_shared/shopify/api/orders.ts`     → ordersList
 *   - `_shared/shopify/api/products.ts`   → productVariantsList
 *   - `_shared/shopify/api/locations.ts`  → locationsList
 * plus the `_request.ts` 403 → InsufficientScopeError mapping they rely on.
 *
 * These wrappers ARE the privacy boundary: they normalize Shopify's raw
 * rows down to a fixed key set, so a customer email / phone / street
 * address physically cannot reach a resolver, an option label, or the
 * browser. That's what most of these tests pin.
 */
import { ordersList } from "@/integrations/_shared/shopify/api/orders";
import { productVariantsList } from "@/integrations/_shared/shopify/api/products";
import { locationsList } from "@/integrations/_shared/shopify/api/locations";
import {
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";

const auth = { shopDomain: "acme.myshopify.com", accessToken: "shpat-tok" };

const mockFetch = jest.fn();
beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}
function status(code: number, body = "{}") {
  return { ok: false, status: code, json: async () => ({}), text: async () => body };
}

/** The single URL the wrapper fetched. */
function fetchedUrl(): string {
  return String(mockFetch.mock.calls[0][0]);
}

describe("ordersList", () => {
  it("requests one bounded page: status=any, limit=50, most-recent-first, closed field list", async () => {
    mockFetch.mockResolvedValueOnce(ok({ orders: [] }));
    await ordersList(auth);
    const url = fetchedUrl();
    expect(url).toContain("/admin/api/2024-10/orders.json");
    expect(url).toContain("status=any");
    expect(url).toContain("limit=50");
    expect(url).toContain("order=created_at+desc");
    expect(decodeURIComponent(url)).toContain(
      "fields=id,name,order_number,total_price,currency,financial_status,created_at,customer",
    );
    // Auth via Shopify's custom header, not Bearer.
    expect(mockFetch.mock.calls[0][1].headers["X-Shopify-Access-Token"]).toBe(
      "shpat-tok",
    );
  });

  it("keeps only the customer's NAME — email / phone / address never leave the wrapper", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        orders: [
          {
            id: 1,
            name: "#1001",
            order_number: 1001,
            total_price: "84.20",
            currency: "USD",
            financial_status: "paid",
            created_at: "2026-07-10T00:00:00Z",
            customer: {
              first_name: "Jane",
              last_name: "Smith",
              email: "jane@example.com",
              phone: "+15551234567",
            },
            shipping_address: { address1: "1 Main St", zip: "11201" },
          },
        ],
      }),
    );
    const result = await ordersList(auth);
    expect(result.orders[0]).toEqual({
      id: 1,
      name: "#1001",
      orderNumber: 1001,
      customerName: "Jane Smith",
      totalPrice: "84.20",
      currency: "USD",
      financialStatus: "paid",
      createdAt: "2026-07-10T00:00:00Z",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /jane@example\.com|5551234567|Main St|11201/,
    );
  });

  it("sorts the page most-recent-first regardless of the order Shopify returned", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        orders: [
          { id: 1, name: "#1001", created_at: "2026-07-10T00:00:00Z" },
          { id: 3, name: "#1003", created_at: "2026-07-12T00:00:00Z" },
          { id: 2, name: "#1002", created_at: "2026-07-11T00:00:00Z" },
        ],
      }),
    );
    const result = await ordersList(auth);
    expect(result.orders.map((o) => o.id)).toEqual([3, 2, 1]);
    expect(result.truncated).toBe(false);
  });

  it("skips malformed rows and reports truncated on a full page", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        orders: [
          { name: "#no-id" },
          ...Array.from({ length: 50 }, (_, i) => ({
            id: i + 1,
            created_at: "2026-07-10T00:00:00Z",
          })),
        ],
      }),
    );
    const result = await ordersList(auth);
    expect(result.orders).toHaveLength(50);
    expect(result.truncated).toBe(true);
  });
});

describe("productVariantsList", () => {
  it("requests products with variants inline (no shop-wide /variants.json exists)", async () => {
    mockFetch.mockResolvedValueOnce(ok({ products: [] }));
    await productVariantsList(auth);
    const url = fetchedUrl();
    expect(url).toContain("/admin/api/2024-10/products.json");
    expect(url).toContain("limit=100");
    expect(decodeURIComponent(url)).toContain("fields=id,title,variants");
  });

  it("flattens variants with their product title, keeping only label-relevant keys", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        products: [
          {
            id: 10,
            title: "Acme Tee",
            variants: [
              {
                id: 100,
                title: "Small / Blue",
                sku: "ABC-1",
                price: "19.00",
                // Dropped by the wrapper.
                inventory_quantity: 42,
                inventory_item_id: 999,
                barcode: "0123456789",
              },
              { id: 101, title: "Large / Blue", sku: null, price: "21.00" },
            ],
          },
          { id: 11, title: "No Variants" },
        ],
      }),
    );
    const result = await productVariantsList(auth);
    expect(result.variants).toEqual([
      {
        id: 100,
        productTitle: "Acme Tee",
        variantTitle: "Small / Blue",
        sku: "ABC-1",
        price: "19.00",
      },
      {
        id: 101,
        productTitle: "Acme Tee",
        variantTitle: "Large / Blue",
        sku: "",
        price: "21.00",
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/inventory|barcode|0123456789/);
    expect(result.truncated).toBe(false);
  });

  it("reports truncated when a full PRODUCT page came back", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        products: Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          title: `P${i}`,
          variants: [{ id: 1000 + i, title: "Default Title", price: "1.00" }],
        })),
      }),
    );
    const result = await productVariantsList(auth);
    expect(result.variants).toHaveLength(100);
    expect(result.truncated).toBe(true);
  });
});

describe("locationsList", () => {
  it("keeps name + city + province code only — street address / zip / phone are dropped", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        locations: [
          {
            id: 905684977,
            name: "Warehouse",
            city: "Brooklyn",
            province: "New York",
            province_code: "NY",
            active: true,
            address1: "1 Main St",
            zip: "11201",
            phone: "+15551234567",
          },
        ],
      }),
    );
    const result = await locationsList(auth);
    expect(result.locations).toEqual([
      {
        id: 905684977,
        name: "Warehouse",
        city: "Brooklyn",
        provinceCode: "NY",
        active: true,
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/Main St|11201|5551234567/);
    expect(fetchedUrl()).toContain("/admin/api/2024-10/locations.json");
  });

  it("falls back to the full province name when Shopify omits the code; defaults active", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ locations: [{ id: 1, name: "Annex", province: "Ontario" }] }),
    );
    const result = await locationsList(auth);
    expect(result.locations[0]).toEqual({
      id: 1,
      name: "Annex",
      city: "",
      provinceCode: "Ontario",
      active: true,
    });
  });

  it("throws InsufficientScopeError on 403 (token predates read_locations) without echoing Shopify's body", async () => {
    mockFetch.mockResolvedValueOnce(
      status(
        403,
        JSON.stringify({
          errors:
            "[API] This action requires merchant approval for read_locations scope.",
        }),
      ),
    );
    const err: unknown = await locationsList(auth).catch((e) => e);
    expect(err).toBeInstanceOf(InsufficientScopeError);
    expect((err as InsufficientScopeError).provider).toBe("shopify");
    expect((err as Error).message).not.toMatch(/merchant approval|shpat-tok/);
  });

  it("still throws Unauthorized401Error on 401 (refresh path unchanged)", async () => {
    mockFetch.mockResolvedValueOnce(status(401));
    await expect(locationsList(auth)).rejects.toBeInstanceOf(Unauthorized401Error);
  });
});
