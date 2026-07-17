/**
 * RESOLVERS-3 — meta wiring for per-row (`itemFields`) option-source pickers.
 *
 * The gap this closes: `FieldMeta.itemFields` had no `optionsSource` support,
 * so a REQUIRED, Setup-visible provider id inside a structured row had to be
 * hand-typed — while a perfectly good registered resolver sat unreferenced
 * (`quickbooks:items`, `quickbooks:tax_codes` and
 * `microsoft-powerbi:semantic_model_parameters` were referenced by ZERO
 * fields; Stripe made users type `price_xxx` next to `stripe:prices`).
 *
 * Pinned here per wired field:
 *   - the sub-field names a REGISTERED resolver, of the right provider;
 *   - its `dependsOn` covers the resolver's `requiredDeps` AND names real
 *     TOP-LEVEL siblings (row-local deps are not supported);
 *   - `allowManualEntry` is on — the picker is ADDITIVE to `{{...}}` mapping;
 *   - the RUNTIME SCHEMA IS UNTOUCHED: the sub-field's name/type still match
 *     what the .strict() schema expects, and a row built from the meta still
 *     parses. Metadata-only slice — no handler/schema/field-name changes.
 *
 * RESOLVERS-4 update: the one case RESOLVERS-3 deliberately left as text
 * (HubSpot subscriptions[].propertyName) is now wired via the row-local dep
 * scope. Its pin below is updated, not dropped — it still fails if anyone
 * attaches a per-object property resolver, which WOULD be silently wrong for
 * rows watching a different object type.
 */
import type { FieldMeta, ObjectListItemField } from "@/contracts/actionMeta";
import { normalizeDependsOn } from "@/contracts/actionMeta";
import {
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";
import { getOptionsResolver } from "@/services/options/_registry";
import { CreateCheckoutSessionConfigSchema } from "@/integrations/stripe/actions/createCheckoutSession.schema";
import { CreatePaymentLinkConfigSchema } from "@/integrations/stripe/actions/createPaymentLink.schema";
import { CreateInvoiceConfigSchema as QuickbooksCreateInvoiceConfigSchema } from "@/integrations/quickbooks/actions/createInvoice.schema";
import { CreateOrderConfigSchema } from "@/integrations/shopify/actions/createOrder.schema";

function actionMeta(provider: string, key: string) {
  const meta = listActionMetasForProvider(provider).find((m) => m.key === key);
  if (!meta) throw new Error(`missing action meta: ${key}`);
  return meta;
}

function objectListField(meta: { fields: readonly FieldMeta[] }, name: string): FieldMeta {
  const f = meta.fields.find((x) => x.name === name);
  if (!f) throw new Error(`missing field: ${name}`);
  return f;
}

function sub(field: FieldMeta, name: string): ObjectListItemField {
  const s = (field.itemFields ?? []).find((x) => x.name === name);
  if (!s) throw new Error(`missing itemField: ${name}`);
  return s;
}

/** Every field wired by this slice: node key → object-list → sub-field. */
const WIRED: Array<{
  metaKey: string;
  provider: string;
  listField: string;
  subField: string;
  optionsSource: string;
  dependsOn: string[];
  /** The sub-field's declared VALUE type — must not have changed. */
  type: "text" | "number";
  required: boolean;
}> = [
  {
    metaKey: "stripe:create_checkout_session",
    provider: "stripe",
    listField: "lineItems",
    subField: "priceId",
    optionsSource: "stripe:prices",
    dependsOn: [],
    type: "text",
    required: true,
  },
  {
    metaKey: "stripe:create_payment_link",
    provider: "stripe",
    listField: "lineItems",
    subField: "priceId",
    optionsSource: "stripe:prices",
    dependsOn: [],
    type: "text",
    required: true,
  },
  {
    metaKey: "quickbooks:create_invoice",
    provider: "quickbooks",
    listField: "lineItems",
    subField: "itemId",
    optionsSource: "quickbooks:items",
    dependsOn: [],
    type: "text",
    required: true,
  },
  {
    metaKey: "quickbooks:create_invoice",
    provider: "quickbooks",
    listField: "lineItems",
    subField: "taxCodeId",
    optionsSource: "quickbooks:tax_codes",
    dependsOn: [],
    type: "text",
    required: false,
  },
  {
    metaKey: "shopify:create_order",
    provider: "shopify",
    listField: "line_items",
    subField: "variant_id",
    optionsSource: "shopify:variants",
    dependsOn: [],
    type: "number",
    required: true,
  },
  {
    metaKey: "microsoft-powerbi:update_semantic_model_parameters",
    provider: "microsoft-powerbi",
    listField: "parameters",
    subField: "name",
    optionsSource: "microsoft-powerbi:semantic_model_parameters",
    dependsOn: ["workspaceId", "semanticModelId"],
    type: "text",
    required: true,
  },
];

describe.each(WIRED)(
  "RESOLVERS-3 wiring — $metaKey · $listField[].$subField",
  (w) => {
    const meta = actionMeta(w.provider, w.metaKey);
    const field = objectListField(meta, w.listField);
    const itemField = sub(field, w.subField);

    it("binds the expected registered resolver", () => {
      expect(field.type).toBe("object-list");
      expect(itemField.optionsSource).toBe(w.optionsSource);
      const resolver = getOptionsResolver(w.optionsSource);
      expect(resolver).toBeDefined();
      expect(resolver!.provider).toBe(w.provider);
    });

    it("keeps manual entry / variable mapping available (picker is additive)", () => {
      expect(itemField.allowManualEntry).toBe(true);
    });

    it("declares dependsOn covering the resolver's requiredDeps, naming top-level siblings", () => {
      const declared = normalizeDependsOn(itemField.dependsOn);
      expect([...declared]).toEqual(w.dependsOn);
      const required = getOptionsResolver(w.optionsSource)!.requiredDeps ?? [];
      for (const dep of required) expect(declared).toContain(dep);
      // Every dep must be a real TOP-LEVEL field on this node — sub-field deps
      // resolve against the node's top level, never against the row.
      const topLevel = new Set(meta.fields.map((f) => f.name));
      for (const dep of declared) expect(topLevel.has(dep)).toBe(true);
    });

    it("does NOT change the saved shape: sub-field name + value type are unchanged", () => {
      expect(itemField.name).toBe(w.subField);
      expect(itemField.type).toBe(w.type);
      expect(itemField.required).toBe(w.required);
      // `optionsSource` upgrades the WIDGET only — a picker on a `number`
      // sub-field still declares `number`, so the row still commits a number.
      expect(itemField.options).toBeUndefined();
    });
  },
);

describe("RESOLVERS-3 — runtime schemas still accept the picker-produced rows", () => {
  it("stripe create_checkout_session: picked price id round-trips", () => {
    expect(() =>
      CreateCheckoutSessionConfigSchema.parse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/no",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      }),
    ).not.toThrow();
  });

  it("stripe create_payment_link: picked price id round-trips", () => {
    expect(() =>
      CreatePaymentLinkConfigSchema.parse({
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      }),
    ).not.toThrow();
  });

  it("quickbooks create_invoice: picked item + tax code round-trip", () => {
    expect(() =>
      QuickbooksCreateInvoiceConfigSchema.parse({
        customerId: "42",
        lineItems: [{ itemId: "7", amount: 100, taxCodeId: "TAX" }],
      }),
    ).not.toThrow();
  });

  it("shopify create_order: picker commits a NUMBER variant_id, as the schema demands", () => {
    const base = { email: "customer@example.com", send_receipt: false };
    // The number the picker commits.
    expect(() =>
      CreateOrderConfigSchema.parse({
        ...base,
        line_items: [{ variant_id: 44556677, quantity: 1 }],
      }),
    ).not.toThrow();
    // Proof the coercion in the renderer is load-bearing: a STRING id — what a
    // combobox natively hands back — is rejected by the unchanged schema.
    expect(() =>
      CreateOrderConfigSchema.parse({
        ...base,
        line_items: [{ variant_id: "44556677", quantity: 1 }],
      }),
    ).toThrow();
  });
});

/*
 * RESOLVERS-4 — the case RESOLVERS-3 left as text is now WIRED.
 *
 * This block previously pinned the OPPOSITE ("propertyName stays a text
 * sub-field") so nobody would fix it into a silently-wrong picker by attaching
 * one arbitrary per-object resolver. That constraint was real, and the pin is
 * UPDATED rather than deleted: it now asserts the two things that make the
 * picker honest instead of arbitrary —
 *   1. the source is the ROW-DISPATCHING one (not contact_/deal_/… directly);
 *   2. it declares its `eventType` parent in the ROW-LOCAL scope
 *      (`dependsOnRow`), never hoisted to a top-level field that could not
 *      honestly carry a per-row value.
 * Wiring any per-object property resolver here still fails this suite.
 */
describe("RESOLVERS-4 — hubspot subscriptions[].propertyName is a ROW-SCOPED picker", () => {
  const propertyNameSub = () => {
    const meta = listTriggerMetasForProvider("hubspot").find(
      (m) => m.key === "hubspot:webhook_received",
    );
    expect(meta).toBeDefined();
    const subscriptions = meta!.fields.find((f) => f.name === "subscriptions")!;
    return (subscriptions.itemFields ?? []).find(
      (s) => s.name === "propertyName",
    )!;
  };

  it("names the row-dispatching resolver, keyed to the row's OWN eventType", () => {
    const propertyName = propertyNameSub();
    expect(propertyName.optionsSource).toBe("hubspot:subscription_properties");
    // Row-local scope — NOT `dependsOn`. Each row may watch a different object
    // type, so there is no honest top-level field to hoist eventType to.
    expect(propertyName.dependsOnRow).toBe("eventType");
    expect(propertyName.dependsOn).toBeUndefined();
    // The picker is ADDITIVE — a power user can still commit a raw internal
    // name or an upstream {{...}} token.
    expect(propertyName.allowManualEntry).toBe(true);
  });

  it("does NOT wire a per-object resolver (would be silently wrong for other rows)", () => {
    expect([
      "hubspot:contact_properties",
      "hubspot:company_properties",
      "hubspot:deal_properties",
      "hubspot:ticket_properties",
    ]).not.toContain(propertyNameSub().optionsSource);
  });

  it("the resolver is registered, hubspot-provided, and requires the eventType dep", () => {
    const resolver = getOptionsResolver("hubspot:subscription_properties");
    expect(resolver).toBeDefined();
    expect(resolver!.provider).toBe("hubspot");
    expect(resolver!.requiredDeps).toEqual(["eventType"]);
    // The declared row-local parent covers the resolver's requiredDeps.
    expect(normalizeDependsOn(propertyNameSub().dependsOnRow)).toEqual(
      resolver!.requiredDeps,
    );
  });

  it("the runtime contract is untouched: name/type/required + the visibleWhen gate", () => {
    const propertyName = propertyNameSub();
    // `type` is the VALUE type, not a widget — the row still commits the same
    // plain string parseSubscriptions has always read.
    expect(propertyName.type).toBe("text");
    expect(propertyName.required).toBe(true);
    expect(propertyName.visibleWhen).toEqual({
      field: "eventType",
      valueEndsWith: ".propertyChange",
    });
  });
});
