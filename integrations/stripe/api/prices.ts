import { stripeRequest } from "./_request";

/**
 * Stripe `/v1/prices` API wrappers (RESOLVERS-1).
 *
 * One endpoint: list active prices with `expand[]=data.product`, backing
 * the `stripe:prices` options resolver. Handlers never call this — every
 * write action keeps storing the raw `price_...` id string the schemas
 * already validate.
 *
 * https://docs.stripe.com/api/prices/list
 */

export interface StripePriceListEntry {
  id: string;
  object: "price";
  active: boolean;
  nickname: string | null;
  currency: string;
  /** Minor units (cents); null for usage-based / custom pricing. */
  unit_amount: number | null;
  recurring: { interval: string; interval_count: number } | null;
  product: string | { id: string; name: string | null; deleted?: boolean };
}

export interface StripePriceListResponse {
  object: "list";
  data: StripePriceListEntry[];
  has_more: boolean;
}

export interface PricesListInput {
  accessToken: string;
  /** Stripe caps list pages at 100. */
  limit?: number;
  /** Defaults to active prices only (what a picker should offer). */
  active?: boolean;
  /** Expand `data.product` so the picker can label by product name. */
  expandProduct?: boolean;
}

export async function pricesList(
  input: PricesListInput,
): Promise<StripePriceListResponse> {
  const query = new URLSearchParams();
  if (input.limit !== undefined) query.set("limit", String(input.limit));
  if (input.active !== undefined) query.set("active", String(input.active));
  if (input.expandProduct === true) query.append("expand[]", "data.product");

  return stripeRequest<StripePriceListResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/v1/prices",
    query,
    resourceForNotFound: "prices (list)",
  });
}
