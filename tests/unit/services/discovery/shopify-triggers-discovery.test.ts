/**
 * @jest-environment node
 *
 * Slice 4.SHOPIFY-META-2 — Shopify trigger discovery coverage.
 *
 * Pins the single consolidated `shopify:webhook_received` trigger meta:
 * webhook activation, the topics multi-select over the 8-topic runtime
 * allowlist, and the payload shape (with `body` marked sensitive — it
 * carries the raw customer/order resource). The activation-registry wiring
 * itself is enforced by trigger-meta-activation-invariant.test.ts.
 */
import { getTriggerMeta, listTriggerMetasForProvider } from "@/services/discovery/_registry";
import { SHOPIFY_ALLOWED_TOPICS } from "@/integrations/shopify/triggers/webhookReceived/allowedTopics";

describe("shopify triggers discovery — surface", () => {
  it("registers exactly 1 trigger meta: shopify:webhook_received", () => {
    expect(listTriggerMetasForProvider("shopify").map((t) => t.key)).toEqual([
      "shopify:webhook_received",
    ]);
  });

  it("webhook_received is a webhook-activation, commerce, integration-bound trigger", () => {
    const t = getTriggerMeta("shopify:webhook_received")!;
    expect(t.provider).toBe("shopify");
    expect(t.key).toBe("shopify:webhook_received");
    expect(t.activation).toBe("webhook");
    expect(t.category).toBe("commerce");
    expect(t.requiresIntegration).toBe(true);
  });

  it("topics field is a required multi-select over the runtime 8-topic allowlist", () => {
    const t = getTriggerMeta("shopify:webhook_received")!;
    const topics = t.fields.find((f) => f.name === "topics")!;
    expect(topics.type).toBe("select");
    expect(topics.multiple).toBe(true);
    expect(topics.required).toBe(true);
    const values = topics.options!.map((o) => o.value);
    // Exact set + count parity with the runtime allowlist.
    expect(values).toEqual([...SHOPIFY_ALLOWED_TOPICS]);
    expect(values).toHaveLength(8);
  });

  it("payload shape mirrors normalize.ts: topic / shopDomain / webhookId / body", () => {
    const t = getTriggerMeta("shopify:webhook_received")!;
    expect(t.payloadShape.map((p) => p.name)).toEqual([
      "topic",
      "shopDomain",
      "webhookId",
      "body",
    ]);
  });

  it("the raw resource body is marked sensitive; discriminator scalars are not", () => {
    const t = getTriggerMeta("shopify:webhook_received")!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    expect(byName.get("body")!.sensitive).toBe(true);
    expect(byName.get("body")!.type).toBe("object");
    expect(byName.get("topic")!.sensitive).not.toBe(true);
    expect(byName.get("shopDomain")!.sensitive).not.toBe(true);
    expect(byName.get("webhookId")!.sensitive).not.toBe(true);
  });
});
