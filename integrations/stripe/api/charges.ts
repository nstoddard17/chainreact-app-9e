import { stripeRequest } from "./_request";

/**
 * Stripe `/v1/charges` API wrapper.
 *
 * Stripe 2.1 Commit 4 — wrapper for the `get_payments` list action.
 *
 * Note on Stripe data-model: a "charge" is the actual money-moved
 * record in Stripe's API; a "payment_intent" is the higher-level
 * orchestration object that may or may not produce one charge. For
 * the "list of payments collected" use case, `/v1/charges` is the
 * canonical surface. V1's `getPayments.ts` hit
 * `/v1/payment_intents` — V2 corrects to `/v1/charges` per
 * parity-stripe §5 M4 + audit acceptance. The next-commit
 * `find_payment_intent` action covers the per-PaymentIntent
 * lookup surface separately.
 *
 * Wire-format: GET with query params via `URLSearchParams`. No body.
 * `stripeRequest` handles auth (Bearer), version (`Stripe-Version`
 * header), and error mapping (401 / 404 / generic) uniformly.
 *
 * Single-page only — Stripe's list endpoints return `{data, has_more,
 * url}` and the cursor (`starting_after` / `ending_before`) is the
 * id of the last/first item in the previous page. V2 does NOT
 * auto-paginate; workflow authors compose a downstream loop using
 * `output.nextCursor` (the last charge id when `has_more: true`).
 */

// ─── Wire-format response types ─────────────────────────────────────────────

/**
 * Stripe Charge resource. Pinned to the fields V2's `get_payments`
 * handler projects into the bounded output. Stripe's response carries
 * many more (`application`, `application_fee`, `balance_transaction`,
 * `billing_details`, `calculated_statement_descriptor`, `captured`,
 * `disputed`, `failure_balance_transaction`, `failure_code`,
 * `failure_message`, `fraud_details`, `outcome`, `payment_method`,
 * `payment_method_details`, `radar_options`, `refunds`,
 * `review`, `shipping`, `source_transfer`, `statement_descriptor`,
 * `statement_descriptor_suffix`, `transfer_data`, `transfer_group`)
 * — adding a field is an additive change here + in the handler.
 */
export interface StripeCharge {
  id: string;
  object: "charge";
  amount: number;
  currency: string;
  status: string;
  paid: boolean;
  refunded: boolean;
  customer: string | null;
  payment_intent: string | null;
  created: number;
  description: string | null;
  receipt_url: string | null;
  metadata: Record<string, string>;
  livemode: boolean;
}

export interface StripeChargeListResponse {
  object: "list";
  data: StripeCharge[];
  has_more: boolean;
  url: string;
}

// ─── chargesList ────────────────────────────────────────────────────────────

export interface ChargesListInput {
  accessToken: string;
  /** Filter to a specific customer (`cus_xxx`). Optional. */
  customer?: string;
  /**
   * Number of records to return. Stripe's documented range is 1..100;
   * caller-enforced in the schema. Defaults to Stripe's server-side
   * default (`10`) when omitted.
   */
  limit?: number;
  /**
   * Forward pagination cursor — id of the last charge from the
   * previous page. Mutex with `endingBefore` (caller-enforced).
   */
  startingAfter?: string;
  /** Backward pagination cursor — mutex with `startingAfter`. */
  endingBefore?: string;
  /**
   * Lower bound on `created` (inclusive, Unix seconds) → `created[gte]`.
   * Added for the read-only Stripe analytics source
   * (ANALYTICS-SOURCES-STRIPE-1) to scope a charge count/volume scan to a
   * date window. Additive: existing callers omit it. Optional.
   */
  createdGte?: number;
  /** Upper bound on `created` (inclusive, Unix seconds) → `created[lte]`. */
  createdLte?: number;
}

export async function chargesList(
  input: ChargesListInput,
): Promise<StripeChargeListResponse> {
  const query = new URLSearchParams();
  if (input.customer !== undefined) query.set("customer", input.customer);
  if (input.limit !== undefined) query.set("limit", String(input.limit));
  if (input.startingAfter !== undefined) {
    query.set("starting_after", input.startingAfter);
  }
  if (input.endingBefore !== undefined) {
    query.set("ending_before", input.endingBefore);
  }
  if (input.createdGte !== undefined) {
    query.set("created[gte]", String(input.createdGte));
  }
  if (input.createdLte !== undefined) {
    query.set("created[lte]", String(input.createdLte));
  }

  return stripeRequest<StripeChargeListResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/v1/charges",
    query,
    resourceForNotFound: "charges (list)",
  });
}

// ─── chargesListExpanded (RESOLVERS-2 — backs the stripe:charges picker) ────

/**
 * List-entry shape for `GET /v1/charges?expand[]=data.customer`.
 *
 * Deliberately a SEPARATE type from `StripeCharge` above rather than
 * widening that interface's `customer` to a union: `StripeCharge` is
 * the shape `get_payments` projects into its bounded output, where
 * `customer` is contractually a string id. Expanding it there would
 * change a shipped action's output type. This mirrors the same split
 * `subscriptions.ts` already makes between `StripeSubscription`
 * (handler-facing, `customer: string`) and `StripeSubscriptionListEntry`
 * (resolver-facing, expanded customer object).
 *
 * The expanded customer is used ONLY to build a human option label —
 * NAME only, never email / phone / balance (the `_shared.ts` label
 * policy), which is why only `id` + `name` are pinned here.
 */
export interface StripeChargeListEntry {
  id: string;
  object: "charge";
  /** Amount in MINOR UNITS of `currency` (cents for USD, yen for JPY). */
  amount: number;
  currency: string;
  status: string;
  created: number;
  description: string | null;
  customer: string | { id: string; name: string | null; deleted?: boolean } | null;
}

export interface StripeChargeListEntryResponse {
  object: "list";
  data: StripeChargeListEntry[];
  has_more: boolean;
}

export interface ChargesListExpandedInput {
  accessToken: string;
  /** Stripe caps list pages at 100. */
  limit?: number;
  /** Expand `data.customer` so the picker can label by customer name. */
  expandCustomer?: boolean;
}

/**
 * Single bounded page of charges with the customer expanded, for the
 * `stripe:charges` option resolver. Handlers keep using `chargesList`
 * above (unexpanded, cursor-driven, filterable).
 */
export async function chargesListExpanded(
  input: ChargesListExpandedInput,
): Promise<StripeChargeListEntryResponse> {
  const query = new URLSearchParams();
  if (input.limit !== undefined) query.set("limit", String(input.limit));
  if (input.expandCustomer === true) query.append("expand[]", "data.customer");

  return stripeRequest<StripeChargeListEntryResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/v1/charges",
    query,
    resourceForNotFound: "charges (list)",
  });
}
