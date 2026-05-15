/**
 * @jest-environment node
 *
 * Tests for the `checkoutSessionsCreate` wrapper. Verifies wire-format
 * details that only show up at the HTTP boundary: Bearer auth,
 * Stripe-Version, form-encoded Content-Type, Idempotency-Key
 * threading, bracket-notation flattening of nested fields
 * (`line_items[]`, `automatic_tax`, `metadata`), and error mapping.
 */
import { checkoutSessionsCreate } from "@/integrations/stripe/api/checkoutSessions";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
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

function sessionResponse(overrides?: Record<string, unknown>) {
  return {
    id: "cs_test_1",
    object: "checkout.session",
    mode: "payment",
    url: "https://checkout.stripe.com/c/pay/cs_test_1",
    status: "open",
    payment_status: "unpaid",
    customer: null,
    customer_email: null,
    client_reference_id: null,
    payment_intent: null,
    subscription: null,
    amount_total: null,
    currency: null,
    expires_at: 1234567890,
    success_url: "https://example.com/ok",
    cancel_url: "https://example.com/cancel",
    metadata: {},
    livemode: false,
    ...overrides,
  };
}

describe("checkoutSessionsCreate", () => {
  it("POSTs /v1/checkout/sessions with Bearer auth + Stripe-Version", async () => {
    const spy = mockResponse({ ok: true, json: sessionResponse() });
    await checkoutSessionsCreate({
      accessToken: "sk_test_xxx",
      mode: "payment",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/cancel",
      lineItems: [{ price: "price_123", quantity: 1 }],
    });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(init!.method).toBe("POST");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_xxx");
    expect(headers["Stripe-Version"]).toBe("2025-05-28.basil");
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  it("flattens line_items into bracket-notation form encoding", async () => {
    const spy = mockResponse({ ok: true, json: sessionResponse() });
    await checkoutSessionsCreate({
      accessToken: "tok",
      mode: "payment",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/cancel",
      lineItems: [
        { price: "price_aaa", quantity: 2 },
        { price: "price_bbb", quantity: 1 },
      ],
    });
    const body = spy.mock.calls[0]![1]!.body as string;
    const params = new URLSearchParams(body);
    expect(params.get("mode")).toBe("payment");
    expect(params.get("success_url")).toBe("https://example.com/ok");
    expect(params.get("cancel_url")).toBe("https://example.com/cancel");
    expect(params.get("line_items[0][price]")).toBe("price_aaa");
    expect(params.get("line_items[0][quantity]")).toBe("2");
    expect(params.get("line_items[1][price]")).toBe("price_bbb");
    expect(params.get("line_items[1][quantity]")).toBe("1");
  });

  it("flattens automatic_tax.enabled as automatic_tax[enabled]", async () => {
    const spy = mockResponse({ ok: true, json: sessionResponse() });
    await checkoutSessionsCreate({
      accessToken: "tok",
      mode: "payment",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/cancel",
      lineItems: [{ price: "price_123", quantity: 1 }],
      automaticTaxEnabled: true,
    });
    const body = spy.mock.calls[0]![1]!.body as string;
    const params = new URLSearchParams(body);
    expect(params.get("automatic_tax[enabled]")).toBe("true");
  });

  it("flattens metadata as metadata[<key>] entries", async () => {
    const spy = mockResponse({ ok: true, json: sessionResponse() });
    await checkoutSessionsCreate({
      accessToken: "tok",
      mode: "payment",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/cancel",
      lineItems: [{ price: "price_123", quantity: 1 }],
      metadata: { orderId: "order_42", source: "workflow" },
    });
    const body = spy.mock.calls[0]![1]!.body as string;
    const params = new URLSearchParams(body);
    expect(params.get("metadata[orderId]")).toBe("order_42");
    expect(params.get("metadata[source]")).toBe("workflow");
  });

  it("sends Idempotency-Key header when supplied", async () => {
    const spy = mockResponse({ ok: true, json: sessionResponse() });
    await checkoutSessionsCreate({
      accessToken: "tok",
      mode: "payment",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/cancel",
      lineItems: [{ price: "price_123", quantity: 1 }],
      idempotencyKey: "run-1:node-a:stripe_action_create_checkout_session",
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe(
      "run-1:node-a:stripe_action_create_checkout_session",
    );
  });

  it("omits Idempotency-Key when not supplied", async () => {
    const spy = mockResponse({ ok: true, json: sessionResponse() });
    await checkoutSessionsCreate({
      accessToken: "tok",
      mode: "payment",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/cancel",
      lineItems: [{ price: "price_123", quantity: 1 }],
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeUndefined();
  });

  it("sends customer field when supplied", async () => {
    const spy = mockResponse({ ok: true, json: sessionResponse() });
    await checkoutSessionsCreate({
      accessToken: "tok",
      mode: "payment",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/cancel",
      lineItems: [{ price: "price_123", quantity: 1 }],
      customer: "cus_existing",
    });
    const params = new URLSearchParams(
      spy.mock.calls[0]![1]!.body as string,
    );
    expect(params.get("customer")).toBe("cus_existing");
    expect(params.get("customer_email")).toBeNull();
  });

  it("sends customer_email field when supplied (and customer absent)", async () => {
    const spy = mockResponse({ ok: true, json: sessionResponse() });
    await checkoutSessionsCreate({
      accessToken: "tok",
      mode: "payment",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/cancel",
      lineItems: [{ price: "price_123", quantity: 1 }],
      customerEmail: "alice@example.com",
    });
    const params = new URLSearchParams(
      spy.mock.calls[0]![1]!.body as string,
    );
    expect(params.get("customer_email")).toBe("alice@example.com");
    expect(params.get("customer")).toBeNull();
  });

  it("sends client_reference_id and allow_promotion_codes when supplied", async () => {
    const spy = mockResponse({ ok: true, json: sessionResponse() });
    await checkoutSessionsCreate({
      accessToken: "tok",
      mode: "payment",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/cancel",
      lineItems: [{ price: "price_123", quantity: 1 }],
      clientReferenceId: "ref_abc",
      allowPromotionCodes: true,
    });
    const params = new URLSearchParams(
      spy.mock.calls[0]![1]!.body as string,
    );
    expect(params.get("client_reference_id")).toBe("ref_abc");
    expect(params.get("allow_promotion_codes")).toBe("true");
  });

  it("omits line_items from body when undefined (setup mode)", async () => {
    const spy = mockResponse({
      ok: true,
      json: sessionResponse({ mode: "setup" }),
    });
    await checkoutSessionsCreate({
      accessToken: "tok",
      mode: "setup",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/cancel",
    });
    const body = spy.mock.calls[0]![1]!.body as string;
    expect(body).not.toContain("line_items");
    const params = new URLSearchParams(body);
    expect(params.get("mode")).toBe("setup");
  });

  it("supports subscription mode end-to-end", async () => {
    const spy = mockResponse({
      ok: true,
      json: sessionResponse({ mode: "subscription" }),
    });
    const result = await checkoutSessionsCreate({
      accessToken: "tok",
      mode: "subscription",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/cancel",
      lineItems: [{ price: "price_recurring", quantity: 1 }],
    });
    const params = new URLSearchParams(
      spy.mock.calls[0]![1]!.body as string,
    );
    expect(params.get("mode")).toBe("subscription");
    expect(params.get("line_items[0][price]")).toBe("price_recurring");
    expect(result.mode).toBe("subscription");
  });

  it("maps 401 to Unauthorized401Error", async () => {
    mockResponse({ ok: false, status: 401, text: "unauthorized" });
    await expect(
      checkoutSessionsCreate({
        accessToken: "bad",
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ price: "price_123", quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("maps 404 to NotFoundError with resourceForNotFound label", async () => {
    mockResponse({
      ok: false,
      status: 404,
      json: { error: { message: "no such price" } },
    });
    await expect(
      checkoutSessionsCreate({
        accessToken: "tok",
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ price: "price_missing", quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps other non-2xx (e.g. 400) to a tagged generic Error", async () => {
    mockResponse({
      ok: false,
      status: 400,
      json: {
        error: {
          message: "You can't pass line_items in setup mode.",
          code: "parameter_unknown",
        },
      },
    });
    await expect(
      checkoutSessionsCreate({
        accessToken: "tok",
        mode: "setup",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
      }),
    ).rejects.toThrow(/Stripe POST \/v1\/checkout\/sessions failed:/);
  });

  it("respects STRIPE_API_BASE override (e2e mock surface)", async () => {
    process.env.STRIPE_API_BASE = "http://127.0.0.1:9876";
    const spy = mockResponse({ ok: true, json: sessionResponse() });
    await checkoutSessionsCreate({
      accessToken: "tok",
      mode: "payment",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/cancel",
      lineItems: [{ price: "price_123", quantity: 1 }],
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1/checkout/sessions",
    );
  });
});
