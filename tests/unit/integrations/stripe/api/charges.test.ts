/**
 * @jest-environment node
 *
 * Tests for the `chargesList` wrapper. Verifies GET wire-format at
 * the HTTP boundary: Bearer auth, Stripe-Version, no Content-Type
 * (no body), no Idempotency-Key (Stripe rejects it on GET), query
 * params forwarded with Stripe's snake_case wire names, error
 * mapping, STRIPE_API_BASE override.
 */
import { chargesList } from "@/integrations/stripe/api/charges";
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

function chargeResponse(overrides?: Record<string, unknown>) {
  return {
    id: "ch_test_1",
    object: "charge",
    amount: 1000,
    currency: "usd",
    status: "succeeded",
    paid: true,
    refunded: false,
    customer: "cus_1",
    payment_intent: "pi_1",
    created: 1234567890,
    description: null,
    receipt_url: null,
    metadata: {},
    livemode: false,
    ...overrides,
  };
}

function listResponse(charges: Array<Record<string, unknown>>, hasMore = false) {
  return {
    object: "list",
    data: charges,
    has_more: hasMore,
    url: "/v1/charges",
  };
}

describe("chargesList", () => {
  it("GETs /v1/charges with Bearer auth + Stripe-Version", async () => {
    const spy = mockResponse({
      ok: true,
      json: listResponse([chargeResponse()]),
    });
    await chargesList({ accessToken: "sk_test_xxx" });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/charges");
    expect(init!.method).toBe("GET");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_xxx");
    expect(headers["Stripe-Version"]).toBe("2025-05-28.basil");
  });

  it("sends NO body and NO Content-Type for GET (Stripe rejects bodies on list endpoints)", async () => {
    const spy = mockResponse({ ok: true, json: listResponse([]) });
    await chargesList({ accessToken: "tok" });
    const init = spy.mock.calls[0]![1]!;
    expect(init.body).toBeUndefined();
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("sends NO Idempotency-Key on GET (Stripe rejects it on list endpoints)", async () => {
    const spy = mockResponse({ ok: true, json: listResponse([]) });
    await chargesList({ accessToken: "tok" });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeUndefined();
  });

  it("forwards customer filter as ?customer=", async () => {
    const spy = mockResponse({ ok: true, json: listResponse([]) });
    await chargesList({ accessToken: "tok", customer: "cus_test_1" });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.stripe.com/v1/charges?customer=cus_test_1",
    );
  });

  it("forwards limit as ?limit= (numeric stringified)", async () => {
    const spy = mockResponse({ ok: true, json: listResponse([]) });
    await chargesList({ accessToken: "tok", limit: 25 });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.stripe.com/v1/charges?limit=25",
    );
  });

  it("forwards startingAfter as Stripe wire field starting_after", async () => {
    const spy = mockResponse({ ok: true, json: listResponse([]) });
    await chargesList({ accessToken: "tok", startingAfter: "ch_xxx" });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.stripe.com/v1/charges?starting_after=ch_xxx",
    );
  });

  it("forwards endingBefore as Stripe wire field ending_before", async () => {
    const spy = mockResponse({ ok: true, json: listResponse([]) });
    await chargesList({ accessToken: "tok", endingBefore: "ch_yyy" });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.stripe.com/v1/charges?ending_before=ch_yyy",
    );
  });

  it("combines customer + limit + startingAfter into a single query string", async () => {
    const spy = mockResponse({ ok: true, json: listResponse([]) });
    await chargesList({
      accessToken: "tok",
      customer: "cus_1",
      limit: 10,
      startingAfter: "ch_last",
    });
    const url = new URL(spy.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/v1/charges");
    expect(url.searchParams.get("customer")).toBe("cus_1");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("starting_after")).toBe("ch_last");
  });

  it("omits all query params when none supplied (Stripe defaults to limit=10)", async () => {
    const spy = mockResponse({ ok: true, json: listResponse([]) });
    await chargesList({ accessToken: "tok" });
    expect(spy.mock.calls[0]![0]).toBe("https://api.stripe.com/v1/charges");
  });

  it("returns the parsed list response (data + has_more + url)", async () => {
    mockResponse({
      ok: true,
      json: listResponse(
        [chargeResponse({ id: "ch_1" }), chargeResponse({ id: "ch_2" })],
        true,
      ),
    });
    const result = await chargesList({ accessToken: "tok" });
    expect(result.object).toBe("list");
    expect(result.data).toHaveLength(2);
    expect(result.data[0]!.id).toBe("ch_1");
    expect(result.has_more).toBe(true);
  });

  it("maps 401 to Unauthorized401Error", async () => {
    mockResponse({ ok: false, status: 401, text: "unauthorized" });
    await expect(chargesList({ accessToken: "bad" })).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("maps 404 to NotFoundError with the charges (list) label", async () => {
    mockResponse({
      ok: false,
      status: 404,
      json: { error: { message: "not found" } },
    });
    await expect(chargesList({ accessToken: "tok" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("maps other non-2xx (e.g. 400) to a tagged generic Error", async () => {
    mockResponse({
      ok: false,
      status: 400,
      json: {
        error: {
          message: "Invalid starting_after id",
          code: "parameter_invalid",
        },
      },
    });
    await expect(chargesList({ accessToken: "tok" })).rejects.toThrow(
      /Stripe GET \/v1\/charges failed:/,
    );
  });

  it("respects STRIPE_API_BASE override (e2e mock surface)", async () => {
    process.env.STRIPE_API_BASE = "http://127.0.0.1:9876";
    const spy = mockResponse({ ok: true, json: listResponse([]) });
    await chargesList({ accessToken: "tok" });
    expect(spy.mock.calls[0]![0]).toBe("http://127.0.0.1:9876/v1/charges");
  });
});
