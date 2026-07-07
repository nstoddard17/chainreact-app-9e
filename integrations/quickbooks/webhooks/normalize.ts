import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  ProjectedQuickbooksCustomer,
  ProjectedQuickbooksInvoice,
  ProjectedQuickbooksPayment,
} from "@/integrations/_shared/quickbooks/projections";

/**
 * Normalize enriched QuickBooks entities into V2's canonical
 * `TriggerEvent` — QUICKBOOKS-1.
 *
 * PURE + deterministic dedup keys (webhook-normalize-purity contract):
 * eventIds are built from durable provider identity only — realm +
 * entity id — NEVER from a clock, RNG, or Intuit's per-delivery
 * lastUpdated timestamp (the Asana lesson: one user-visible change can
 * arrive as several deliveries milliseconds apart; a timestamp-bearing
 * key double-fires).
 *
 * Because Intuit's compact payloads carry no entity data, normalization
 * takes the ENRICHED bounded projection (fetched by enrich.ts) as
 * input — enrichment is I/O and stays out of this module. Payloads are
 * the flattened projections + `changeKind` + `realmId`; raw provider
 * records never pass through here.
 *
 * `providerAccountId` is the realmId — the P-S2 realm filter compares
 * it against each trigger row's activated company, and the dispatcher
 * dedup key embeds it, so no company's events can leak into another
 * company's workflows.
 *
 * `occurredAt` prefers payload data (Intuit's lastUpdated for the
 * change, else the entity's own timestamps); the clock fallback is
 * occurredAt-only (Calendly precedent — NEVER the eventId).
 */

function occurredAtFrom(
  lastUpdated: string | null,
  ...candidates: Array<string | null>
): string {
  if (lastUpdated) return lastUpdated;
  for (const candidate of candidates) {
    if (candidate) return candidate;
  }
  return new Date().toISOString();
}

export function normalizeCustomerCreated(input: {
  realmId: string;
  customer: ProjectedQuickbooksCustomer;
  lastUpdated: string | null;
}): TriggerEvent {
  const { realmId, customer } = input;
  return {
    provider: "quickbooks",
    eventType: "customer_created",
    eventId: `customer_created:${realmId}:${customer.customerId ?? "no-id"}`,
    occurredAt: occurredAtFrom(input.lastUpdated, customer.createdAt),
    providerAccountId: realmId,
    payload: {
      changeKind: "customer_created",
      realmId,
      ...customer,
    },
  };
}

export function normalizeInvoiceCreated(input: {
  realmId: string;
  invoice: ProjectedQuickbooksInvoice;
  lastUpdated: string | null;
}): TriggerEvent {
  const { realmId, invoice } = input;
  return {
    provider: "quickbooks",
    eventType: "invoice_created",
    eventId: `invoice_created:${realmId}:${invoice.invoiceId ?? "no-id"}`,
    occurredAt: occurredAtFrom(input.lastUpdated, invoice.createdAt),
    providerAccountId: realmId,
    payload: {
      changeKind: "invoice_created",
      realmId,
      ...invoice,
    },
  };
}

export function normalizePaymentReceived(input: {
  realmId: string;
  payment: ProjectedQuickbooksPayment;
  lastUpdated: string | null;
}): TriggerEvent {
  const { realmId, payment } = input;
  return {
    provider: "quickbooks",
    eventType: "payment_received",
    eventId: `payment_received:${realmId}:${payment.paymentId ?? "no-id"}`,
    occurredAt: occurredAtFrom(input.lastUpdated, payment.createdAt),
    providerAccountId: realmId,
    payload: {
      changeKind: "payment_received",
      realmId,
      ...payment,
    },
  };
}

/**
 * Derived event — the dedup key is the INVOICE's durable identity (not
 * the payment's), so Payment Create + Update for the same payment, or
 * several partial payments completing one invoice, collapse to ONE
 * `invoice_paid` fire per invoice (within the dedup window).
 */
export function normalizeInvoicePaid(input: {
  realmId: string;
  invoice: ProjectedQuickbooksInvoice;
  paymentId: string | null;
  lastUpdated: string | null;
}): TriggerEvent {
  const { realmId, invoice } = input;
  return {
    provider: "quickbooks",
    eventType: "invoice_paid",
    eventId: `invoice_paid:${realmId}:${invoice.invoiceId ?? "no-id"}`,
    occurredAt: occurredAtFrom(input.lastUpdated, invoice.updatedAt),
    providerAccountId: realmId,
    payload: {
      changeKind: "invoice_paid",
      realmId,
      paymentId: input.paymentId,
      ...invoice,
    },
  };
}
