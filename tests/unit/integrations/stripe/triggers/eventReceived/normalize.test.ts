/**
 * @jest-environment node
 */
import {
  normalizeStripeEvent,
  STRIPE_TRIGGER_EVENT_TYPE,
  type StripeEvent,
} from "@/integrations/stripe/triggers/eventReceived/normalize";

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
