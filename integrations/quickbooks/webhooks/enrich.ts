import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { getAnyActiveByProviderAccountServiceRole } from "@/repositories/integrations";
import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
import { customerGet } from "@/integrations/_shared/quickbooks/api/customers";
import { invoiceGet } from "@/integrations/_shared/quickbooks/api/invoices";
import { paymentGet } from "@/integrations/_shared/quickbooks/api/payments";
import type { QuickbooksEntityEvent } from "./receive";
import {
  normalizeCustomerCreated,
  normalizeInvoiceCreated,
  normalizeInvoicePaid,
  normalizePaymentReceived,
} from "./normalize";

/**
 * QuickBooks webhook enrichment + fan-out orchestration — QUICKBOOKS-1.
 *
 * Intuit's payloads are compact (entity name + id + operation, no
 * data), so the receive path fetches each named entity through the
 * typed wrappers BEFORE dispatch — workflows always get the full
 * bounded projection, never the compact stub. This is the I/O layer
 * the pure normalize module deliberately excludes.
 *
 * Event-type mapping (operations outside this table are ignored —
 * Delete/Void/Merge ship in a later slice, if ever):
 *   - Customer + Create          → customer_created
 *   - Invoice  + Create          → invoice_created
 *   - Payment  + Create          → payment_received AND invoice_paid
 *                                   derivation
 *   - Payment  + Update          → invoice_paid derivation ONLY
 *
 * invoice_paid derivation (research.md — QuickBooks has NO native
 * invoice-paid event; Invoice Update is deliberately NOT used as a paid
 * signal): fetch the payment → walk linkedInvoiceIds → re-fetch each
 * invoice → dispatch invoice_paid ONLY when the CURRENT balance is zero
 * with a positive total. Partial payment → balance > 0 → no fire. The
 * dedup key is the invoice's durable identity, so double-derivation
 * (Create + Update) collapses in the dispatcher.
 *
 * Credential resolution: ONE active integration per realmId
 * (service-role, earliest-connected — every account connected to the
 * same realm is authorized for the same books; the dispatcher's realm
 * filter still scopes which workflows fire). Realms with no active
 * integration are DROPPED with a count-only log — no realm ids, no
 * entity data (no cross-tenant leak).
 *
 * Failure semantics: per-event errors are collected, remaining events
 * still process, and the route returns 5xx when any failed — Intuit
 * redelivers, the dispatcher's dedup drops the already-dispatched
 * subset, and only the failed entities get re-enriched.
 */

export interface QuickbooksEnrichSummary {
  received: number;
  dispatched: number;
  duplicates: number;
  ignoredOperations: number;
  droppedNoIntegration: number;
  /** Entities Intuit named but that no longer resolve (deleted). */
  goneEntities: number;
  errors: number;
}

type Enrichable = QuickbooksEntityEvent & {
  kind:
    | "customer_created"
    | "invoice_created"
    | "payment_received"
    | "payment_updated";
};

function classify(event: QuickbooksEntityEvent): Enrichable | null {
  if (event.entity === "Customer" && event.operation === "Create") {
    return { ...event, kind: "customer_created" };
  }
  if (event.entity === "Invoice" && event.operation === "Create") {
    return { ...event, kind: "invoice_created" };
  }
  if (event.entity === "Payment" && event.operation === "Create") {
    return { ...event, kind: "payment_received" };
  }
  if (event.entity === "Payment" && event.operation === "Update") {
    return { ...event, kind: "payment_updated" };
  }
  return null;
}

export async function processQuickbooksEvents(
  events: readonly QuickbooksEntityEvent[],
): Promise<QuickbooksEnrichSummary> {
  const summary: QuickbooksEnrichSummary = {
    received: events.length,
    dispatched: 0,
    duplicates: 0,
    ignoredOperations: 0,
    droppedNoIntegration: 0,
    goneEntities: 0,
    errors: 0,
  };

  // Resolve each realm's credential once per delivery.
  const integrationByRealm = new Map<
    string,
    Awaited<ReturnType<typeof getAnyActiveByProviderAccountServiceRole>>
  >();

  for (const raw of events) {
    const enrichable = classify(raw);
    if (!enrichable) {
      summary.ignoredOperations += 1;
      continue;
    }

    try {
      if (!integrationByRealm.has(enrichable.realmId)) {
        integrationByRealm.set(
          enrichable.realmId,
          await getAnyActiveByProviderAccountServiceRole(
            "quickbooks",
            enrichable.realmId,
          ),
        );
      }
      const integration = integrationByRealm.get(enrichable.realmId) ?? null;
      if (!integration) {
        summary.droppedNoIntegration += 1;
        continue;
      }

      const call = <T>(apiCall: (accessToken: string) => Promise<T>) =>
        refreshAndRetry({
          accountId: integration.accountId,
          provider: "quickbooks",
          providerAccountId: integration.providerAccountId,
          apiCall,
        });

      if (enrichable.kind === "customer_created") {
        const customer = await call((accessToken) =>
          customerGet({
            accessToken,
            realmId: enrichable.realmId,
            customerId: enrichable.entityId,
          }),
        );
        if (!customer) {
          summary.goneEntities += 1;
          continue;
        }
        const result = await dispatchTriggerEvent(
          normalizeCustomerCreated({
            realmId: enrichable.realmId,
            customer,
            lastUpdated: enrichable.lastUpdated,
          }),
        );
        summary.dispatched += result.enqueued;
        if (result.duplicate) summary.duplicates += 1;
        continue;
      }

      if (enrichable.kind === "invoice_created") {
        const invoice = await call((accessToken) =>
          invoiceGet({
            accessToken,
            realmId: enrichable.realmId,
            invoiceId: enrichable.entityId,
          }),
        );
        if (!invoice) {
          summary.goneEntities += 1;
          continue;
        }
        const result = await dispatchTriggerEvent(
          normalizeInvoiceCreated({
            realmId: enrichable.realmId,
            invoice,
            lastUpdated: enrichable.lastUpdated,
          }),
        );
        summary.dispatched += result.enqueued;
        if (result.duplicate) summary.duplicates += 1;
        continue;
      }

      // Payment Create/Update — fetch the payment once.
      const payment = await call((accessToken) =>
        paymentGet({
          accessToken,
          realmId: enrichable.realmId,
          paymentId: enrichable.entityId,
        }),
      );
      if (!payment) {
        summary.goneEntities += 1;
        continue;
      }

      if (enrichable.kind === "payment_received") {
        const result = await dispatchTriggerEvent(
          normalizePaymentReceived({
            realmId: enrichable.realmId,
            payment,
            lastUpdated: enrichable.lastUpdated,
          }),
        );
        summary.dispatched += result.enqueued;
        if (result.duplicate) summary.duplicates += 1;
      }

      // invoice_paid derivation — for BOTH Create and Update payment
      // events. Re-fetch each linked invoice and fire only on a
      // verified zero balance (partial payments never fire).
      for (const invoiceId of payment.linkedInvoiceIds) {
        const invoice = await call((accessToken) =>
          invoiceGet({
            accessToken,
            realmId: enrichable.realmId,
            invoiceId,
          }),
        );
        if (!invoice) {
          summary.goneEntities += 1;
          continue;
        }
        if (!invoice.paid) continue;
        const result = await dispatchTriggerEvent(
          normalizeInvoicePaid({
            realmId: enrichable.realmId,
            invoice,
            paymentId: payment.paymentId,
            lastUpdated: enrichable.lastUpdated,
          }),
        );
        summary.dispatched += result.enqueued;
        if (result.duplicate) summary.duplicates += 1;
      }
    } catch (err) {
      summary.errors += 1;
      // Count-only logging — never entity data, realm ids, or tokens.
      console.error(
        JSON.stringify({
          event: "webhook.quickbooks.enrich_error",
          entity: enrichable.entity,
          operation: enrichable.operation,
          error: (err as Error).message,
        }),
      );
    }
  }

  return summary;
}
