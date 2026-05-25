/**
 * @jest-environment node
 *
 * Tests for `shopifyRequest` — the per-shop REST wrapper that drives
 * every Slice 12 Commit 3 action handler. Mocks `fetch` so we don't
 * hit Shopify. Verifies:
 *   - Per-shop URL routing (`https://{shopDomain}/admin/api/2024-10/...`).
 *   - `X-Shopify-Access-Token` header (NOT `Authorization: Bearer`).
 *   - `Content-Type: application/json` for POST / PUT bodies.
 *   - Query-string append on GET / DELETE.
 *   - 401 → `Unauthorized401Error`.
 *   - 404 → `NotFoundError`.
 *   - Other non-2xx → generic Error with `surfaceShopifyError` message.
 */
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { shopifyRequest } from "@/integrations/_shared/shopify/api/_request";
import { NotFoundError } from "@/integrations/_shared/shopify/errors";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOnce(response: {
  ok: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}) {
  const spy = jest.spyOn(globalThis, "fetch");
  const body = response.text !== undefined ? response.text : JSON.stringify(response.json ?? {});
  spy.mockResolvedValueOnce(
    new Response(body, {
      status: response.status ?? (response.ok ? 200 : 500),
    }),
  );
  return spy;
}

describe("shopifyRequest — per-shop URL routing", () => {
  it("routes the request to the supplied shop domain (NOT a static API base)", async () => {
    const spy = mockFetchOnce({ ok: true, json: { order: { id: 1 } } });
    await shopifyRequest({
      shopDomain: "mystore.myshopify.com",
      accessToken: "shpat_x",
      method: "GET",
      path: "/orders.json",
      resourceForNotFound: "order list",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://mystore.myshopify.com/admin/api/2024-10/orders.json",
    );
  });

  it("uses a different host for a different shop (proves no static base)", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    await shopifyRequest({
      shopDomain: "another-shop.myshopify.com",
      accessToken: "shpat_y",
      method: "GET",
      path: "/products.json",
      resourceForNotFound: "products",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://another-shop.myshopify.com/admin/api/2024-10/products.json",
    );
  });

  it("appends query-string params when supplied", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    const query = new URLSearchParams({ status: "open", limit: "50" });
    await shopifyRequest({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      method: "GET",
      path: "/orders.json",
      query,
      resourceForNotFound: "orders",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://s.myshopify.com/admin/api/2024-10/orders.json?status=open&limit=50",
    );
  });
});

describe("shopifyRequest — headers", () => {
  it("sends X-Shopify-Access-Token header (NOT Authorization: Bearer)", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    await shopifyRequest({
      shopDomain: "s.myshopify.com",
      accessToken: "shpat_secret_token",
      method: "GET",
      path: "/shop.json",
      resourceForNotFound: "shop",
    });
    const init = spy.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Shopify-Access-Token"]).toBe("shpat_secret_token");
    expect(headers.Authorization).toBeUndefined();
  });

  it("includes Content-Type: application/json on POST/PUT with body", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    await shopifyRequest({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      method: "POST",
      path: "/orders.json",
      body: { order: { email: "a@example.com" } },
      resourceForNotFound: "order create",
    });
    const init = spy.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(
      JSON.stringify({ order: { email: "a@example.com" } }),
    );
  });

  it("omits Content-Type when no body (GET / DELETE pattern)", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    await shopifyRequest({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      method: "GET",
      path: "/orders/1.json",
      resourceForNotFound: "order 1",
    });
    const init = spy.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it("always sends Accept: application/json (defensive)", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    await shopifyRequest({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      method: "GET",
      path: "/orders.json",
      resourceForNotFound: "orders",
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/json");
  });
});

describe("shopifyRequest — error mapping", () => {
  it("throws Unauthorized401Error on 401 (refreshAndRetry catches this)", async () => {
    mockFetchOnce({ ok: false, status: 401 });
    await expect(
      shopifyRequest({
        shopDomain: "s.myshopify.com",
        accessToken: "tok",
        method: "GET",
        path: "/orders.json",
        resourceForNotFound: "orders",
      }),
    ).rejects.toThrow(Unauthorized401Error);
  });

  it("throws NotFoundError on 404 with surfaced detail", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      json: { errors: "Order not found" },
    });
    await expect(
      shopifyRequest({
        shopDomain: "s.myshopify.com",
        accessToken: "tok",
        method: "GET",
        path: "/orders/9999.json",
        resourceForNotFound: "order 9999",
      }),
    ).rejects.toThrow(NotFoundError);
    mockFetchOnce({
      ok: false,
      status: 404,
      json: { errors: "Order not found" },
    });
    await expect(
      shopifyRequest({
        shopDomain: "s.myshopify.com",
        accessToken: "tok",
        method: "GET",
        path: "/orders/9999.json",
        resourceForNotFound: "order 9999",
      }),
    ).rejects.toThrow(/Order not found/);
  });

  it("throws generic Error on 422 with field-validation surface", async () => {
    mockFetchOnce({
      ok: false,
      status: 422,
      json: { errors: { email: ["is invalid"] } },
    });
    await expect(
      shopifyRequest({
        shopDomain: "s.myshopify.com",
        accessToken: "tok",
        method: "POST",
        path: "/customers.json",
        body: { customer: { email: "not-an-email" } },
        resourceForNotFound: "customer (create)",
      }),
    ).rejects.toThrow(/email: is invalid/);
  });

  it("throws generic Error on 5xx", async () => {
    mockFetchOnce({ ok: false, status: 500, text: "" });
    await expect(
      shopifyRequest({
        shopDomain: "s.myshopify.com",
        accessToken: "tok",
        method: "GET",
        path: "/orders.json",
        resourceForNotFound: "orders",
      }),
    ).rejects.toThrow(/HTTP 500/);
  });
});

describe("shopifyRequest — success", () => {
  it("returns the parsed JSON body verbatim", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: { order: { id: 1234567890, email: "buyer@example.com" } },
    });
    const result = await shopifyRequest<{ order: { id: number; email: string } }>(
      {
        shopDomain: "s.myshopify.com",
        accessToken: "tok",
        method: "GET",
        path: "/orders/1234567890.json",
        resourceForNotFound: "order",
      },
    );
    expect(result.order.id).toBe(1234567890);
    expect(result.order.email).toBe("buyer@example.com");
  });
});
