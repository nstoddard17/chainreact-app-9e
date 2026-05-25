/**
 * @jest-environment node
 *
 * Tests for the `subscriptionsGet` wrapper. Verifies GET wire-format at
 * the HTTP boundary: Bearer auth, Stripe-Version, no Content-Type
 * (no body), no Idempotency-Key (Stripe rejects it on GET), URL
 * encoding of the subscription id, error mapping, STRIPE_API_BASE
 * override.
 *
 * Stripe 2.1 Commit 5 — added alongside `find_subscription` action.
 * Existing wrappers (`subscriptionsCreate` / `subscriptionsUpdate` /
 * `subscriptionsCancel`) are exercised via their action-level tests
 * (Slice 11); this file covers the previously-untested GET retrieve
 * path that the new finder depends on.
 */
import { subscriptionsGet } from "@/integrations/stripe/api/subscriptions";
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

function subscriptionResponse(overrides?: Record<string, unknown>) {
  return {
    id: "sub_test_1",
    object: "subscription",
    customer: "cus_1",
    status: "active",
    current_period_start: 1234567000,
    current_period_end: 1237159000,
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    trial_start: null,
    trial_end: null,
    collection_method: "charge_automatically",
    currency: "usd",
    latest_invoice: "in_test_1",
    livemode: false,
    items: { object: "list", data: [] },
    metadata: {},
    created: 1234567000,
    ...overrides,
  };
}

describe("subscriptionsGet", () => {
  it("GETs /v1/subscriptions/{id} with Bearer auth + Stripe-Version", async () => {
    const spy = mockResponse({ ok: true, json: subscriptionResponse() });
    await subscriptionsGet({
      accessToken: "sk_test_xxx",
      subscriptionId: "sub_test_1",
    });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/subscriptions/sub_test_1");
    expect(init!.method).toBe("GET");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_xxx");
    expect(headers["Stripe-Version"]).toBe("2025-05-28.basil");
  });

  it("URL-encodes the subscriptionId path segment", async () => {
    const spy = mockResponse({ ok: true, json: subscriptionResponse() });
    await subscriptionsGet({
      accessToken: "tok",
      subscriptionId: "sub with space",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.stripe.com/v1/subscriptions/sub%20with%20space",
    );
  });

  it("sends NO body and NO Content-Type for GET", async () => {
    const spy = mockResponse({ ok: true, json: subscriptionResponse() });
    await subscriptionsGet({ accessToken: "tok", subscriptionId: "sub_1" });
    const init = spy.mock.calls[0]![1]!;
    expect(init.body).toBeUndefined();
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("sends NO Idempotency-Key on GET", async () => {
    const spy = mockResponse({ ok: true, json: subscriptionResponse() });
    await subscriptionsGet({ accessToken: "tok", subscriptionId: "sub_1" });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeUndefined();
  });

  it("returns the parsed subscription response", async () => {
    mockResponse({
      ok: true,
      json: subscriptionResponse({
        id: "sub_alpha",
        status: "trialing",
        canceled_at: 1234599000,
      }),
    });
    const result = await subscriptionsGet({
      accessToken: "tok",
      subscriptionId: "sub_alpha",
    });
    expect(result.id).toBe("sub_alpha");
    expect(result.status).toBe("trialing");
    expect(result.canceled_at).toBe(1234599000);
    expect(result.currency).toBe("usd");
    expect(result.latest_invoice).toBe("in_test_1");
    expect(result.livemode).toBe(false);
  });

  it("preserves null values from Stripe's nullable fields", async () => {
    mockResponse({
      ok: true,
      json: subscriptionResponse({
        canceled_at: null,
        trial_start: null,
        trial_end: null,
        latest_invoice: null,
      }),
    });
    const result = await subscriptionsGet({
      accessToken: "tok",
      subscriptionId: "sub_1",
    });
    expect(result.canceled_at).toBeNull();
    expect(result.trial_start).toBeNull();
    expect(result.trial_end).toBeNull();
    expect(result.latest_invoice).toBeNull();
  });

  it("maps 401 to Unauthorized401Error", async () => {
    mockResponse({ ok: false, status: 401, text: "unauthorized" });
    await expect(
      subscriptionsGet({ accessToken: "bad", subscriptionId: "sub_1" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("maps 404 to NotFoundError tagged with subscription id", async () => {
    mockResponse({
      ok: false,
      status: 404,
      json: { error: { message: "No such subscription" } },
    });
    await expect(
      subscriptionsGet({ accessToken: "tok", subscriptionId: "sub_missing" }),
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
      subscriptionsGet({ accessToken: "tok", subscriptionId: "sub_bad" }),
    ).rejects.toThrow(/Stripe GET \/v1\/subscriptions\/sub_bad failed:/);
  });

  it("respects STRIPE_API_BASE override (e2e mock surface)", async () => {
    process.env.STRIPE_API_BASE = "http://127.0.0.1:9876";
    const spy = mockResponse({ ok: true, json: subscriptionResponse() });
    await subscriptionsGet({ accessToken: "tok", subscriptionId: "sub_1" });
    expect(spy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1/subscriptions/sub_1",
    );
  });
});
