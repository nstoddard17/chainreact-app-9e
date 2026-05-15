/**
 * @jest-environment node
 *
 * Tests for the `invoicesCreate` wrapper. Verifies wire-format
 * details that only show up at the HTTP boundary: Bearer auth,
 * Stripe-Version, form-encoded Content-Type, Idempotency-Key
 * threading, bracket-notation flattening of `metadata`, optional
 * field omission, STRIPE_API_BASE override, and error mapping.
 */
import { invoicesCreate } from "@/integrations/stripe/api/invoices";
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

function invoiceResponse(overrides?: Record<string, unknown>) {
  return {
    id: "in_test_1",
    object: "invoice",
    customer: "cus_test_1",
    subscription: null,
    status: "draft",
    collection_method: "charge_automatically",
    auto_advance: true,
    hosted_invoice_url: null,
    invoice_pdf: null,
    amount_due: 0,
    amount_paid: 0,
    currency: "usd",
    description: null,
    metadata: {},
    livemode: false,
    ...overrides,
  };
}

describe("invoicesCreate", () => {
  it("POSTs /v1/invoices with Bearer auth + Stripe-Version", async () => {
    const spy = mockResponse({ ok: true, json: invoiceResponse() });
    await invoicesCreate({
      accessToken: "sk_test_xxx",
      customer: "cus_test_1",
    });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/invoices");
    expect(init!.method).toBe("POST");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_xxx");
    expect(headers["Stripe-Version"]).toBe("2025-05-28.basil");
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  it("sends the customer field as the Stripe wire field 'customer'", async () => {
    const spy = mockResponse({ ok: true, json: invoiceResponse() });
    await invoicesCreate({
      accessToken: "tok",
      customer: "cus_test_xyz",
    });
    const params = new URLSearchParams(
      spy.mock.calls[0]![1]!.body as string,
    );
    expect(params.get("customer")).toBe("cus_test_xyz");
  });

  it("flattens metadata as metadata[<key>] entries", async () => {
    const spy = mockResponse({ ok: true, json: invoiceResponse() });
    await invoicesCreate({
      accessToken: "tok",
      customer: "cus_test_1",
      metadata: { orderId: "order_42", source: "workflow" },
    });
    const params = new URLSearchParams(
      spy.mock.calls[0]![1]!.body as string,
    );
    expect(params.get("metadata[orderId]")).toBe("order_42");
    expect(params.get("metadata[source]")).toBe("workflow");
  });

  it("sends description and auto_advance when supplied", async () => {
    const spy = mockResponse({ ok: true, json: invoiceResponse() });
    await invoicesCreate({
      accessToken: "tok",
      customer: "cus_test_1",
      description: "Monthly retainer — May",
      autoAdvance: false,
    });
    const params = new URLSearchParams(
      spy.mock.calls[0]![1]!.body as string,
    );
    expect(params.get("description")).toBe("Monthly retainer — May");
    expect(params.get("auto_advance")).toBe("false");
  });

  it("omits description / metadata / auto_advance when undefined", async () => {
    const spy = mockResponse({ ok: true, json: invoiceResponse() });
    await invoicesCreate({
      accessToken: "tok",
      customer: "cus_test_1",
    });
    const body = spy.mock.calls[0]![1]!.body as string;
    expect(body).not.toContain("description");
    expect(body).not.toContain("metadata");
    expect(body).not.toContain("auto_advance");
    expect(body).toContain("customer=cus_test_1");
  });

  it("sends Idempotency-Key header when supplied", async () => {
    const spy = mockResponse({ ok: true, json: invoiceResponse() });
    await invoicesCreate({
      accessToken: "tok",
      customer: "cus_test_1",
      idempotencyKey: "run-1:node-a:stripe_action_create_invoice",
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe(
      "run-1:node-a:stripe_action_create_invoice",
    );
  });

  it("omits Idempotency-Key when not supplied", async () => {
    const spy = mockResponse({ ok: true, json: invoiceResponse() });
    await invoicesCreate({
      accessToken: "tok",
      customer: "cus_test_1",
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeUndefined();
  });

  it("returns the parsed Stripe invoice response", async () => {
    mockResponse({
      ok: true,
      json: invoiceResponse({
        id: "in_xyz",
        status: "open",
        amount_due: 4999,
      }),
    });
    const result = await invoicesCreate({
      accessToken: "tok",
      customer: "cus_test_1",
    });
    expect(result.id).toBe("in_xyz");
    expect(result.status).toBe("open");
    expect(result.amount_due).toBe(4999);
  });

  it("maps 401 to Unauthorized401Error", async () => {
    mockResponse({ ok: false, status: 401, text: "unauthorized" });
    await expect(
      invoicesCreate({ accessToken: "bad", customer: "cus_test_1" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("maps 404 to NotFoundError with the invoice (create) label", async () => {
    mockResponse({
      ok: false,
      status: 404,
      json: { error: { message: "no such customer" } },
    });
    await expect(
      invoicesCreate({ accessToken: "tok", customer: "cus_missing" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps other non-2xx (e.g. 400 missing-required-field) to a tagged generic Error", async () => {
    mockResponse({
      ok: false,
      status: 400,
      json: {
        error: {
          message: "customer is required",
          code: "parameter_missing",
        },
      },
    });
    await expect(
      invoicesCreate({ accessToken: "tok", customer: "cus_test_1" }),
    ).rejects.toThrow(/Stripe POST \/v1\/invoices failed:/);
  });

  it("respects STRIPE_API_BASE override (e2e mock surface)", async () => {
    process.env.STRIPE_API_BASE = "http://127.0.0.1:9876";
    const spy = mockResponse({ ok: true, json: invoiceResponse() });
    await invoicesCreate({
      accessToken: "tok",
      customer: "cus_test_1",
    });
    expect(spy.mock.calls[0]![0]).toBe("http://127.0.0.1:9876/v1/invoices");
  });
});
