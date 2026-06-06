/**
 * @jest-environment node
 *
 * Slice 4.BILLING-PLAN-METADATA-3 / CS-2 — platform Stripe client.
 *
 * Proves:
 *   - importing the module does NOT throw / read env (lazy, CI-build-safe);
 *   - using it without STRIPE_SECRET_KEY throws a typed, generic config error;
 *   - with the key present it constructs a client and authenticates requests with the
 *     secret as a Bearer token + pinned Stripe-Version (fetch mocked);
 *   - the secret key is never exposed as a property on the client object;
 *   - non-2xx responses surface the Stripe envelope message (no secret echoed).
 */

import {
  PLATFORM_STRIPE_SECRET_ENV,
  PlatformStripeConfigError,
  getPlatformStripeClient,
  getPlatformStripeSecretKey,
} from "@/services/billing/platformStripeClient";
import { STRIPE_API_VERSION } from "@/integrations/_shared/stripe/api/_base";

const SECRET = "sk_test_platform_secret_123";

/** Minimal shape of the second `fetch` argument we assert on (avoids the DOM `RequestInit` global). */
type FetchInit = { method?: string; headers?: Record<string, string>; body?: string };

const origEnv = { ...process.env };
afterEach(() => {
  process.env = { ...origEnv };
  jest.restoreAllMocks();
});

describe("getPlatformStripeSecretKey — lazy resolution", () => {
  it("module import did not throw (proven by reaching this test)", () => {
    expect(typeof getPlatformStripeClient).toBe("function");
    expect(PLATFORM_STRIPE_SECRET_ENV).toBe("STRIPE_SECRET_KEY");
  });

  it("throws a typed PlatformStripeConfigError when the key is unset", () => {
    delete process.env[PLATFORM_STRIPE_SECRET_ENV];
    expect(() => getPlatformStripeSecretKey()).toThrow(PlatformStripeConfigError);
    expect(() => getPlatformStripeSecretKey()).toThrow(/not set|not configured/i);
  });

  it("throws when the key is blank/whitespace", () => {
    process.env[PLATFORM_STRIPE_SECRET_ENV] = "   ";
    expect(() => getPlatformStripeSecretKey()).toThrow(PlatformStripeConfigError);
  });

  it("returns the trimmed key when present", () => {
    process.env[PLATFORM_STRIPE_SECRET_ENV] = `  ${SECRET}  `;
    expect(getPlatformStripeSecretKey()).toBe(SECRET);
  });

  it("the config error code is stable + carries no env value", () => {
    delete process.env[PLATFORM_STRIPE_SECRET_ENV];
    try {
      getPlatformStripeSecretKey();
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PlatformStripeConfigError);
      expect((e as PlatformStripeConfigError).code).toBe("PLATFORM_STRIPE_NOT_CONFIGURED");
    }
  });
});

describe("getPlatformStripeClient — construction", () => {
  it("throws config error when the key is missing (no client constructed)", () => {
    delete process.env[PLATFORM_STRIPE_SECRET_ENV];
    expect(() => getPlatformStripeClient()).toThrow(PlatformStripeConfigError);
  });

  it("constructs a client when the key is present, exposing apiBase + pinned version", () => {
    process.env[PLATFORM_STRIPE_SECRET_ENV] = SECRET;
    const client = getPlatformStripeClient();
    expect(typeof client.request).toBe("function");
    expect(client.apiVersion).toBe(STRIPE_API_VERSION);
    expect(client.apiBase).toMatch(/stripe\.com|127\.0\.0\.1|localhost/);
  });

  it("does NOT expose the secret key as a property on the client object", () => {
    process.env[PLATFORM_STRIPE_SECRET_ENV] = SECRET;
    const client = getPlatformStripeClient();
    const serialized = JSON.stringify(client);
    expect(serialized).not.toContain(SECRET);
    for (const value of Object.values(client)) {
      expect(value).not.toBe(SECRET);
    }
  });
});

describe("PlatformStripeClient.request — authenticated REST", () => {
  it("sends the secret as a Bearer token + pinned Stripe-Version on GET", async () => {
    process.env[PLATFORM_STRIPE_SECRET_ENV] = SECRET;
    process.env.STRIPE_API_BASE = "http://127.0.0.1:9999";
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "cus_x", object: "customer" }), { status: 200 }),
      );

    const client = getPlatformStripeClient();
    const out = await client.request<{ id: string }>({ method: "GET", path: "/v1/customers/cus_x" });

    expect(out.id).toBe("cus_x");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:9999/v1/customers/cus_x");
    const headers = (init as FetchInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${SECRET}`);
    expect(headers["Stripe-Version"]).toBe(STRIPE_API_VERSION);
    expect((init as FetchInit).method).toBe("GET");
  });

  it("form-encodes a POST body (Stripe bracket notation) with Idempotency-Key", async () => {
    process.env[PLATFORM_STRIPE_SECRET_ENV] = SECRET;
    process.env.STRIPE_API_BASE = "http://127.0.0.1:9999";
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "sub_1" }), { status: 200 }));

    const client = getPlatformStripeClient();
    await client.request({
      method: "POST",
      path: "/v1/subscriptions",
      body: { customer: "cus_x", items: [{ price: "price_pro" }] },
      idempotencyKey: "idem-123",
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as FetchInit).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(headers["Idempotency-Key"]).toBe("idem-123");
    // URLSearchParams percent-encodes the bracket notation — decode to assert shape.
    const decodedBody = decodeURIComponent((init as FetchInit).body as string);
    expect(decodedBody).toContain("items[0][price]=price_pro");
    expect(decodedBody).toContain("customer=cus_x");
  });

  it("surfaces the Stripe error envelope message on non-2xx (no secret in message)", async () => {
    process.env[PLATFORM_STRIPE_SECRET_ENV] = SECRET;
    process.env.STRIPE_API_BASE = "http://127.0.0.1:9999";
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "No such customer" } }), { status: 404 }),
      );

    const client = getPlatformStripeClient();
    await expect(
      client.request({ method: "GET", path: "/v1/customers/cus_missing" }),
    ).rejects.toThrow(/No such customer/);
    await expect(
      client.request({ method: "GET", path: "/v1/customers/cus_missing" }),
    ).rejects.not.toThrow(new RegExp(SECRET));
  });
});
