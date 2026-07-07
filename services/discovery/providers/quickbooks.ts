import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * QuickBooks Online discovery sub-registry — QUICKBOOKS-1.
 *
 * Fourth net-new V2 provider (no V1 code — see
 * docs/providers/quickbooks/v2-pattern-audit.md). Actions AND triggers
 * ship in the first slice (contrast Typeform/Calendly's actions-later
 * posture), so `quickbooks` joins COVERED_PROVIDERS immediately and
 * 1:1 handler↔meta drift is enforced from day one.
 *
 * **Coverage:** 7 bounded actions + 4 app-level-webhook triggers.
 *
 * **Actions:** create/find/get customer, create (draft) / send / get /
 * list invoices. find/get use found:false lookup semantics;
 * send_invoice is the ONLY customer-facing email surface.
 *
 * **Triggers:** customer_created / invoice_created / payment_received /
 * invoice_paid — Intuit APP-LEVEL webhook (portal-configured endpoint;
 * activation stores internal trigger-interest rows only), post-fetch
 * enrichment, invoice_paid DERIVED from payment events with a verified
 * zero-balance check. Activation + deactivation registered in
 * `integrations/quickbooks/triggers/<event>/index.ts`, satisfying the
 * trigger-meta-activation-invariant test without an exemption.
 */

import { quickbooksCreateCustomerMeta } from "@/integrations/quickbooks/actions/createCustomer.meta";
import { quickbooksFindCustomerMeta } from "@/integrations/quickbooks/actions/findCustomer.meta";
import { quickbooksGetCustomerMeta } from "@/integrations/quickbooks/actions/getCustomer.meta";
import { quickbooksCreateInvoiceMeta } from "@/integrations/quickbooks/actions/createInvoice.meta";
import { quickbooksSendInvoiceMeta } from "@/integrations/quickbooks/actions/sendInvoice.meta";
import { quickbooksGetInvoiceMeta } from "@/integrations/quickbooks/actions/getInvoice.meta";
import { quickbooksListInvoicesMeta } from "@/integrations/quickbooks/actions/listInvoices.meta";
import { quickbooksCustomerCreatedTriggerMeta } from "@/integrations/quickbooks/triggers/customerCreated/customerCreated.meta";
import { quickbooksInvoiceCreatedTriggerMeta } from "@/integrations/quickbooks/triggers/invoiceCreated/invoiceCreated.meta";
import { quickbooksPaymentReceivedTriggerMeta } from "@/integrations/quickbooks/triggers/paymentReceived/paymentReceived.meta";
import { quickbooksInvoicePaidTriggerMeta } from "@/integrations/quickbooks/triggers/invoicePaid/invoicePaid.meta";

/** QuickBooks action metas — displayOrder 10..70. */
export const QUICKBOOKS_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  quickbooksCreateCustomerMeta,
  quickbooksFindCustomerMeta,
  quickbooksGetCustomerMeta,
  quickbooksCreateInvoiceMeta,
  quickbooksSendInvoiceMeta,
  quickbooksGetInvoiceMeta,
  quickbooksListInvoicesMeta,
];

/** QuickBooks trigger metas — displayOrder 10..40. */
export const QUICKBOOKS_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  quickbooksCustomerCreatedTriggerMeta,
  quickbooksInvoiceCreatedTriggerMeta,
  quickbooksPaymentReceivedTriggerMeta,
  quickbooksInvoicePaidTriggerMeta,
];
