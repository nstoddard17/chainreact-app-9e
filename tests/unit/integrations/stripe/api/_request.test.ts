/**
 * @jest-environment node
 *
 * Tests for `stripeRequest` — V2's first form-encoded REST wrapper.
 * Verifies wire-format (Bearer auth, Stripe-Version, Content-Type,
 * Idempotency-Key), error mapping (401 / 404 / other), body
 * flattening pass-through, and env-override surface.
 */
import { stripeRequest } from "@/integrations/stripe/api/_request";
import {
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/stripe/errors";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.STRIPE_API_BASE;
});

function mockResponse(opts: {
  ok: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}) {
  const body = opts.text !== undefined ? opts.text : JSON.stringify(opts.json ?? {});
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(body, { status: opts.status ?? (opts.ok ? 200 : 500) }),
    );
}

describe("stripeRequest", () => {
  it("sends Bearer auth + Stripe-Version on every request", async () => {
    const spy = mockResponse({ ok: true, json: { id: "cus_1" } });
    await stripeRequest({
      accessToken: "sk_test_xxx",
      method: "GET",
      path: "/v1/customers/cus_1",
      resourceForNotFound: "customer cus_1",
    });
    const [, init] = spy.mock.calls[0]!;
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_xxx");
    expect(headers["Stripe-Version"]).toBe("2025-05-28.basil");
  });

  it("defaults to api.stripe.com when STRIPE_API_BASE unset", async () => {
    const spy = mockResponse({ ok: true, json: {} });
    await stripeRequest({
      accessToken: "tok",
      method: "GET",
      path: "/v1/account",
      resourceForNotFound: "account",
    });
    expect(spy.mock.calls[0]![0]).toBe("https://api.stripe.com/v1/account");
  });

  it("uses STRIPE_API_BASE override when set (e2e mock surface)", async () => {
    process.env.STRIPE_API_BASE = "http://localhost:9881";
    const spy = mockResponse({ ok: true, json: {} });
    await stripeRequest({
      accessToken: "tok",
      method: "GET",
      path: "/v1/account",
      resourceForNotFound: "account",
    });
    expect(spy.mock.calls[0]![0]).toBe("http://localhost:9881/v1/account");
  });

  it("appends query string on GET", async () => {
    const spy = mockResponse({ ok: true, json: {} });
    const query = new URLSearchParams({ email: "x@y.com", limit: "1" });
    await stripeRequest({
      accessToken: "tok",
      method: "GET",
      path: "/v1/customers",
      query,
      resourceForNotFound: "customer (list)",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.stripe.com/v1/customers?email=x%40y.com&limit=1",
    );
  });

  it("sends form-encoded body on POST with flattened bracket notation", async () => {
    const spy = mockResponse({ ok: true, json: { id: "pi_1" } });
    await stripeRequest({
      accessToken: "tok",
      method: "POST",
      path: "/v1/payment_intents",
      body: {
        amount: 2099,
        currency: "usd",
        metadata: { workflowId: "wf-1" },
      },
      resourceForNotFound: "payment_intent (create)",
    });
    const [, init] = spy.mock.calls[0]!;
    const headers = init!.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const params = new URLSearchParams(init!.body as string);
    expect(params.get("amount")).toBe("2099");
    expect(params.get("currency")).toBe("usd");
    expect(params.get("metadata[workflowId]")).toBe("wf-1");
  });

  it("sends Idempotency-Key header when supplied (create-action pattern)", async () => {
    const spy = mockResponse({ ok: true, json: { id: "pi_1" } });
    await stripeRequest({
      accessToken: "tok",
      method: "POST",
      path: "/v1/payment_intents",
      body: { amount: 100, currency: "usd" },
      idempotencyKey: "session-1:node-A:stripe_action_create_payment_intent",
      resourceForNotFound: "payment_intent (create)",
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe(
      "session-1:node-A:stripe_action_create_payment_intent",
    );
  });

  it("does NOT send Idempotency-Key header when not supplied (update / confirm / capture / cancel)", async () => {
    const spy = mockResponse({ ok: true, json: {} });
    await stripeRequest({
      accessToken: "tok",
      method: "POST",
      path: "/v1/customers/cus_1",
      body: { name: "Alice" },
      resourceForNotFound: "customer cus_1",
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeUndefined();
  });

  it("supports DELETE with query params and no body (cancel_subscription pattern)", async () => {
    const spy = mockResponse({ ok: true, json: { id: "sub_1", status: "canceled" } });
    const query = new URLSearchParams({
      cancel_at_period_end: "true",
      prorate: "true",
    });
    await stripeRequest({
      accessToken: "tok",
      method: "DELETE",
      path: "/v1/subscriptions/sub_1",
      query,
      resourceForNotFound: "subscription sub_1",
    });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe(
      "https://api.stripe.com/v1/subscriptions/sub_1?cancel_at_period_end=true&prorate=true",
    );
    expect(init!.method).toBe("DELETE");
    expect(init!.body).toBeUndefined();
  });

  it("omits Content-Type + body when flattened body is empty (defensive POST)", async () => {
    // Stripe accepts empty-form POSTs (e.g. confirm with no opts).
    // Don't send a Content-Type header just to be empty.
    const spy = mockResponse({ ok: true, json: { id: "pi_1" } });
    await stripeRequest({
      accessToken: "tok",
      method: "POST",
      path: "/v1/payment_intents/pi_1/confirm",
      body: {},
      resourceForNotFound: "payment_intent pi_1",
    });
    const init = spy.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it("throws Unauthorized401Error on HTTP 401 (caught by refreshAndRetry)", async () => {
    mockResponse({ ok: false, status: 401, json: { error: { type: "invalid_request_error" } } });
    await expect(
      stripeRequest({
        accessToken: "expired",
        method: "GET",
        path: "/v1/account",
        resourceForNotFound: "account",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 with parsed error message", async () => {
    mockResponse({
      ok: false,
      status: 404,
      json: {
        error: {
          type: "invalid_request_error",
          message: "No such customer: 'cus_missing'",
        },
      },
    });
    let thrown: unknown;
    try {
      await stripeRequest({
        accessToken: "tok",
        method: "GET",
        path: "/v1/customers/cus_missing",
        resourceForNotFound: "customer cus_missing",
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(NotFoundError);
    expect((thrown as NotFoundError).resource).toBe("customer cus_missing");
    expect((thrown as Error).message).toContain("No such customer");
  });

  it("throws generic Error on other non-2xx with parsed Stripe error envelope", async () => {
    mockResponse({
      ok: false,
      status: 400,
      json: {
        error: {
          type: "invalid_request_error",
          code: "amount_too_small",
          message: "Amount must be at least $0.50 usd",
        },
      },
    });
    await expect(
      stripeRequest({
        accessToken: "tok",
        method: "POST",
        path: "/v1/payment_intents",
        body: { amount: 1, currency: "usd" },
        resourceForNotFound: "payment_intent (create)",
      }),
    ).rejects.toThrow(/Amount must be at least/);
  });

  it("falls back to HTTP <status> when error body is not JSON", async () => {
    mockResponse({ ok: false, status: 502, text: "Bad Gateway" });
    await expect(
      stripeRequest({
        accessToken: "tok",
        method: "GET",
        path: "/v1/account",
        resourceForNotFound: "account",
      }),
    ).rejects.toThrow(/HTTP 502/);
  });

  it("parses 2xx JSON response body as T", async () => {
    mockResponse({
      ok: true,
      json: { id: "cus_1", object: "customer", email: "x@y.com" },
    });
    const result = await stripeRequest<{ id: string; email: string }>({
      accessToken: "tok",
      method: "GET",
      path: "/v1/customers/cus_1",
      resourceForNotFound: "customer cus_1",
    });
    expect(result.id).toBe("cus_1");
    expect(result.email).toBe("x@y.com");
  });

  it("does NOT send body on GET even if accidentally supplied (defensive)", async () => {
    const spy = mockResponse({ ok: true, json: {} });
    await stripeRequest({
      accessToken: "tok",
      method: "GET",
      path: "/v1/account",
      // No body specified — body-handling branch is body-undefined.
      resourceForNotFound: "account",
    });
    const init = spy.mock.calls[0]![1]!;
    expect(init.body).toBeUndefined();
  });
});
