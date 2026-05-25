/**
 * @jest-environment node
 *
 * Tests for the Stripe webhook endpoint API wrappers (create + delete).
 * These wrappers use the platform secret directly via stripeRequest;
 * no refreshAndRetry is involved.
 */
import {
  webhookEndpointsCreate,
  webhookEndpointsDelete,
} from "@/integrations/_shared/stripe/api/webhookEndpoints";

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

describe("webhookEndpointsCreate", () => {
  it("POSTs /v1/webhook_endpoints with platform secret as Bearer + connect=true", async () => {
    const spy = mockResponse({
      ok: true,
      json: {
        id: "we_test_1",
        object: "webhook_endpoint",
        url: "https://app.example.test/api/webhooks/stripe?workflowId=wf-1&nodeId=n-1",
        secret: "whsec_test_signing",
        enabled_events: ["payment_intent.succeeded"],
        status: "enabled",
        livemode: false,
        created: 1700000000,
        api_version: "2025-05-28.basil",
        description: "ChainReact workflow wf-1 node n-1",
      },
    });

    const result = await webhookEndpointsCreate({
      platformSecret: "sk_test_platform",
      url: "https://app.example.test/api/webhooks/stripe?workflowId=wf-1&nodeId=n-1",
      enabled_events: ["payment_intent.succeeded"],
      connect: true,
      description: "ChainReact workflow wf-1 node n-1",
    });

    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/webhook_endpoints");
    expect(init!.method).toBe("POST");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_platform");
    expect(headers["Stripe-Version"]).toBe("2025-05-28.basil");
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const params = new URLSearchParams(init!.body as string);
    expect(params.get("url")).toBe(
      "https://app.example.test/api/webhooks/stripe?workflowId=wf-1&nodeId=n-1",
    );
    expect(params.get("enabled_events[0]")).toBe("payment_intent.succeeded");
    expect(params.get("connect")).toBe("true");
    expect(params.get("description")).toBe("ChainReact workflow wf-1 node n-1");
    expect(params.get("api_version")).toBe("2025-05-28.basil");

    expect(result.id).toBe("we_test_1");
    expect(result.secret).toBe("whsec_test_signing");
  });

  it("flattens enabled_events as bracket-notation array", async () => {
    const spy = mockResponse({
      ok: true,
      json: {
        id: "we_test_2",
        object: "webhook_endpoint",
        url: "x",
        enabled_events: [],
        status: "enabled",
        livemode: false,
        created: 1,
        api_version: null,
        description: null,
        secret: "whsec_xxx",
      },
    });

    await webhookEndpointsCreate({
      platformSecret: "sk_test",
      url: "https://app.example.test/api/webhooks/stripe",
      enabled_events: ["a", "b", "c"],
      connect: true,
    });

    const params = new URLSearchParams(
      spy.mock.calls[0]![1]!.body as string,
    );
    expect(params.get("enabled_events[0]")).toBe("a");
    expect(params.get("enabled_events[1]")).toBe("b");
    expect(params.get("enabled_events[2]")).toBe("c");
  });

  it("omits connect field when not supplied (defensive — caller controls)", async () => {
    const spy = mockResponse({
      ok: true,
      json: {
        id: "we",
        object: "webhook_endpoint",
        url: "x",
        enabled_events: [],
        status: "enabled",
        livemode: false,
        created: 1,
        api_version: null,
        description: null,
        secret: "whsec",
      },
    });
    await webhookEndpointsCreate({
      platformSecret: "sk",
      url: "https://app.example.test/api/webhooks/stripe",
      enabled_events: ["a"],
    });
    const params = new URLSearchParams(
      spy.mock.calls[0]![1]!.body as string,
    );
    expect(params.get("connect")).toBeNull();
  });

  it("propagates HTTP errors via surfaceStripeError", async () => {
    mockResponse({
      ok: false,
      status: 400,
      json: {
        error: {
          type: "invalid_request_error",
          message: "Invalid URL",
          param: "url",
        },
      },
    });
    await expect(
      webhookEndpointsCreate({
        platformSecret: "sk",
        url: "not-a-url",
        enabled_events: ["a"],
        connect: true,
      }),
    ).rejects.toThrow(/Invalid URL/);
  });
});

describe("webhookEndpointsDelete", () => {
  it("DELETEs /v1/webhook_endpoints/{id} with platform secret as Bearer", async () => {
    const spy = mockResponse({
      ok: true,
      json: { id: "we_test_1", object: "webhook_endpoint", deleted: true },
    });
    const result = await webhookEndpointsDelete({
      platformSecret: "sk_test_platform",
      id: "we_test_1",
    });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/webhook_endpoints/we_test_1");
    expect(init!.method).toBe("DELETE");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_platform");
    expect(result.id).toBe("we_test_1");
    expect(result.deleted).toBe(true);
  });

  it("URL-encodes the endpoint id (defensive)", async () => {
    const spy = mockResponse({
      ok: true,
      json: { id: "we_strange/id", object: "webhook_endpoint", deleted: true },
    });
    await webhookEndpointsDelete({
      platformSecret: "sk",
      id: "we_strange/id",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.stripe.com/v1/webhook_endpoints/we_strange%2Fid",
    );
  });

  it("throws NotFoundError on 404 (caller swallows in deactivate)", async () => {
    mockResponse({
      ok: false,
      status: 404,
      json: {
        error: {
          type: "invalid_request_error",
          message: "No such webhook endpoint: 'we_missing'",
        },
      },
    });
    await expect(
      webhookEndpointsDelete({
        platformSecret: "sk",
        id: "we_missing",
      }),
    ).rejects.toThrow(/No such webhook endpoint/);
  });
});
