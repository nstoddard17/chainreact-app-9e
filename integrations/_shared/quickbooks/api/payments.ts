import { quickbooksRequest } from "./_request";
import { NotFoundError } from "../errors";
import {
  projectPayment,
  type ProjectedQuickbooksPayment,
  type QuickbooksRawPayment,
} from "../projections";

/**
 * Typed Payment API wrapper — QUICKBOOKS-1.
 *
 * READ-ONLY this slice (record/create payment is an explicit exclusion).
 * Consumed by the webhook enrichment layer:
 *   - `payment_received` — the projected payment is the trigger payload.
 *   - `invoice_paid` derivation — `linkedInvoiceIds` (LinkedTxn entries
 *     with `TxnType: "Invoice"`) name the invoices to balance-check.
 */
interface PaymentEnvelope {
  Payment?: QuickbooksRawPayment;
}

/** Read one payment by id. Returns `null` on QBO 404 (deleted/voided). */
export async function paymentGet(input: {
  accessToken: string;
  realmId: string;
  paymentId: string;
}): Promise<ProjectedQuickbooksPayment | null> {
  try {
    const res = await quickbooksRequest<PaymentEnvelope>({
      accessToken: input.accessToken,
      realmId: input.realmId,
      method: "GET",
      path: `/payment/${encodeURIComponent(input.paymentId)}`,
      resourceForNotFound: `payment ${input.paymentId}`,
    });
    return res.Payment ? projectPayment(res.Payment) : null;
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}
