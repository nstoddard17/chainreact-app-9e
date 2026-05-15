/**
 * @jest-environment node
 *
 * Tests for the `paymentLinksCreate` wrapper. Verifies wire-format
 * details that only show up at the HTTP boundary: Bearer auth,
 * Stripe-Version, form-encoded Content-Type, Idempotency-Key
 * threading, bracket-notation flattening of nested fields
 * (`line_items[]`, `after_completion.redirect.url`, `metadata`),
 * STRIPE_API_BASE override, and error mapping.
 */
import { paymentLinksCreate } from "@/integrations/stripe/api/paymentLinks";
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

function paymentLinkResponse(overrides?: Record<string, unknown>) {
  return {
    id: "plink_test_1",
    object: "payment_link",
    active: true,
    url: "https://buy.stripe.com/test_xxx",
    currency: "usd",
    metadata: {},
    livemode: false,
    ...overrides,
  };
}

describe("paymentLinksCreate", () => {
  it("POSTs /v1/payment_links with Bearer auth + Stripe-Version", async () => {
    const spy = mockResponse({ ok: true, json: paymentLinkResponse() });
    await paymentLinksCreate({
      accessToken: "sk_test_xxx",
      lineItems: [{ price: "price_123", quantity: 1 }],
    });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/payment_links");
    expect(init!.method).toBe("POST");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_xxx");
    expect(headers["Stripe-Version"]).toBe("2025-05-28.basil");
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  it("flattens line_items into bracket-notation form encoding", async () => {
    const spy = mockResponse({ ok: true, json: paymentLinkResponse() });
    await paymentLinksCreate({
      accessToken: "tok",
      lineItems: [
        { price: "price_aaa", quantity: 2 },
        { price: "price_bbb", quantity: 1 },
      ],
    });
    const body = spy.mock.calls[0]![1]!.body as string;
    const params = new URLSearchParams(body);
    expect(params.get("line_items[0][price]")).toBe("price_aaa");
    expect(params.get("line_items[0][quantity]")).toBe("2");
    expect(params.get("line_items[1][price]")).toBe("price_bbb");
    expect(params.get("line_items[1][quantity]")).toBe("1");
  });

  it("flattens metadata as metadata[<key>] entries", async () => {
    const spy = mockResponse({ ok: true, json: paymentLinkResponse() });
    await paymentLinksCreate({
      accessToken: "tok",
      lineItems: [{ price: "price_123", quantity: 1 }],
      metadata: { orderId: "order_42", source: "workflow" },
    });
    const body = spy.mock.calls[0]![1]!.body as string;
    const params = new URLSearchParams(body);
    expect(params.get("metadata[orderId]")).toBe("order_42");
    expect(params.get("metadata[source]")).toBe("workflow");
  });

  it("flattens allow_promotion_codes when supplied", async () => {
    const spy = mockResponse({ ok: true, json: paymentLinkResponse() });
    await paymentLinksCreate({
      accessToken: "tok",
      lineItems: [{ price: "price_123", quantity: 1 }],
      allowPromotionCodes: true,
    });
    const params = new URLSearchParams(
      spy.mock.calls[0]![1]!.body as string,
    );
    expect(params.get("allow_promotion_codes")).toBe("true");
  });

  it("flattens afterCompletion redirect variant into nested after_completion[type]+after_completion[redirect][url]", async () => {
    const spy = mockResponse({ ok: true, json: paymentLinkResponse() });
    await paymentLinksCreate({
      accessToken: "tok",
      lineItems: [{ price: "price_123", quantity: 1 }],
      afterCompletion: {
        type: "redirect",
        redirectUrl: "https://example.com/thanks",
      },
    });
    const params = new URLSearchParams(
      spy.mock.calls[0]![1]!.body as string,
    );
    expect(params.get("after_completion[type]")).toBe("redirect");
    expect(params.get("after_completion[redirect][url]")).toBe(
      "https://example.com/thanks",
    );
  });

  it("flattens afterCompletion hosted_confirmation variant into after_completion[type] only", async () => {
    const spy = mockResponse({ ok: true, json: paymentLinkResponse() });
    await paymentLinksCreate({
      accessToken: "tok",
      lineItems: [{ price: "price_123", quantity: 1 }],
      afterCompletion: { type: "hosted_confirmation" },
    });
    const body = spy.mock.calls[0]![1]!.body as string;
    const params = new URLSearchParams(body);
    expect(params.get("after_completion[type]")).toBe("hosted_confirmation");
    expect(body).not.toContain("after_completion[redirect]");
  });

  it("sends Idempotency-Key header when supplied", async () => {
    const spy = mockResponse({ ok: true, json: paymentLinkResponse() });
    await paymentLinksCreate({
      accessToken: "tok",
      lineItems: [{ price: "price_123", quantity: 1 }],
      idempotencyKey: "run-1:node-a:stripe_action_create_payment_link",
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe(
      "run-1:node-a:stripe_action_create_payment_link",
    );
  });

  it("omits Idempotency-Key when not supplied", async () => {
    const spy = mockResponse({ ok: true, json: paymentLinkResponse() });
    await paymentLinksCreate({
      accessToken: "tok",
      lineItems: [{ price: "price_123", quantity: 1 }],
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeUndefined();
  });

  it("omits afterCompletion + allow_promotion_codes + metadata when undefined", async () => {
    const spy = mockResponse({ ok: true, json: paymentLinkResponse() });
    await paymentLinksCreate({
      accessToken: "tok",
      lineItems: [{ price: "price_123", quantity: 1 }],
    });
    const body = spy.mock.calls[0]![1]!.body as string;
    expect(body).not.toContain("after_completion");
    expect(body).not.toContain("allow_promotion_codes");
    expect(body).not.toContain("metadata");
  });

  it("maps 401 to Unauthorized401Error", async () => {
    mockResponse({ ok: false, status: 401, text: "unauthorized" });
    await expect(
      paymentLinksCreate({
        accessToken: "bad",
        lineItems: [{ price: "price_123", quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("maps 404 to NotFoundError with the payment_link (create) label", async () => {
    mockResponse({
      ok: false,
      status: 404,
      json: { error: { message: "no such price" } },
    });
    await expect(
      paymentLinksCreate({
        accessToken: "tok",
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
          message: "line_items[0][price] must be set",
          code: "parameter_missing",
        },
      },
    });
    await expect(
      paymentLinksCreate({
        accessToken: "tok",
        lineItems: [{ price: "price_123", quantity: 1 }],
      }),
    ).rejects.toThrow(/Stripe POST \/v1\/payment_links failed:/);
  });

  it("respects STRIPE_API_BASE override (e2e mock surface)", async () => {
    process.env.STRIPE_API_BASE = "http://127.0.0.1:9876";
    const spy = mockResponse({ ok: true, json: paymentLinkResponse() });
    await paymentLinksCreate({
      accessToken: "tok",
      lineItems: [{ price: "price_123", quantity: 1 }],
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1/payment_links",
    );
  });
});
