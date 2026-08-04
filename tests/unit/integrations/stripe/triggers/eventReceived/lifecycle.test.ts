/**
 * @jest-environment node
 *
 * stripe/triggers/eventReceived trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockCreate = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/integrations/_shared/stripe/api/webhookEndpoints", () => ({
  webhookEndpointsCreate: (...args: unknown[]) => mockCreate(...args),
  webhookEndpointsDelete: (...args: unknown[]) => mockDelete(...args),
}));

import { activate } from "@/integrations/stripe/triggers/eventReceived/activate";
import { STRIPE_ALLOWED_EVENT_TYPES, isAllowedStripeEventType } from "@/integrations/stripe/triggers/eventReceived/allowedEventTypes";
import { deactivate } from "@/integrations/stripe/triggers/eventReceived/deactivate";
import { NotFoundError } from "@/integrations/_shared/stripe/errors";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { findSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import "@/integrations/_registry";
import { normalizeStripeEvent, STRIPE_TRIGGER_EVENT_TYPE, type StripeEvent } from "@/integrations/stripe/triggers/eventReceived/normalize";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

beforeEach(() => {
  mockCreate.mockReset();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.STRIPE_CLIENT_SECRET = "sk_test_platform_secret";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.STRIPE_CLIENT_SECRET;
  delete process.env.STRIPE_WEBHOOK_URL;
});

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "stripe",
  providerAccountId: "acct_test_1",
  displayName: "acct_test_1",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: ["read_write"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseNode = {
  id: "node-trigger-1",
  kind: "trigger" as const,
  provider: "stripe",
  type: "event_received",
  config: {
    enabledEvents: ["payment_intent.succeeded", "charge.refunded"],
  },
  position: { x: 0, y: 0 },
};

function createResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "we_test_1",
    object: "webhook_endpoint",
    url: "https://app.example.test/api/webhooks/stripe?workflowId=unknown&nodeId=node-trigger-1",
    secret: "whsec_signing_xxx",
    enabled_events: ["payment_intent.succeeded", "charge.refunded"],
    status: "enabled",
    livemode: false,
    created: 1700000000,
    api_version: "2025-05-28.basil",
    description: "ChainReact workflow unknown node node-trigger-1",
    ...overrides,
  };
}

describe("Stripe event_received activate", () => {
  it("creates the webhook endpoint and returns the canonical config patch", async () => {
    mockCreate.mockResolvedValueOnce(createResponse());

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      webhookEnabled: true,
      endpointId: "we_test_1",
      endpointSecret: "whsec_signing_xxx",
      enabledEvents: ["payment_intent.succeeded", "charge.refunded"],
      notificationUrl: expect.stringContaining(
        "/api/webhooks/stripe?",
      ),
    });
    // Activation MUST NOT set type: "subscription-watch" — Stripe
    // endpoints don't expire and the runRenewals cron filters on
    // that marker. Setting it would queue Stripe rows for renewal
    // every 10 minutes for nothing.
    expect(result).not.toHaveProperty("type");
  });

  it("sends connect=true and the description threaded with workflow + node ids", async () => {
    mockCreate.mockResolvedValueOnce(createResponse());

    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-XYZ",
    });

    const callArg = mockCreate.mock.calls[0]![0];
    expect(callArg.connect).toBe(true);
    expect(callArg.description).toContain("wf-XYZ");
    expect(callArg.description).toContain("node-trigger-1");
    expect(callArg.url).toContain("workflowId=wf-XYZ");
    expect(callArg.url).toContain("nodeId=node-trigger-1");
  });

  it("uses STRIPE_WEBHOOK_URL override (e2e mock surface)", async () => {
    process.env.STRIPE_WEBHOOK_URL = "http://localhost:9881";
    mockCreate.mockResolvedValueOnce(createResponse());
    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    expect(result.notificationUrl).toMatch(
      /^http:\/\/localhost:9881\/api\/webhooks\/stripe\?/,
    );
  });

  it("threads the platform secret (NOT the merchant access token)", async () => {
    mockCreate.mockResolvedValueOnce(createResponse());
    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });
    const callArg = mockCreate.mock.calls[0]![0];
    // STRIPE_CLIENT_SECRET, not the merchant access token from
    // baseIntegration.accessTokenEncrypted.
    expect(callArg.platformSecret).toBe("sk_test_platform_secret");
  });

  it("rejects when enabledEvents is missing", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: {} },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/enabledEvents is required/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects when enabledEvents is empty array", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { enabledEvents: [] } },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/enabledEvents is required/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects when an event type is outside the allowlist (Q11 fail-loud)", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: {
            enabledEvents: [
              "payment_intent.succeeded",
              "payment_intent.canceled", // not in Slice 11 allowlist
            ],
          },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/payment_intent.canceled.*allowlist/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects when STRIPE_CLIENT_SECRET env is not set", async () => {
    delete process.env.STRIPE_CLIENT_SECRET;
    await expect(
      activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" }),
    ).rejects.toThrow(/STRIPE_CLIENT_SECRET/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("throws when Stripe response omits the signing secret (load-bearing for receive verify)", async () => {
    mockCreate.mockResolvedValueOnce(
      createResponse({ secret: undefined }),
    );
    await expect(
      activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" }),
    ).rejects.toThrow(/missing 'secret'/);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former allowedEventTypes.test.ts
// ---------------------------------------------------------------------------
describe("allowedEventTypes (lifecycle)", () => {

describe("STRIPE_ALLOWED_EVENT_TYPES", () => {
  it("contains the 18 curated event types (Slice 11 baseline + Stripe 2.1 Commit 3 additions)", () => {
    expect(STRIPE_ALLOWED_EVENT_TYPES.length).toBe(18);
    expect([...STRIPE_ALLOWED_EVENT_TYPES].sort()).toEqual([
      "charge.dispute.created",
      "charge.failed",
      "charge.refunded",
      "charge.succeeded",
      "checkout.session.completed",
      "customer.created",
      "customer.deleted",
      "customer.subscription.created",
      "customer.subscription.deleted",
      "customer.subscription.trial_will_end",
      "customer.subscription.updated",
      "customer.updated",
      "invoice.created",
      "invoice.paid",
      "invoice.payment_failed",
      "payment_intent.created",
      "payment_intent.payment_failed",
      "payment_intent.succeeded",
    ]);
  });

  it("includes invoice.created (Stripe 2.1 Commit 3 — pairs with create_invoice action)", () => {
    expect(STRIPE_ALLOWED_EVENT_TYPES).toContain("invoice.created");
  });

  it("includes customer.subscription.trial_will_end (Stripe 2.1 Commit 3 — trial-end workflow trigger)", () => {
    expect(STRIPE_ALLOWED_EVENT_TYPES).toContain(
      "customer.subscription.trial_will_end",
    );
  });

  it("preserves all Slice 11 Batch 1 baseline events", () => {
    // Regression guard — the 16 original events must remain in the
    // allowlist regardless of additive batch updates.
    const sliceBaseline = [
      "payment_intent.succeeded",
      "payment_intent.payment_failed",
      "payment_intent.created",
      "charge.succeeded",
      "charge.failed",
      "charge.refunded",
      "charge.dispute.created",
      "customer.created",
      "customer.updated",
      "customer.deleted",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
      "checkout.session.completed",
    ];
    for (const event of sliceBaseline) {
      expect(STRIPE_ALLOWED_EVENT_TYPES).toContain(event);
    }
  });

  it("has no duplicates", () => {
    const set = new Set(STRIPE_ALLOWED_EVENT_TYPES);
    expect(set.size).toBe(STRIPE_ALLOWED_EVENT_TYPES.length);
  });
});

describe("isAllowedStripeEventType", () => {
  it("returns true for Slice 11 baseline event types", () => {
    expect(isAllowedStripeEventType("payment_intent.succeeded")).toBe(true);
    expect(isAllowedStripeEventType("charge.refunded")).toBe(true);
    expect(isAllowedStripeEventType("checkout.session.completed")).toBe(true);
  });

  it("returns true for Stripe 2.1 Commit 3 additions", () => {
    expect(isAllowedStripeEventType("invoice.created")).toBe(true);
    expect(
      isAllowedStripeEventType("customer.subscription.trial_will_end"),
    ).toBe(true);
  });

  it("returns false for unsupported / out-of-allowlist event types", () => {
    expect(isAllowedStripeEventType("payment_intent.canceled")).toBe(false);
    expect(isAllowedStripeEventType("invoice.finalized")).toBe(false);
    expect(isAllowedStripeEventType("source.created")).toBe(false);
    expect(isAllowedStripeEventType("ping")).toBe(false);
  });

  it("returns false for empty / garbage input", () => {
    expect(isAllowedStripeEventType("")).toBe(false);
    expect(isAllowedStripeEventType("not-a-stripe-event")).toBe(false);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former deactivate.test.ts
// ---------------------------------------------------------------------------
describe("deactivate (lifecycle)", () => {

beforeEach(() => {
  mockDelete.mockReset();
  process.env.STRIPE_CLIENT_SECRET = "sk_test_platform";
});

afterEach(() => {
  delete process.env.STRIPE_CLIENT_SECRET;
});

const integration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "stripe",
  providerAccountId: "acct_test_1",
  displayName: "acct_test_1",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: ["read_write"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

function trigger(config: Record<string, unknown> = {}) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "stripe",
    eventType: "event_received",
    nodeId: "node-1",
    config: {
      webhookEnabled: true,
      endpointId: "we_test_1",
      endpointSecret: "whsec_xxx",
      enabledEvents: ["payment_intent.succeeded"],
      ...config,
    },
    providerAccountId: "acct_test_1",
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("Stripe event_received deactivate", () => {
  it("calls webhookEndpointsDelete with the platform secret + endpoint id", async () => {
    mockDelete.mockResolvedValueOnce({
      id: "we_test_1",
      object: "webhook_endpoint",
      deleted: true,
    });
    await deactivate({ trigger: trigger(), integration });
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete.mock.calls[0]![0]).toEqual({
      platformSecret: "sk_test_platform",
      id: "we_test_1",
    });
  });

  it("swallows NotFoundError (endpoint already gone server-side)", async () => {
    mockDelete.mockRejectedValueOnce(
      new NotFoundError("webhook_endpoint we_test_1"),
    );
    await expect(
      deactivate({ trigger: trigger(), integration }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors (so lifecycle orchestrator can log)", async () => {
    mockDelete.mockRejectedValueOnce(
      new Error("Stripe DELETE /v1/webhook_endpoints/we_test_1 failed: rate_limited"),
    );
    await expect(
      deactivate({ trigger: trigger(), integration }),
    ).rejects.toThrow(/rate_limited/);
  });

  it("skips silently when trigger config has no endpointId (corrupt / partial-activation row)", async () => {
    await deactivate({
      trigger: trigger({ endpointId: undefined }),
      integration,
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("rejects when STRIPE_CLIENT_SECRET env is not set", async () => {
    delete process.env.STRIPE_CLIENT_SECRET;
    await expect(
      deactivate({ trigger: trigger(), integration }),
    ).rejects.toThrow(/STRIPE_CLIENT_SECRET/);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former index.test.ts
// Module-init registration assertion: importing the trigger index
// registers activate + deactivate hooks. NO subscription handler —
// Stripe webhook endpoints don't expire.
// ---------------------------------------------------------------------------
describe("index (lifecycle)", () => {

// Side-effect import — registers via _registry.ts.
describe("Stripe event_received trigger registration", () => {
  it("registers activation hook for ('stripe', 'event_received')", () => {
    expect(findActivation("stripe", "event_received")).not.toBeNull();
  });

  it("registers deactivation hook for ('stripe', 'event_received')", () => {
    expect(findDeactivation("stripe", "event_received")).not.toBeNull();
  });

  it("does NOT register a subscription handler — Stripe webhooks don't expire", () => {
    // Stripe webhook endpoints don't expire, so renewal is a no-op.
    // V2's idiomatic opt-out is to omit the subscription handler
    // AND skip the `config.type === "subscription-watch"` marker on
    // the trigger row. The runRenewals cron only enumerates rows
    // with that marker, so even if a stray subscription handler
    // existed, Stripe rows would be invisible to it.
    //
    // This test guards the registration side: no handler claims a
    // Stripe-shaped trigger row.
    const stripeTrigger = {
      id: "tr-1",
      workflowId: "wf-1",
      workflowAccountId: "acct-1",
      userId: "u",
      provider: "stripe",
      eventType: "event_received",
      nodeId: "n-1",
      config: {
        webhookEnabled: true,
        endpointId: "we_test_1",
        endpointSecret: "whsec",
        enabledEvents: ["payment_intent.succeeded"],
      },
      providerAccountId: null,
      registeredAt: "",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    expect(findSubscriptionHandler(stripeTrigger)).toBeNull();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

function evt(overrides: Partial<StripeEvent> = {}): StripeEvent {
  return {
    id: "evt_test_1",
    object: "event",
    type: "payment_intent.succeeded",
    api_version: "2025-05-28.basil",
    created: 1700000000,
    livemode: false,
    account: "acct_connected_1",
    data: {
      object: { id: "pi_test_1", amount: 2099, currency: "usd" },
    },
    request: { id: "req_test_1", idempotency_key: "ik-1" },
    ...overrides,
  };
}

describe("normalizeStripeEvent", () => {
  it("returns canonical TriggerEvent with provider=stripe and eventType='event_received'", () => {
    const result = normalizeStripeEvent(evt());
    expect(result.provider).toBe("stripe");
    expect(result.eventType).toBe("event_received");
    expect(STRIPE_TRIGGER_EVENT_TYPE).toBe("event_received");
  });

  it("uses event.id as eventId (load-bearing for webhook_event_dedup)", () => {
    const result = normalizeStripeEvent(evt({ id: "evt_unique_xyz" }));
    expect(result.eventId).toBe("evt_unique_xyz");
  });

  it("converts unix-seconds 'created' to ISO-8601 occurredAt", () => {
    const result = normalizeStripeEvent(evt({ created: 1700000000 }));
    expect(result.occurredAt).toBe(new Date(1700000000 * 1000).toISOString());
  });

  it("falls back occurredAt to now when 'created' is missing/non-finite", () => {
    const before = Date.now();
    const result = normalizeStripeEvent(
      evt({ created: NaN as unknown as number }),
    );
    const parsed = Date.parse(result.occurredAt);
    expect(parsed).toBeGreaterThanOrEqual(before);
  });

  it("uses event.account as accountId on Connect events", () => {
    const result = normalizeStripeEvent(evt({ account: "acct_M_xxx" }));
    expect(result.providerAccountId).toBe("acct_M_xxx");
  });

  it("falls back accountId to '<platform>' when event.account is null", () => {
    const result = normalizeStripeEvent(evt({ account: null }));
    expect(result.providerAccountId).toBe("<platform>");
  });

  it("falls back accountId to '<platform>' when event.account is missing", () => {
    const result = normalizeStripeEvent(evt({ account: undefined }));
    expect(result.providerAccountId).toBe("<platform>");
  });

  it("payload.stripeEventType carries the original Stripe type (workflow discriminator)", () => {
    const result = normalizeStripeEvent(
      evt({ type: "customer.subscription.created" }),
    );
    expect(result.payload.stripeEventType).toBe(
      "customer.subscription.created",
    );
  });

  it("payload.data carries the resource snapshot", () => {
    const data = { id: "pi_X", amount: 100, currency: "usd" };
    const result = normalizeStripeEvent(
      evt({ data: { object: data } }),
    );
    expect(result.payload.data).toEqual(data);
  });

  it("payload.previousAttributes carries the diff for *.updated events", () => {
    const result = normalizeStripeEvent(
      evt({
        type: "customer.subscription.updated",
        data: {
          object: { id: "sub_X", status: "active" },
          previous_attributes: { status: "trialing" },
        },
      }),
    );
    expect(result.payload.previousAttributes).toEqual({ status: "trialing" });
  });

  it("payload.created mirrors Stripe's unix-seconds wire value", () => {
    const result = normalizeStripeEvent(evt({ created: 1700000000 }));
    expect(result.payload.created).toBe(1700000000);
  });

  it("payload.livemode echoes the event flag", () => {
    expect(normalizeStripeEvent(evt({ livemode: true })).payload.livemode).toBe(true);
    expect(normalizeStripeEvent(evt({ livemode: false })).payload.livemode).toBe(false);
  });

  it("payload.livemode is null when missing (defensive)", () => {
    const result = normalizeStripeEvent(evt({ livemode: undefined }));
    expect(result.payload.livemode).toBeNull();
  });

  it("payload.apiVersion / payload.account / payload.request are surfaced for debugging", () => {
    const result = normalizeStripeEvent(evt());
    expect(result.payload.apiVersion).toBe("2025-05-28.basil");
    expect(result.payload.account).toBe("acct_connected_1");
    expect(result.payload.request).toEqual({
      id: "req_test_1",
      idempotency_key: "ik-1",
    });
  });

  it("handles missing data.object gracefully (defensive)", () => {
    const result = normalizeStripeEvent(evt({ data: {} }));
    expect(result.payload.data).toBeNull();
  });
});

});
