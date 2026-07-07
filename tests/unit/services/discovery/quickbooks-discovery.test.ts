/**
 * @jest-environment node
 *
 * Discovery-surface tests for QuickBooks Online — QUICKBOOKS-1.
 *
 * Asserts the builder/AI-visible catalog is complete + consistent:
 * 7 action metas 1:1 with registered handlers, 4 webhook trigger metas,
 * key formats, options-source wiring against the real resolver
 * registry, activation/deactivation/filter hook registration, and the
 * high-sensitivity accounting posture (PII + money fields marked
 * sensitive; recipient fields annotated).
 */
import {
  getActionMeta,
  getTriggerMeta,
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";
import { getOptionsResolver } from "@/services/options/_registry";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { getTriggerFilter } from "@/core/triggers/filterRegistry";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";
// Side-effect: register the trigger hooks like every prod entrypoint does.
import "@/integrations/_registry";

const ACTION_KEYS = [
  "quickbooks:create_customer",
  "quickbooks:find_customer",
  "quickbooks:get_customer",
  "quickbooks:create_invoice",
  "quickbooks:send_invoice",
  "quickbooks:get_invoice",
  "quickbooks:list_invoices",
];

const TRIGGER_TYPES = [
  "customer_created",
  "invoice_created",
  "payment_received",
  "invoice_paid",
];

describe("quickbooks action discovery", () => {
  it("registers exactly the 7 action metas, 1:1 with registered handlers", () => {
    const metas = listActionMetasForProvider("quickbooks");
    expect(metas.map((m) => m.key).sort()).toEqual([...ACTION_KEYS].sort());
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "quickbooks",
    );
    expect(handlers.map((h) => `quickbooks:${h.type}`).sort()).toEqual(
      [...ACTION_KEYS].sort(),
    );
  });

  it("every action requires the integration and is category commerce", () => {
    for (const meta of listActionMetasForProvider("quickbooks")) {
      expect(meta.requiresIntegration).toBe(true);
      expect(meta.category).toBe("commerce");
      expect(meta.isDestructive).toBe(false);
    }
  });

  it("send_invoice is explicitly labeled as customer-facing with a recipient-sensitive override", () => {
    const meta = getActionMeta("quickbooks:send_invoice")!;
    expect(meta.displayName.toLowerCase()).toContain("email");
    expect(meta.riskLevel).toBe("medium");
    const sendTo = meta.fields.find((f) => f.name === "sendTo")!;
    expect(sendTo.sensitivity).toBe("recipient");
    expect(sendTo.required).toBe(false);
  });

  it("create_invoice drafts only (no hidden send) and annotates the billing email as recipient", () => {
    const meta = getActionMeta("quickbooks:create_invoice")!;
    expect(meta.description).toContain("Does NOT email");
    const email = meta.fields.find((f) => f.name === "customerEmail")!;
    expect(email.sensitivity).toBe("recipient");
    // Tax fields are explicit-choice only — no defaults.
    const tax = meta.fields.find((f) => f.name === "globalTaxCalculation")!;
    expect(tax.required).toBe(false);
    expect(tax.defaultValue).toBeUndefined();
  });

  it("option sources referenced by action fields exist in the real resolver registry", () => {
    const sources = new Set<string>();
    for (const meta of listActionMetasForProvider("quickbooks")) {
      for (const field of meta.fields) {
        if (field.optionsSource) sources.add(field.optionsSource);
      }
    }
    expect([...sources].sort()).toEqual([
      "quickbooks:customers",
      "quickbooks:invoices",
      "quickbooks:terms",
    ]);
    for (const source of sources) {
      expect(getOptionsResolver(source)).not.toBeNull();
    }
    // items + tax_codes ship for id discovery even without a direct
    // field binding (object-list rows can't bind resolvers).
    expect(getOptionsResolver("quickbooks:items")).not.toBeNull();
    expect(getOptionsResolver("quickbooks:tax_codes")).not.toBeNull();
  });

  it("marks money + PII outputs sensitive on the shared customer projection", () => {
    const meta = getActionMeta("quickbooks:create_customer")!;
    const byName = new Map(meta.outputs.map((o) => [o.name, o]));
    for (const name of ["displayName", "email", "phone", "billingAddress", "balance", "notes"]) {
      expect(byName.get(name)?.sensitive).toBe(true);
    }
    expect(byName.get("customerId")?.sensitive).toBeUndefined();
  });
});

describe("quickbooks trigger discovery", () => {
  it("registers exactly the 4 app-level webhook trigger metas with no config fields", () => {
    const metas = listTriggerMetasForProvider("quickbooks");
    expect(metas.map((m) => m.type).sort()).toEqual([...TRIGGER_TYPES].sort());
    for (const meta of metas) {
      expect(meta.activation).toBe("webhook");
      expect(meta.requiresIntegration).toBe(true);
      expect(meta.fields).toEqual([]);
      expect(meta.category).toBe("commerce");
    }
  });

  it.each(TRIGGER_TYPES.map((t) => [t]))(
    "has activation + deactivation hooks + a fail-closed realm filter registered for %s",
    (type) => {
      expect(findActivation("quickbooks", type)).not.toBeNull();
      expect(findDeactivation("quickbooks", type)).not.toBeNull();
      expect(getTriggerFilter("quickbooks", type)).not.toBeNull();
    },
  );

  it("invoice triggers mark memos + amounts sensitive; ids and realm not", () => {
    for (const key of ["quickbooks:invoice_created", "quickbooks:invoice_paid"]) {
      const meta = getTriggerMeta(key)!;
      const byName = new Map(meta.payloadShape.map((p) => [p.name, p]));
      expect(byName.get("customerName")?.sensitive).toBe(true);
      expect(byName.get("totalAmount")?.sensitive).toBe(true);
      expect(byName.get("balance")?.sensitive).toBe(true);
      expect(byName.get("customerMemo")?.sensitive).toBe(true);
      expect(byName.get("lines")?.sensitive).toBe(true);
      expect(byName.get("invoiceId")?.sensitive).toBeUndefined();
      expect(byName.get("realmId")?.sensitive).toBeUndefined();
    }
  });

  it("invoice_paid documents its derived, verified-balance semantics", () => {
    const meta = getTriggerMeta("quickbooks:invoice_paid")!;
    expect(meta.description.toLowerCase()).toContain("fully paid");
    expect(meta.description.toLowerCase()).toContain("partial");
    const names = meta.payloadShape.map((p) => p.name);
    expect(names).toContain("paymentId");
    expect(names).toContain("paid");
  });
});
