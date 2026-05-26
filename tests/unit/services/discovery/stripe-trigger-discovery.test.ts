/**
 * @jest-environment node
 *
 * Slice 4.STRIPE-TRIGGER-META-2 — Stripe trigger discovery coverage.
 * Closes the single launch blocker identified by PROVIDER-AUDIT-1 §2.1.
 *
 * Pins the single `event_received` consolidated webhook trigger: key,
 * webhook activation, the `enabledEvents` combobox+multiple+required
 * config field with 18 static options that EXACTLY match
 * STRIPE_ALLOWED_EVENT_TYPES (drift-proof — direct import), the three
 * failed-payment event options that unblock the canonical Stripe→Slack
 * DM use case, the 8-field payload shape, and the sensitive marks
 * (`data` + `previousAttributes`). Activation-registry side is pinned
 * by tests/structure/trigger-meta-activation-invariant.test.ts.
 */
import {
  getTriggerMeta,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";
import { STRIPE_ALLOWED_EVENT_TYPES } from "@/integrations/stripe/triggers/eventReceived/allowedEventTypes";

describe("stripe trigger discovery — event_received", () => {
  it("registers exactly 1 trigger meta (event_received)", () => {
    const metas = listTriggerMetasForProvider("stripe");
    expect(metas.map((m) => m.key)).toEqual(["stripe:event_received"]);
  });

  it("is a webhook trigger requiring an integration, category commerce", () => {
    const t = getTriggerMeta("stripe:event_received")!;
    expect(t.provider).toBe("stripe");
    expect(t.key).toBe("stripe:event_received");
    expect(t.type).toBe("event_received");
    expect(t.activation).toBe("webhook");
    expect(t.requiresIntegration).toBe(true);
    expect(t.category).toBe("commerce");
  });

  it("exposes exactly ONE config field — `enabledEvents` (verbatim runtime field name)", () => {
    const t = getTriggerMeta("stripe:event_received")!;
    expect(t.fields.map((f) => f.name)).toEqual(["enabledEvents"]);
  });

  it("`enabledEvents` is required combobox + multiple (NOT string-array, NOT eventType/eventTypes)", () => {
    const t = getTriggerMeta("stripe:event_received")!;
    const f = t.fields[0]!;
    expect(f.name).toBe("enabledEvents");
    expect(f.type).toBe("combobox");
    expect(f.multiple).toBe(true);
    expect(f.required).toBe(true);
    // No resolver — static options only.
    expect(f.optionsSource).toBeUndefined();
    expect(f.options).toBeDefined();
  });

  it("`enabledEvents` option values EXACTLY match STRIPE_ALLOWED_EVENT_TYPES (drift guard via direct import)", () => {
    const t = getTriggerMeta("stripe:event_received")!;
    const optionValues = t.fields[0]!.options!.map((o) => o.value);
    expect(optionValues).toEqual([...STRIPE_ALLOWED_EVENT_TYPES]);
    expect(optionValues).toHaveLength(18);
  });

  it("`enabledEvents` option labels are the raw event type strings (Marcus-accepted UX choice)", () => {
    const t = getTriggerMeta("stripe:event_received")!;
    for (const option of t.fields[0]!.options!) {
      expect(option.label).toBe(option.value);
    }
  });

  it("the 3 failed-payment options (+ chargeback) are present with non-empty descriptions", () => {
    const t = getTriggerMeta("stripe:event_received")!;
    const byValue = new Map(t.fields[0]!.options!.map((o) => [o.value, o]));
    for (const value of [
      "payment_intent.payment_failed",
      "charge.failed",
      "invoice.payment_failed",
      "charge.dispute.created",
    ]) {
      const option = byValue.get(value);
      expect(option).toBeDefined();
      expect(option!.description).toBeDefined();
      expect(option!.description!.length).toBeGreaterThan(0);
    }
  });

  it("payload includes the documented 8-field shape", () => {
    const t = getTriggerMeta("stripe:event_received")!;
    const names = t.payloadShape.map((p) => p.name);
    for (const expected of [
      "stripeEventType",
      "data",
      "previousAttributes",
      "created",
      "livemode",
      "account",
      "apiVersion",
      "request",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("`data` + `previousAttributes` payload fields are sensitive (Stripe resource + diff carry financial/PII state)", () => {
    const t = getTriggerMeta("stripe:event_received")!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    expect(byName.get("data")!.sensitive).toBe(true);
    expect(byName.get("previousAttributes")!.sensitive).toBe(true);
  });

  it("stripeEventType / created / livemode / account / apiVersion / request are NOT marked sensitive", () => {
    const t = getTriggerMeta("stripe:event_received")!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    for (const name of [
      "stripeEventType",
      "created",
      "livemode",
      "account",
      "apiVersion",
      "request",
    ]) {
      expect(byName.get(name)!.sensitive).not.toBe(true);
    }
  });

  it("`data` and `previousAttributes` are kept flat (no nested `fields[]`) — avoids SUSPICIOUS_NAMES recursion on customer/paymentIntent/subscription", () => {
    const t = getTriggerMeta("stripe:event_received")!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    expect(byName.get("data")!.fields).toBeUndefined();
    expect(byName.get("previousAttributes")!.fields).toBeUndefined();
  });

  it("no secret-shaped payload names (defense in depth)", () => {
    const BANNED = [
      "token",
      "accessToken",
      "refreshToken",
      "apiKey",
      "clientSecret",
      "secret",
      "webhookSecret",
      "password",
      "endpointSecret",
    ];
    const t = getTriggerMeta("stripe:event_received")!;
    const names = t.payloadShape.map((p) => p.name);
    for (const b of BANNED) expect(names).not.toContain(b);
  });

  it("displayOrder is 10 (only trigger for the provider)", () => {
    const t = getTriggerMeta("stripe:event_received")!;
    expect(t.displayOrder).toBe(10);
  });
});

describe("stripe trigger discovery — sub-registry refactor regression guard", () => {
  it("Stripe is still listed in providers with metadata", () => {
    const metas = listTriggerMetasForProvider("stripe");
    expect(metas.length).toBeGreaterThan(0);
  });
});
