/**
 * @jest-environment node
 *
 * Tests for the `paymentIntentsGet` wrapper. Verifies GET wire-format at
 * the HTTP boundary: Bearer auth, Stripe-Version, no Content-Type
 * (no body), no Idempotency-Key (Stripe rejects it on GET), URL
 * encoding of the payment intent id, error mapping, STRIPE_API_BASE
 * override.
 *
 * Stripe 2.1 Commit 5 — added alongside `find_payment_intent` action.
 * Existing wrappers (`paymentIntentsCreate` / `paymentIntentsConfirm` /
 * `paymentIntentsCapture`) are exercised via their action-level tests
 * (Slice 11); this file covers the new GET retrieve path.
 */
import { paymentIntentsGet } from "@/integrations/stripe/api/paymentIntents";
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
  const body =
    opts.text !== undefined ? opts.text : JSON.stringify(opts.json ?? {});
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(body, { status: opts.status ?? (opts.ok ? 200 : 500) }),
    );
}

function paymentIntentResponse(overrides?: Record<string, unknown>) {
  return {
    id: "pi_test_1",
    object: "payment_intent",
    amount: 2099,
    amount_received: 0,
    currency: "usd",
    status: "requires_payment_method",
    customer: "cus_1",
    description: null,
    client_secret: "pi_test_1_secret_xxx",
    created: 1234567000,
    metadata: {},
    next_action: null,
    latest_charge: null,
    payment_method: null,
    payment_method_types: ["card"],
    receipt_email: null,
    livemode: false,
    ...overrides,
  };
}

describe("paymentIntentsGet", () => {
  it("GETs /v1/payment_intents/{id} with Bearer auth + Stripe-Version", async () => {
    const spy = mockResponse({ ok: true, json: paymentIntentResponse() });
    await paymentIntentsGet({
      accessToken: "sk_test_xxx",
      paymentIntentId: "pi_test_1",
    });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/payment_intents/pi_test_1");
    expect(init!.method).toBe("GET");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_xxx");
    expect(headers["Stripe-Version"]).toBe("2025-05-28.basil");
  });

  it("URL-encodes the paymentIntentId path segment", async () => {
    const spy = mockResponse({ ok: true, json: paymentIntentResponse() });
    await paymentIntentsGet({
      accessToken: "tok",
      paymentIntentId: "pi with space",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.stripe.com/v1/payment_intents/pi%20with%20space",
    );
  });

  it("sends NO body and NO Content-Type for GET", async () => {
    const spy = mockResponse({ ok: true, json: paymentIntentResponse() });
    await paymentIntentsGet({ accessToken: "tok", paymentIntentId: "pi_1" });
    const init = spy.mock.calls[0]![1]!;
    expect(init.body).toBeUndefined();
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("sends NO Idempotency-Key on GET", async () => {
    const spy = mockResponse({ ok: true, json: paymentIntentResponse() });
    await paymentIntentsGet({ accessToken: "tok", paymentIntentId: "pi_1" });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeUndefined();
  });

  it("returns the parsed payment intent response", async () => {
    mockResponse({
      ok: true,
      json: paymentIntentResponse({
        id: "pi_alpha",
        status: "succeeded",
        amount_received: 2099,
        latest_charge: "ch_alpha",
        payment_method: "pm_alpha",
      }),
    });
    const result = await paymentIntentsGet({
      accessToken: "tok",
      paymentIntentId: "pi_alpha",
    });
    expect(result.id).toBe("pi_alpha");
    expect(result.status).toBe("succeeded");
    expect(result.amount_received).toBe(2099);
    expect(result.latest_charge).toBe("ch_alpha");
    expect(result.payment_method).toBe("pm_alpha");
    expect(result.livemode).toBe(false);
  });

  it("preserves null values from Stripe's nullable fields", async () => {
    mockResponse({
      ok: true,
      json: paymentIntentResponse({
        customer: null,
        latest_charge: null,
        payment_method: null,
        description: null,
        receipt_email: null,
      }),
    });
    const result = await paymentIntentsGet({
      accessToken: "tok",
      paymentIntentId: "pi_1",
    });
    expect(result.customer).toBeNull();
    expect(result.latest_charge).toBeNull();
    expect(result.payment_method).toBeNull();
    expect(result.description).toBeNull();
    expect(result.receipt_email).toBeNull();
  });

  it("maps 401 to Unauthorized401Error", async () => {
    mockResponse({ ok: false, status: 401, text: "unauthorized" });
    await expect(
      paymentIntentsGet({ accessToken: "bad", paymentIntentId: "pi_1" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("maps 404 to NotFoundError tagged with payment intent id", async () => {
    mockResponse({
      ok: false,
      status: 404,
      json: { error: { message: "No such payment_intent" } },
    });
    await expect(
      paymentIntentsGet({
        accessToken: "tok",
        paymentIntentId: "pi_missing",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps other non-2xx (e.g. 400) to a tagged generic Error", async () => {
    mockResponse({
      ok: false,
      status: 400,
      json: {
        error: { message: "Invalid id", code: "parameter_invalid" },
      },
    });
    await expect(
      paymentIntentsGet({ accessToken: "tok", paymentIntentId: "pi_bad" }),
    ).rejects.toThrow(/Stripe GET \/v1\/payment_intents\/pi_bad failed:/);
  });

  it("respects STRIPE_API_BASE override (e2e mock surface)", async () => {
    process.env.STRIPE_API_BASE = "http://127.0.0.1:9876";
    const spy = mockResponse({ ok: true, json: paymentIntentResponse() });
    await paymentIntentsGet({ accessToken: "tok", paymentIntentId: "pi_1" });
    expect(spy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1/payment_intents/pi_1",
    );
  });
});
