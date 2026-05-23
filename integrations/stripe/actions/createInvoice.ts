import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { buildIdempotencyKey } from "@/core/workflows/idempotency";
import { stripeLivemodePreflight } from "@/integrations/stripe/security/livemodePolicy";
import { invoicesCreate } from "../api/invoices";
import { CreateInvoiceConfigSchema } from "./createInvoice.schema";

/**
 * Stripe `create_invoice` action handler — Stripe 2.1 Commit 3.
 *
 * POSTs `/v1/invoices` with the connected merchant's access token.
 * Creates a draft invoice for an existing Stripe customer. The
 * default `autoAdvance: true` (Stripe-side default) means Stripe
 * will queue automatic collection; workflows that want to keep the
 * invoice in `draft` until a downstream action attaches line items
 * pass `autoAdvance: false`.
 *
 * Idempotency-keyed (Q4) — invoice creation is billing-impacting
 * (an `autoAdvance: true` draft auto-finalizes and Stripe attempts
 * collection; a duplicate invoice could double-bill). The key shape
 * is `${runId}:${nodeId}:stripe_action_create_invoice` — same
 * convention as every other V2 Stripe action.
 *
 * V1's `createInvoice.ts` did NOT send an Idempotency-Key header;
 * V2 adds it for cutover safety. Stripe's 24-hour server-side dedup
 * window protects against engine retries, webhook re-deliveries,
 * and manual re-runs of the same logical run.
 *
 * `accountId` resolution: when the workflow's trigger is a Stripe
 * webhook event, `triggerEvent.accountId` carries the connected
 * merchant's `stripe_user_id`. For manual / cross-provider triggers,
 * `accountId` is null and `refreshAndRetry`'s integration lookup
 * picks the user's single Stripe integration row.
 *
 * Output shape (downstream variable refs — locked to 14 stable keys):
 *   { invoiceId, customerId, subscriptionId, status, collectionMethod,
 *     autoAdvance, hostedInvoiceUrl, invoicePdf, amountDue, amountPaid,
 *     currency, description, metadata, livemode }
 *
 *   - `subscriptionId`, `collectionMethod`, `autoAdvance` are Stripe
 *     response fields even though V2 doesn't accept them as input.
 *     Stripe always populates them — `subscriptionId` is null for
 *     non-subscription invoices, `collectionMethod` defaults to
 *     `charge_automatically`, `autoAdvance` echoes Stripe's default.
 *   - `hostedInvoiceUrl` / `invoicePdf` may be null on freshly-created
 *     draft invoices — Stripe populates them once the invoice
 *     transitions to `open` or beyond. Workflows that need them
 *     should chain on the `invoice.paid` webhook event instead of
 *     reading them straight from `create_invoice` output.
 *   - `amountDue` / `amountPaid` are 0 on a fresh draft invoice with
 *     no line items. They populate once line items are attached
 *     (deferred — see schema doc).
 *
 *   Input is NOT spread into output (V2 convention).
 */
export const createInvoice: ActionHandler = async (input) => {
  const config = CreateInvoiceConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "stripe"
      ? input.triggerEvent.accountId
      : null;

  const idempotencyKey = buildIdempotencyKey({
    executionSessionId: input.runId,
    nodeId: input.nodeId,
    actionType: "stripe_action_create_invoice",
  });

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "stripe",
    accountId,
    preflight: stripeLivemodePreflight({
      actionType: "create_invoice",
      runTestMode: input.testMode === true,
    }),
    apiCall: (accessToken) =>
      invoicesCreate({
        accessToken,
        customer: config.customerId,
        description: config.description,
        metadata: config.metadata,
        autoAdvance: config.autoAdvance,
        idempotencyKey,
      }),
  });

  return {
    output: {
      invoiceId: result.id,
      customerId: result.customer,
      subscriptionId: result.subscription,
      status: result.status,
      collectionMethod: result.collection_method,
      autoAdvance: result.auto_advance,
      hostedInvoiceUrl: result.hosted_invoice_url,
      invoicePdf: result.invoice_pdf,
      amountDue: result.amount_due,
      amountPaid: result.amount_paid,
      currency: result.currency,
      description: result.description,
      metadata: result.metadata,
      livemode: result.livemode,
    },
  };
};
