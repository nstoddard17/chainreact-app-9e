/**
 * @jest-environment node
 *
 * Slice 4.SHOPIFY-META-2 — Shopify discovery-registry coverage.
 *
 * Pins the full 11-action Shopify surface: all keys registered + sorted by
 * displayOrder, key===provider:type, snake_case field names (mirroring the
 * runtime Zod schemas), camelCase outputs, no secret-shaped outputs, risk
 * classifications (update_order_status is the lone high/destructive/confirm
 * action — the Cancel-operation decision), and sensitive-output markings on
 * customer PII. Trigger assertions live in shopify-triggers-discovery.test.ts.
 */
import {
  getActionMeta,
  listActionMetasForProvider,
  listProvidersWithMetadata,
} from "@/services/discovery/_registry";

const EXPECTED_KEYS_IN_ORDER = [
  "shopify:create_order",
  "shopify:update_order_status",
  "shopify:add_order_note",
  "shopify:create_fulfillment",
  "shopify:create_product",
  "shopify:update_product",
  "shopify:create_product_variant",
  "shopify:update_product_variant",
  "shopify:create_customer",
  "shopify:update_customer",
  "shopify:update_inventory",
];

describe("shopify discovery — surface", () => {
  it("registers exactly 11 action metas in displayOrder", () => {
    const metas = listActionMetasForProvider("shopify");
    expect(metas).toHaveLength(11);
    expect(metas.map((m) => m.key)).toEqual(EXPECTED_KEYS_IN_ORDER);
  });

  it("every key equals provider:type and provider is 'shopify'", () => {
    for (const m of listActionMetasForProvider("shopify")) {
      expect(m.provider).toBe("shopify");
      expect(m.key).toBe(`shopify:${m.type}`);
    }
  });

  it("every action is category 'commerce' + requiresIntegration", () => {
    for (const m of listActionMetasForProvider("shopify")) {
      expect(m.category).toBe("commerce");
      expect(m.requiresIntegration).toBe(true);
    }
  });

  it("displayOrder is strictly ascending (10..110)", () => {
    const orders = listActionMetasForProvider("shopify").map((m) => m.displayOrder);
    expect(orders[0]).toBe(10);
    expect(orders[orders.length - 1]).toBe(110);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]!).toBeGreaterThan(orders[i - 1]!);
    }
  });

  it("shopify is reported by listProvidersWithMetadata", () => {
    expect(listProvidersWithMetadata()).toContain("shopify");
  });

  it("no Shopify action declares FileRef flags (Shopify ships no FileRef surface)", () => {
    for (const m of listActionMetasForProvider("shopify")) {
      expect(m.producesFileRef).toBe(false);
      expect(m.consumesFileRef).toBe(false);
    }
  });
});

describe("shopify discovery — field + output hygiene", () => {
  it("all field names are snake_case (mirror the runtime Zod schemas)", () => {
    for (const m of listActionMetasForProvider("shopify")) {
      for (const f of m.fields) {
        expect(f.name).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });

  it("all output names are camelCase", () => {
    for (const m of listActionMetasForProvider("shopify")) {
      for (const o of m.outputs) {
        expect(o.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });

  it("no secret-shaped output names anywhere", () => {
    const BANNED = [
      "token",
      "accessToken",
      "refreshToken",
      "apiKey",
      "clientSecret",
      "client_secret",
      "secret",
      "webhookSecret",
      "password",
    ];
    for (const m of listActionMetasForProvider("shopify")) {
      const names = m.outputs.map((o) => o.name);
      for (const banned of BANNED) expect(names).not.toContain(banned);
    }
  });

  it("required common fields are marked required; optional fields are not", () => {
    // Spot-check the consent gates + ids that the runtime schemas require.
    expect(
      getActionMeta("shopify:create_order")!.fields.find((f) => f.name === "send_receipt")!
        .required,
    ).toBe(true);
    expect(
      getActionMeta("shopify:create_customer")!.fields.find(
        (f) => f.name === "send_welcome_email",
      )!.required,
    ).toBe(true);
    expect(
      getActionMeta("shopify:create_fulfillment")!.fields.find(
        (f) => f.name === "notify_customer",
      )!.required,
    ).toBe(true);
    expect(
      getActionMeta("shopify:update_inventory")!.fields.find((f) => f.name === "quantity")!
        .required,
    ).toBe(true);
  });

  it("enum fields use static select options matching the runtime schema", () => {
    const adj = getActionMeta("shopify:update_inventory")!.fields.find(
      (f) => f.name === "adjustment_type",
    )!;
    expect(adj.type).toBe("select");
    expect(adj.options!.map((o) => o.value)).toEqual(["set", "add", "subtract"]);

    const wu = getActionMeta("shopify:update_product_variant")!.fields.find(
      (f) => f.name === "weight_unit",
    )!;
    expect(wu.type).toBe("select");
    expect(wu.options!.map((o) => o.value)).toEqual(["g", "kg", "oz", "lb"]);
  });
});

describe("shopify discovery — risk classifications", () => {
  it("update_order_status is high + destructive + requiresConfirmation (Cancel operation)", () => {
    const m = getActionMeta("shopify:update_order_status")!;
    expect(m.riskLevel).toBe("high");
    expect(m.isDestructive).toBe(true);
    expect(m.requiresConfirmation).toBe(true);
    expect(m.riskDescription).toBeDefined();
  });

  it("all other Shopify actions are medium + non-destructive + no confirmation", () => {
    for (const m of listActionMetasForProvider("shopify")) {
      if (m.key === "shopify:update_order_status") continue;
      expect(m.riskLevel).toBe("medium");
      expect(m.isDestructive).toBe(false);
      expect(m.requiresConfirmation).toBe(false);
    }
  });
});

describe("shopify discovery — sensitive outputs (customer PII)", () => {
  it("customer email outputs are marked sensitive", () => {
    for (const key of [
      "shopify:create_order",
      "shopify:create_customer",
      "shopify:update_customer",
    ]) {
      const email = getActionMeta(key)!.outputs.find((o) => o.name === "email")!;
      expect(email.sensitive).toBe(true);
    }
  });

  it("customer name outputs are marked sensitive", () => {
    const m = getActionMeta("shopify:create_customer")!;
    expect(m.outputs.find((o) => o.name === "firstName")!.sensitive).toBe(true);
    expect(m.outputs.find((o) => o.name === "lastName")!.sensitive).toBe(true);
  });

  it("opaque ids / urls / timestamps are NOT marked sensitive", () => {
    const NON_SENSITIVE = new Set([
      "orderId",
      "customerId",
      "productId",
      "variantId",
      "adminUrl",
      "createdAt",
      "updatedAt",
      "success",
    ]);
    for (const m of listActionMetasForProvider("shopify")) {
      for (const o of m.outputs) {
        if (NON_SENSITIVE.has(o.name)) {
          expect(o.sensitive).not.toBe(true);
        }
      }
    }
  });
});
