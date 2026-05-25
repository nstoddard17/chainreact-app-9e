import { stripeRequest } from "./_request";

/**
 * Stripe `/v1/invoices` API wrapper.
 *
 * Stripe 2.1 Commit 3 — wrapper for the `create_invoice` action.
 * Invoices in Stripe are itemized billing records sent to customers.
 * `create_invoice` creates a draft invoice for an existing customer
 * — finalization, line-item attachment (`createInvoiceItem`), payment
 * (`payInvoice`), and voiding (`voidInvoice` / `finalizeInvoice`) all
 * remain deferred per parity-stripe NPD-S1 (orphan-action backfill is
 * on-demand only).
 *
 * Wire-format: form-encoded POST through `stripeRequest`. Nested
 * `metadata.<key>` flattened via `flattenForStripe` inside
 * `stripeRequest`.
 *
 * V1 reference: `lib/workflows/actions/stripe/createInvoice.ts`
 * (100 LOC). V2 sheds V1's raw `metadata` JSON-string passthrough.
 * V1 supports only `customer`, `description`, `auto_advance`,
 * `metadata` — V2 ports the same narrow surface (per parity-stripe
 * "if V1 supports" gate). Stripe's API supports many more fields
 * (`collection_method`, `days_until_due`, `due_date`, `footer`,
 * `subscription`, `application_fee_amount`, `automatic_tax`,
 * `pending_invoice_items_behavior`, etc.); none ship in Stripe 2.1
 * because V1 doesn't expose them on `createInvoice`.
 *
 * V1 did NOT send an `Idempotency-Key` header. V2 adds it per Slice
 * 11 convention.
 */

// ─── Wire-format response type ──────────────────────────────────────────────

/**
 * Stripe Invoice resource. Pinned to the fields V2 surfaces in the
 * handler's locked output. Stripe's response carries many more
 * (`account_country`, `account_name`, `application`, `attempt_count`,
 * `attempted`, `billing_reason`, `charge`, `discounts`, `due_date`,
 * `effective_at`, `ending_balance`, `from_invoice`, `lines`,
 * `next_payment_attempt`, `number`, `period_start`, `period_end`,
 * `receipt_number`, `total`, `total_excluding_tax`, …) — adding any
 * is an additive change here + in the handler's output mapping.
 *
 * Note on `customer`: Stripe returns this as either a customer-id
 * string OR an expanded customer object (when `expand: ["customer"]`
 * is requested). V2 doesn't request expansion, so the field is a
 * string in practice — type is the narrower `string | null` to match.
 */
export interface StripeInvoice {
  id: string;
  object: "invoice";
  customer: string | null;
  subscription: string | null;
  status: string | null;
  collection_method: "charge_automatically" | "send_invoice" | null;
  auto_advance: boolean | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string | null;
  description: string | null;
  metadata: Record<string, string>;
  livemode: boolean;
}

// ─── invoicesCreate ─────────────────────────────────────────────────────────

export interface InvoicesCreateInput {
  accessToken: string;
  /** Existing Stripe customer id (`cus_xxx`). Required. */
  customer: string;
  description?: string;
  metadata?: Record<string, string>;
  /**
   * When true, Stripe will automatically transition the invoice from
   * `draft` to `open` and attempt collection. Defaults to Stripe's
   * server-side default (`true`) when omitted.
   */
  autoAdvance?: boolean;
  idempotencyKey?: string;
}

export async function invoicesCreate(
  input: InvoicesCreateInput,
): Promise<StripeInvoice> {
  const body: Record<string, unknown> = { customer: input.customer };
  if (input.description !== undefined) body.description = input.description;
  if (input.metadata !== undefined) body.metadata = input.metadata;
  if (input.autoAdvance !== undefined) body.auto_advance = input.autoAdvance;

  return stripeRequest<StripeInvoice>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/v1/invoices",
    body,
    idempotencyKey: input.idempotencyKey,
    resourceForNotFound: "invoice (create)",
  });
}
