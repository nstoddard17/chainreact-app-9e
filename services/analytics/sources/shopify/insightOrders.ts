import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { shopifyApiBase } from "@/integrations/_shared/shopify/api/_base";
import { NotFoundError, surfaceShopifyError } from "@/integrations/_shared/shopify/errors";
import { majorUnitsToMinor } from "@/core/analytics/money";
import { ShopifyRateLimitError, nextPageInfo } from "./api";

/**
 * Bounded, READ-ONLY Shopify order-window scanner for the CONNECTED Custom
 * Insights dataset (ANALYTICS-CONNECTED-DATA-CD-4C).
 *
 * Deliberately SEPARATE from the fixed-widget scanner in `./api.ts`: that
 * projection is pinned by the shipped fixed Shopify widgets (4 fields, floats,
 * test orders included), and changing it would silently change production
 * charts. This scanner requests the richer field set the insights dataset
 * certified — fulfillment status, cancellation, the test-order marker — and
 * converts money to integer minor units at the boundary.
 *
 * PRIVACY: the request pins `fields=` so Shopify returns only what the facts
 * need. Each order is projected to a transient, non-identifying fact — no
 * order id/name/number, customer, email, product, line item, address, note,
 * discount code or raw payload is ever read into a fact, so none can reach an
 * aggregate, the snapshot cache, or the browser.
 *
 * SAFETY — bounded to prevent an unbounded order scan: a HARD page cap
 * (`MAX_PAGES` × `PAGE_SIZE`). Past the cap we stop and report
 * `truncated: true` so the aggregation marks the result `scan_capped`.
 *
 * ORDERING / SCAN BIAS (live-certified): the first page pins
 * `order=created_at desc` explicitly — certification proved Shopify accepts it
 * together with `page_info` follow-up pages, pages without duplicates or
 * skips, and terminates with a missing next-cursor. A capped scan therefore
 * reflects the NEWEST-created orders in the window.
 */

/** Shopify orders.json max page size. */
export const INSIGHT_PAGE_SIZE = 250;
/** ≤ 10 pages = 2,500 orders per window scan before truncation. */
export const INSIGHT_MAX_PAGES = 10;

/**
 * Minor-unit SCALE used when Shopify reports no currency. Scale only — never a
 * label: a fact with `currency: null` produces a result with no
 * `valueMeta.currency`, so it renders as a plain number, never as dollars.
 * (Live certification observed ISO currency on every order; this is the
 * defensive path.)
 */
export const FALLBACK_SCALE_CURRENCY = "usd";

/** Transient, non-identifying projection of one order. Never cached/returned. */
export interface ShopifyOrderFact {
  /** created_at epoch ms; null when absent/unparseable. */
  createdMs: number | null;
  /** Order total in integer minor units; null when the amount was unreadable. */
  totalMinor: number | null;
  /** Lowercase ISO currency code, or null when Shopify reported none. */
  currency: string | null;
  /** Raw lowercase financial_status, or null when absent (normalized later). */
  financialStatus: string | null;
  /** Raw lowercase fulfillment_status, or null (= unfulfilled; normalized later). */
  fulfillmentStatus: string | null;
  /** True when cancelled_at is set. */
  cancelled: boolean;
  /** Shopify's test-order marker (Bogus gateway / test mode). */
  test: boolean;
}

export interface ShopifyOrderScanResult {
  facts: ShopifyOrderFact[];
  /** True when the window held more orders than the page cap allows. */
  truncated: boolean;
  /** Orders whose total_price could not be read as a decimal amount. */
  malformedAmounts: number;
}

export interface ShopifyOrderScanInput {
  /** Inclusive lower bound on created_at (ISO-8601). */
  sinceIso: string;
  /** Inclusive upper bound on created_at (ISO-8601) — pass toMs-1ms for [from, to). */
  untilIso: string;
  maxPages?: number;
}

const FIELDS =
  "created_at,total_price,currency,financial_status,fulfillment_status,cancelled_at,test";

interface RawOrder {
  created_at?: unknown;
  total_price?: unknown;
  currency?: unknown;
  financial_status?: unknown;
  fulfillment_status?: unknown;
  cancelled_at?: unknown;
  test?: unknown;
}

function parseMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function lower(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value.toLowerCase() : null;
}

/**
 * Shopify money arrives as a MAJOR-unit decimal string ("362.07"). Parse it
 * and convert to exact integer minor units in one step; anything unreadable is
 * null (excluded from money measures with a warning), never coerced to 0 —
 * a silent 0 would understate a merchant's total.
 */
function parseTotalMinor(value: unknown, currency: string | null): number | null {
  if (typeof value !== "string" || !/^-?\d+(\.\d+)?$/.test(value.trim())) return null;
  const major = Number.parseFloat(value);
  if (!Number.isFinite(major)) return null;
  return majorUnitsToMinor(major, currency ?? FALLBACK_SCALE_CURRENCY);
}

function project(raw: RawOrder): { fact: ShopifyOrderFact; malformed: boolean } {
  const currency = lower(raw.currency);
  const totalMinor = parseTotalMinor(raw.total_price, currency);
  return {
    fact: {
      createdMs: parseMs(raw.created_at),
      totalMinor,
      currency,
      financialStatus: lower(raw.financial_status),
      fulfillmentStatus: lower(raw.fulfillment_status),
      cancelled: typeof raw.cancelled_at === "string" && raw.cancelled_at.length > 0,
      test: raw.test === true,
    },
    malformed: totalMinor === null && raw.total_price !== undefined,
  };
}

/** Same auth + error mapping as the fixed scanner; keeps the Link header. */
async function fetchPage(
  url: string,
  accessToken: string,
): Promise<{ orders: RawOrder[]; link: string | null }> {
  const res = await fetch(url, {
    method: "GET",
    headers: { "X-Shopify-Access-Token": accessToken, Accept: "application/json" },
  });
  if (res.status === 401) {
    throw new Unauthorized401Error("Shopify GET /orders.json returned HTTP 401");
  }
  if (res.status === 429) {
    throw new ShopifyRateLimitError("Shopify GET /orders.json rate-limited (HTTP 429)");
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError("orders", surfaceShopifyError(text, 404));
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shopify GET /orders.json failed: ${surfaceShopifyError(text, res.status)}`);
  }
  const data = (await res.json()) as { orders?: RawOrder[] };
  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    link: res.headers.get("link"),
  };
}

/**
 * Page `/orders.json` over the window, newest-created first, projecting each
 * order to a {@link ShopifyOrderFact}. Exact under the cap; `truncated: true`
 * beyond it. Throws `Unauthorized401Error` (→ refreshAndRetry),
 * `ShopifyRateLimitError`, `NotFoundError` or a generic `Error` — the adapter
 * classifies them.
 *
 * Cursor rules (live-certified): the FIRST request carries the filters and the
 * explicit sort; follow-ups carry ONLY `limit`/`page_info`/`fields` (Shopify
 * rejects other params alongside `page_info`, which preserves the sort).
 */
export async function scanOrderFactsWindow(
  shopDomain: string,
  accessToken: string,
  input: ShopifyOrderScanInput,
): Promise<ShopifyOrderScanResult> {
  const maxPages = input.maxPages ?? INSIGHT_MAX_PAGES;
  const base = shopifyApiBase(shopDomain);
  const facts: ShopifyOrderFact[] = [];
  let malformedAmounts = 0;

  const first = new URLSearchParams({
    status: "any",
    order: "created_at desc",
    created_at_min: input.sinceIso,
    created_at_max: input.untilIso,
    limit: String(INSIGHT_PAGE_SIZE),
    fields: FIELDS,
  });
  let url: string | null = `${base}/orders.json?${first.toString()}`;

  for (let page = 0; page < maxPages; page++) {
    const { orders, link }: { orders: RawOrder[]; link: string | null } =
      await fetchPage(url, accessToken);
    for (const raw of orders) {
      const { fact, malformed } = project(raw);
      facts.push(fact);
      if (malformed) malformedAmounts += 1;
    }

    const cursor = nextPageInfo(link);
    if (!cursor || orders.length === 0) {
      return { facts, truncated: false, malformedAmounts };
    }
    if (page === maxPages - 1) return { facts, truncated: true, malformedAmounts };

    const next = new URLSearchParams({
      limit: String(INSIGHT_PAGE_SIZE),
      page_info: cursor,
      fields: FIELDS,
    });
    url = `${base}/orders.json?${next.toString()}`;
  }

  return { facts, truncated: false, malformedAmounts };
}
