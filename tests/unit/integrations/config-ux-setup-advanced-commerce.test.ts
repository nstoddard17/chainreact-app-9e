/** @jest-environment node */
/**
 * Config-UX Setup/Advanced sweep — Group C (commerce):
 * mailchimp · stripe · quickbooks · shopify.
 *
 * Metadata-only changes, pinned here:
 *   - json → `object` fixed-key editors for VERIFIED flat `.strict()`
 *     runtime shapes (mailchimp create_audience contact +
 *     campaign_defaults on the NORMAL path; shopify create_order
 *     addresses + stripe checkout automaticTax staying Advanced).
 *     Each pin proves `itemFields` keys == runtime schema keys and
 *     that an editor-shaped object round-trips the runtime schema.
 *   - `visibleWhen` mode-scoping that mirrors runtime discriminated
 *     unions / superRefines (stripe checkout lineItems, shopify
 *     update_order_status, mailchimp create_segment,
 *     stripe update_subscription.days_until_due, mailchimp
 *     get_subscribers.sortDir).
 *   - Q11 explicit choices for money-moving hidden defaults
 *     (stripe create_invoice.autoAdvance, cancel_subscription
 *     .at_period_end) — required, NO defaultValue.
 *   - Pagination/cursor plumbing + power-user knobs demoted to the
 *     Advanced tab.
 *   - Closed-enum free text → static multi-select (mailchimp
 *     audience_event.eventTypes over the activation allowlist).
 *
 * Runtime schemas / handlers are untouched — every pin that matters
 * cross-checks the meta against the runtime Zod schema directly.
 */
import { ActionMetaSchema, type ActionMeta, type FieldMeta } from "@/contracts/actionMeta";
import { TriggerMetaSchema } from "@/contracts/triggerMeta";
import {
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";
import { CreateAudienceConfigSchema } from "@/integrations/mailchimp/actions/createAudience.schema";
import { CreateSegmentConfigSchema } from "@/integrations/mailchimp/actions/createSegment.schema";
import { GetSubscribersConfigSchema } from "@/integrations/mailchimp/actions/getSubscribers.schema";
import { MAILCHIMP_ALLOWED_EVENT_TYPES } from "@/integrations/mailchimp/triggers/audienceEvent/allowedEventTypes";
import { CreateCheckoutSessionConfigSchema } from "@/integrations/stripe/actions/createCheckoutSession.schema";
import { CreateInvoiceConfigSchema } from "@/integrations/stripe/actions/createInvoice.schema";
import { CancelSubscriptionConfigSchema } from "@/integrations/stripe/actions/cancelSubscription.schema";
import { UpdateSubscriptionConfigSchema } from "@/integrations/stripe/actions/updateSubscription.schema";
import { CreatePaymentIntentConfigSchema } from "@/integrations/stripe/actions/createPaymentIntent.schema";
import { CreateOrderConfigSchema } from "@/integrations/shopify/actions/createOrder.schema";
import { UpdateOrderStatusConfigSchema } from "@/integrations/shopify/actions/updateOrderStatus.schema";

function meta(provider: string, key: string): ActionMeta {
  const m = listActionMetasForProvider(provider).find((x) => x.key === key);
  if (!m) throw new Error(`meta not found: ${key}`);
  return m;
}
function field(m: ActionMeta, name: string): FieldMeta {
  const f = m.fields.find((x) => x.name === name);
  if (!f) throw new Error(`field not found: ${m.key}.${name}`);
  return f;
}

// ─── mailchimp:create_audience — required JSON escapes the Advanced tab ────

describe("mailchimp:create_audience — contact + campaign_defaults are `object` editors on the NORMAL path", () => {
  const m = meta("mailchimp", "mailchimp:create_audience");

  it("contact: object editor, NOT advanced, itemFields keys == runtime ContactSchema keys (required per schema)", () => {
    const contact = field(m, "contact");
    expect(contact.type).toBe("object");
    expect(contact.required).toBe(true);
    // Required compliance field must live in Setup, not Advanced.
    expect(contact.advanced).toBeFalsy();
    expect(contact.jsonShape).toBeUndefined();
    expect(contact.itemFields?.map((s) => s.name)).toEqual([
      "company",
      "address1",
      "address2",
      "city",
      "state",
      "zip",
      "country",
      "phone",
    ]);
    const requiredKeys = (contact.itemFields ?? [])
      .filter((s) => s.required)
      .map((s) => s.name);
    // Mirrors ContactSchema: address2 + phone optional, rest required.
    expect(requiredKeys).toEqual([
      "company",
      "address1",
      "city",
      "state",
      "zip",
      "country",
    ]);
    for (const s of contact.itemFields ?? []) expect(s.type).toBe("text");
  });

  it("campaign_defaults: object editor, NOT advanced, itemFields keys == runtime CampaignDefaultsSchema keys", () => {
    const cd = field(m, "campaign_defaults");
    expect(cd.type).toBe("object");
    expect(cd.required).toBe(true);
    expect(cd.advanced).toBeFalsy();
    expect(cd.jsonShape).toBeUndefined();
    expect(cd.itemFields?.map((s) => s.name)).toEqual([
      "from_name",
      "from_email",
      "subject",
      "language",
    ]);
    expect(
      (cd.itemFields ?? []).filter((s) => s.required).map((s) => s.name),
    ).toEqual(["from_name", "from_email"]);
  });

  it("an editor-shaped saved object round-trips the runtime schema unchanged", () => {
    // Exactly what ObjectField commits: Record<string,string>, empty
    // optional keys omitted.
    const config = {
      name: "Acme Newsletter",
      permission_reminder: "You signed up at acme.com",
      email_type_option: false,
      contact: {
        company: "Acme",
        address1: "123 Main St",
        city: "SF",
        state: "CA",
        zip: "94102",
        country: "US",
      },
      campaign_defaults: {
        from_name: "Acme Team",
        from_email: "newsletter@acme.com",
      },
    };
    const parsed = CreateAudienceConfigSchema.parse(config);
    expect(parsed.contact).toEqual(config.contact);
    expect(parsed.campaign_defaults).toEqual(config.campaign_defaults);
  });

  it("niche audience toggles moved to Advanced (optional only — nothing required hides there)", () => {
    for (const name of [
      "use_archive_bar",
      "marketing_permissions",
      "double_optin",
      "notify_on_subscribe",
      "notify_on_unsubscribe",
    ]) {
      const f = field(m, name);
      expect(f.advanced).toBe(true);
      expect(f.required).toBe(false);
    }
    // Invariant: no REQUIRED field of this meta hides in Advanced.
    for (const f of m.fields) {
      if (f.required) expect(f.advanced).toBeFalsy();
    }
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

// ─── mailchimp:audience_event — closed enum → static multi-select ──────────

describe("mailchimp:audience_event — eventTypes is a closed multi-select over the activation allowlist", () => {
  it("combobox multiple with option values EXACTLY the allowlist (string[] value shape preserved)", () => {
    const t = listTriggerMetasForProvider("mailchimp").find(
      (x) => x.key === "mailchimp:audience_event",
    );
    if (!t) throw new Error("mailchimp:audience_event trigger not found");
    const f = t.fields.find((x) => x.name === "eventTypes");
    expect(f).toBeDefined();
    expect(f!.type).toBe("combobox");
    expect(f!.multiple).toBe(true);
    expect(f!.required).toBe(true);
    expect(f!.options?.map((o) => o.value)).toEqual([
      ...MAILCHIMP_ALLOWED_EVENT_TYPES,
    ]);
    expect(TriggerMetaSchema.safeParse(t).success).toBe(true);
  });
});

// ─── mailchimp:create_segment — mode-scoped fields mirror the union ────────

describe("mailchimp:create_segment — visibleWhen mirrors the mode discriminated union", () => {
  const m = meta("mailchimp", "mailchimp:create_segment");

  it("static_emails only in static mode; conditions REQUIRED and only in saved mode; match only in saved mode", () => {
    const staticEmails = field(m, "static_emails");
    expect(staticEmails.visibleWhen).toEqual({ field: "mode", valueIn: ["static"] });
    expect(staticEmails.required).toBe(false); // empty static segments are legal

    const conditions = field(m, "conditions");
    expect(conditions.visibleWhen).toEqual({ field: "mode", valueIn: ["saved"] });
    expect(conditions.required).toBe(true); // SavedModeSchema: min 1

    const match = field(m, "match");
    expect(match.visibleWhen).toEqual({ field: "mode", valueIn: ["saved"] });
    expect(match.required).toBe(false);

    // Controller sanity: `mode` exists, is required, has exactly the two
    // union arms as options, and is not itself conditionally visible.
    const mode = field(m, "mode");
    expect(mode.required).toBe(true);
    expect(mode.visibleWhen).toBeUndefined();
    expect(mode.options?.map((o) => o.value)).toEqual(["static", "saved"]);
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });

  it("runtime union agrees: static REJECTS conditions; saved REQUIRES conditions", () => {
    const base = { audience_id: "a1", name: "VIPs" };
    expect(
      CreateSegmentConfigSchema.safeParse({
        ...base,
        mode: "static",
        conditions: [{ field: "EMAIL", op: "contains", value: "@x.com" }],
      }).success,
    ).toBe(false);
    expect(
      CreateSegmentConfigSchema.safeParse({ ...base, mode: "saved" }).success,
    ).toBe(false);
    expect(
      CreateSegmentConfigSchema.safeParse({
        ...base,
        mode: "saved",
        conditions: [{ field: "EMAIL", op: "contains", value: "@x.com" }],
      }).success,
    ).toBe(true);
  });

  it("conditions.op stays FREE TEXT — Mailchimp's condition DSL is open-ended (no in-repo enum); a closed select would drop capability", () => {
    const conditions = field(m, "conditions");
    const op = conditions.itemFields?.find((s) => s.name === "op");
    expect(op?.type).toBe("text");
  });
});

// ─── mailchimp:get_subscribers — pagination/temporal/sort polish ───────────

describe("mailchimp:get_subscribers — offset → Advanced, ISO fields → datetime-utc, sortDir scoped to sortField", () => {
  const m = meta("mailchimp", "mailchimp:get_subscribers");

  it("offset is Advanced loop plumbing; count pre-fills the honest server default (50)", () => {
    expect(field(m, "offset").advanced).toBe(true);
    expect(field(m, "count").defaultValue).toBe(50);
    // 50 really is inside the runtime bounds.
    expect(GetSubscribersConfigSchema.safeParse({ listId: "l1", count: 50 }).success).toBe(true);
  });

  it("sinceLastChanged / beforeLastChanged are datetime-utc; the Z-form value still parses at runtime", () => {
    expect(field(m, "sinceLastChanged").type).toBe("datetime-utc");
    expect(field(m, "beforeLastChanged").type).toBe("datetime-utc");
    // datetime-utc commits "YYYY-MM-DDTHH:MM:SSZ" — runtime is a plain
    // non-empty string, so the exact committed shape parses.
    expect(
      GetSubscribersConfigSchema.safeParse({
        listId: "l1",
        sinceLastChanged: "2026-01-01T00:00:00Z",
        beforeLastChanged: "2026-12-31T23:59:59Z",
      }).success,
    ).toBe(true);
  });

  it("sortDir is visible only when sortField is set — valueIn matches the runtime sortField enum exactly", () => {
    expect(field(m, "sortDir").visibleWhen).toEqual({
      field: "sortField",
      valueIn: ["timestamp_opt", "timestamp_signup", "last_changed"],
    });
    // Same values the runtime enum accepts.
    for (const v of ["timestamp_opt", "timestamp_signup", "last_changed"]) {
      expect(
        GetSubscribersConfigSchema.safeParse({ listId: "l1", sortField: v }).success,
      ).toBe(true);
    }
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

// ─── stripe:create_checkout_session — required-when-visible + object ───────

describe("stripe:create_checkout_session — lineItems required-when-visible; automaticTax `object` editor", () => {
  const m = meta("stripe", "stripe:create_checkout_session");

  it("lineItems: required + visibleWhen mode ∈ {payment, subscription} — exactly the modes the runtime superRefine requires it in", () => {
    const lineItems = field(m, "lineItems");
    expect(lineItems.required).toBe(true);
    expect(lineItems.visibleWhen).toEqual({
      field: "mode",
      valueIn: ["payment", "subscription"],
    });
    // Runtime agreement: required in payment/subscription, REJECTED in setup.
    const base = {
      successUrl: "https://x.test/ok",
      cancelUrl: "https://x.test/no",
    };
    const items = [{ priceId: "price_1", quantity: 1 }];
    expect(
      CreateCheckoutSessionConfigSchema.safeParse({ ...base, mode: "payment" }).success,
    ).toBe(false);
    expect(
      CreateCheckoutSessionConfigSchema.safeParse({ ...base, mode: "payment", lineItems: items }).success,
    ).toBe(true);
    expect(
      CreateCheckoutSessionConfigSchema.safeParse({ ...base, mode: "subscription" }).success,
    ).toBe(false);
    expect(
      CreateCheckoutSessionConfigSchema.safeParse({ ...base, mode: "setup", lineItems: items }).success,
    ).toBe(false);
    expect(
      CreateCheckoutSessionConfigSchema.safeParse({ ...base, mode: "setup" }).success,
    ).toBe(true);
  });

  it("automaticTax: `object` editor with single boolean key `enabled` (runtime .strict() keys), stays Advanced; round-trips", () => {
    const at = field(m, "automaticTax");
    expect(at.type).toBe("object");
    expect(at.advanced).toBe(true);
    expect(at.required).toBe(false);
    expect(at.jsonShape).toBeUndefined();
    expect(at.itemFields?.map((s) => s.name)).toEqual(["enabled"]);
    expect(at.itemFields?.[0]?.type).toBe("boolean");
    const parsed = CreateCheckoutSessionConfigSchema.parse({
      mode: "setup",
      successUrl: "https://x.test/ok",
      cancelUrl: "https://x.test/no",
      automaticTax: { enabled: true },
    });
    expect(parsed.automaticTax).toEqual({ enabled: true });
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

// ─── stripe money-moving hidden defaults → explicit Q11 choices ────────────

describe("stripe — money-moving behaviour switches are explicit choices (Q11), no defaultValue", () => {
  it("create_invoice.autoAdvance: required boolean, NO defaultValue (Stripe server-defaults true = collection fires)", () => {
    const m = meta("stripe", "stripe:create_invoice");
    const f = field(m, "autoAdvance");
    expect(f.type).toBe("boolean");
    expect(f.required).toBe(true);
    expect(f.defaultValue).toBeUndefined();
    // Runtime stays optional — saved configs without the field still parse.
    expect(CreateInvoiceConfigSchema.safeParse({ customerId: "cus_1" }).success).toBe(true);
    expect(
      CreateInvoiceConfigSchema.safeParse({ customerId: "cus_1", autoAdvance: false }).success,
    ).toBe(true);
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });

  it("cancel_subscription.at_period_end: required boolean, NO defaultValue (omission silently meant IMMEDIATE cancel); invoice_now + prorate → Advanced", () => {
    const m = meta("stripe", "stripe:cancel_subscription");
    const f = field(m, "at_period_end");
    expect(f.type).toBe("boolean");
    expect(f.required).toBe(true);
    expect(f.defaultValue).toBeUndefined();
    expect(field(m, "invoice_now").advanced).toBe(true);
    expect(field(m, "prorate").advanced).toBe(true);
    // Runtime stays optional — both values (and omission) parse.
    expect(CancelSubscriptionConfigSchema.safeParse({ subscriptionId: "sub_1" }).success).toBe(true);
    expect(
      CancelSubscriptionConfigSchema.safeParse({ subscriptionId: "sub_1", at_period_end: true }).success,
    ).toBe(true);
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

// ─── stripe — mode-scoping, Advanced knobs, currency combobox ──────────────

describe("stripe — subscription knobs, cursors, currency", () => {
  it("update_subscription: days_until_due visible only for send_invoice (runtime enum value); trial_end + proration_behavior → Advanced", () => {
    const m = meta("stripe", "stripe:update_subscription");
    expect(field(m, "days_until_due").visibleWhen).toEqual({
      field: "collection_method",
      valueIn: ["send_invoice"],
    });
    // "send_invoice" is a real runtime collection_method value.
    expect(
      UpdateSubscriptionConfigSchema.safeParse({
        subscriptionId: "sub_1",
        collection_method: "send_invoice",
        days_until_due: 30,
      }).success,
    ).toBe(true);
    expect(field(m, "trial_end").advanced).toBe(true);
    expect(field(m, "proration_behavior").advanced).toBe(true);
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });

  it("create_subscription.payment_behavior → Advanced (optional tuning knob)", () => {
    const m = meta("stripe", "stripe:create_subscription");
    const f = field(m, "payment_behavior");
    expect(f.advanced).toBe(true);
    expect(f.required).toBe(false);
  });

  it("capture_payment_intent.amount_to_capture: label drops wire-format jargon; Advanced (omit = full capture)", () => {
    const m = meta("stripe", "stripe:capture_payment_intent");
    const f = field(m, "amount_to_capture");
    expect(f.label).toBe("Amount to capture (cents)");
    expect(f.label.toLowerCase()).not.toContain("wire-format");
    expect(f.advanced).toBe(true);
    expect(f.required).toBe(false);
  });

  it("get_payments cursors (startingAfter / endingBefore) → Advanced loop plumbing", () => {
    const m = meta("stripe", "stripe:get_payments");
    expect(field(m, "startingAfter").advanced).toBe(true);
    expect(field(m, "endingBefore").advanced).toBe(true);
    // limit stays on the normal path (honest no-default page size).
    expect(field(m, "limit").advanced).toBeFalsy();
  });

  it("create_payment_intent.currency: combobox + manual entry; every option is a runtime-valid lowercase code (capability preserved)", () => {
    const m = meta("stripe", "stripe:create_payment_intent");
    const f = field(m, "currency");
    expect(f.type).toBe("combobox");
    expect(f.required).toBe(true);
    expect(f.allowManualEntry).toBe(true); // any ISO code still typeable
    const values = f.options?.map((o) => o.value) ?? [];
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      expect(v).toMatch(/^[a-z]{3}$/); // the runtime regex
      expect(
        CreatePaymentIntentConfigSchema.safeParse({ amount: 1, currency: v }).success,
      ).toBe(true);
    }
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

// ─── shopify:create_order — addresses become `object` editors (Advanced) ───

describe("shopify:create_order — shipping/billing addresses are `object` editors that stay Advanced", () => {
  const m = meta("shopify", "shopify:create_order");
  const ADDRESS_KEYS = ["address1", "address2", "city", "province", "country_code", "zip"];

  it.each(["shipping_address", "billing_address"])(
    "%s: object editor, Advanced (optional power detail), itemFields == runtime Address .strict() keys, all optional",
    (name) => {
      const f = field(m, name);
      expect(f.type).toBe("object");
      expect(f.advanced).toBe(true); // optional power-user detail
      expect(f.required).toBe(false);
      expect(f.jsonShape).toBeUndefined();
      expect(f.sensitivity).toBe("recipient"); // annotation preserved
      expect(f.itemFields?.map((s) => s.name)).toEqual(ADDRESS_KEYS);
      for (const s of f.itemFields ?? []) {
        expect(s.type).toBe("text");
        expect(s.required).toBe(false); // Address schema: every key optional
      }
    },
  );

  it("an editor-shaped address round-trips the runtime schema (partial fill, country_code 2-letter)", () => {
    const address = { city: "Denver", country_code: "US", zip: "80202" };
    const parsed = CreateOrderConfigSchema.parse({
      email: "c@example.com",
      line_items: [{ variant_id: 1, quantity: 1 }],
      send_receipt: false,
      shipping_address: address,
      billing_address: address,
    });
    expect(parsed.shipping_address).toEqual(address);
    expect(parsed.billing_address).toEqual(address);
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

// ─── shopify:update_order_status — operation-scoped fields ─────────────────

describe("shopify:update_order_status — visibleWhen mirrors the action discriminated union", () => {
  const m = meta("shopify", "shopify:update_order_status");

  it("reason/restock cancel-only (optional); tags/note required-when-visible for their operations", () => {
    expect(field(m, "reason").visibleWhen).toEqual({ field: "action", valueIn: ["cancel"] });
    expect(field(m, "reason").required).toBe(false);
    expect(field(m, "restock").visibleWhen).toEqual({ field: "action", valueIn: ["cancel"] });
    expect(field(m, "restock").required).toBe(false);

    const tags = field(m, "tags");
    expect(tags.visibleWhen).toEqual({ field: "action", valueIn: ["add_tags"] });
    expect(tags.required).toBe(true); // AddTags arm: tags min 1

    const note = field(m, "note");
    expect(note.visibleWhen).toEqual({ field: "action", valueIn: ["add_note"] });
    expect(note.required).toBe(true); // AddNote arm: note min 1

    // Controller sanity: `action` options are exactly the union arms and
    // the controller is not itself conditionally visible.
    const action = field(m, "action");
    expect(action.visibleWhen).toBeUndefined();
    expect(action.options?.map((o) => o.value)).toEqual(["cancel", "add_tags", "add_note"]);
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });

  it("runtime union agrees: add_tags REQUIRES tags; add_note REQUIRES note; cancel accepts reason/restock", () => {
    const base = { order_id: "450789469", notify_customer: false };
    expect(
      UpdateOrderStatusConfigSchema.safeParse({ ...base, action: "add_tags" }).success,
    ).toBe(false);
    expect(
      UpdateOrderStatusConfigSchema.safeParse({ ...base, action: "add_tags", tags: "vip" }).success,
    ).toBe(true);
    expect(
      UpdateOrderStatusConfigSchema.safeParse({ ...base, action: "add_note" }).success,
    ).toBe(false);
    expect(
      UpdateOrderStatusConfigSchema.safeParse({ ...base, action: "add_note", note: "hi" }).success,
    ).toBe(true);
    expect(
      UpdateOrderStatusConfigSchema.safeParse({
        ...base,
        action: "cancel",
        reason: "customer",
        restock: true,
      }).success,
    ).toBe(true);
    // Cross-arm leakage rejected — exactly why hiding auto-clears values.
    expect(
      UpdateOrderStatusConfigSchema.safeParse({ ...base, action: "cancel", tags: "vip" }).success,
    ).toBe(false);
  });
});

// ─── quickbooks — pagination + niche tax knob ──────────────────────────────

describe("quickbooks — Advanced pagination and tax treatment", () => {
  it("list_invoices: startPosition → Advanced; pageSize pre-fills the documented default (25)", () => {
    const m = meta("quickbooks", "quickbooks:list_invoices");
    expect(field(m, "startPosition").advanced).toBe(true);
    expect(field(m, "pageSize").defaultValue).toBe(25);
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });

  it("create_invoice: globalTaxCalculation (non-US only) → Advanced; termId gained a description", () => {
    const m = meta("quickbooks", "quickbooks:create_invoice");
    expect(field(m, "globalTaxCalculation").advanced).toBe(true);
    expect(field(m, "globalTaxCalculation").required).toBe(false);
    expect(field(m, "termId").description).toBeTruthy();
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

// ─── copy sweeps — jargon removed, warnings loudened ───────────────────────

describe("copy polish — implementation jargon out of normal-path descriptions", () => {
  it("mailchimp add/update_subscriber merge fields no longer cite merge tags", () => {
    for (const key of ["mailchimp:add_subscriber", "mailchimp:update_subscriber"]) {
      const m = meta("mailchimp", key);
      for (const f of m.fields) {
        expect(f.description ?? "").not.toMatch(/merge tag/i);
      }
    }
  });

  it("stripe descriptions no longer carry the snake_case cutover-parity sentence", () => {
    for (const m of listActionMetasForProvider("stripe")) {
      for (const f of m.fields) {
        expect(f.description ?? "").not.toContain("snake_case for V1 cutover parity");
      }
    }
  });

  it("shopify update_product / update_customer tags warn about replace-all", () => {
    for (const key of ["shopify:update_product", "shopify:update_customer"]) {
      const m = meta("shopify", key);
      expect(field(m, "tags").description).toMatch(/Replaces ALL existing tags/);
    }
  });

  it("mailchimp create_custom_event.is_syncing is an Advanced toggle with an outcome-first label", () => {
    const m = meta("mailchimp", "mailchimp:create_custom_event");
    const f = field(m, "is_syncing");
    expect(f.advanced).toBe(true);
    expect(f.label).toBe("Suppress automations (bulk sync)");
  });
});
