import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { shopifyApiBase } from "@/integrations/_shared/shopify/api/_base";
import { NotFoundError, surfaceShopifyError } from "@/integrations/_shared/shopify/errors";

/**
 * Bounded, READ-ONLY Shopify order-window scanner for the analytics source
 * (Slice ANALYTICS-SOURCES-SHOPIFY-1). Mirrors the Stripe charge-window scanner.
 *
 * PRIVACY: the request sets `fields=created_at,total_price,financial_status,currency`
 * so Shopify returns ONLY those four fields per order; each order is projected to a
 * transient {@link OrderFact}. No customer, email, line items, addresses, note,
 * order id / name / number, or raw payload is ever read into a fact, returned, or
 * cached. The adapter reduces facts to numeric aggregates and ONLY those are cached.
 *
 * Why a self-contained reader (not the shared `shopifyRequest` wrapper): Shopify
 * Admin REST uses cursor pagination via the `Link` response header, which
 * `shopifyRequest` discards (it returns parsed JSON only). This reader reads the
 * `Link` header to page, while keeping the same `X-Shopify-Access-Token` auth +
 * 401→Unauthorized401Error mapping. The shop domain is sourced from the integration
 * row's `providerAccountId` (never widget config) and the only query inputs are the
 * server-built date window + fixed `fields`/`status`.
 *
 * SAFETY — bounded to prevent an unbounded order scan: a HARD page cap
 * ({@link MAX_PAGES} × {@link PAGE_SIZE}). Past the cap we stop and report
 * `truncated: true` rather than walking the whole order history.
 */

export const PAGE_SIZE = 250; // Shopify orders.json max limit.
/** ≤ 10 pages = 2500 orders per window scan before truncation. */
export const MAX_PAGES = 10;

/** Thrown on HTTP 429 so the adapter can map it to RATE_LIMITED. */
export class ShopifyRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopifyRateLimitError";
  }
}

/** Transient, non-identifying projection of one order. Never cached/returned to client. */
export interface OrderFact {
  /** created_at epoch ms (null when absent/unparseable). */
  createdMs: number | null;
  /** Order total in major units (parsed from total_price; 0 when absent/unparseable). */
  amount: number;
  /** Lowercase financial_status ("paid" | "pending" | "refunded" | …; "" when absent). */
  status: string;
  /** Lowercase ISO currency code ("" when absent). */
  currency: string;
}

export interface OrderScanResult {
  facts: OrderFact[];
  /** True when there were more orders in the window than the page cap. */
  truncated: boolean;
}

export interface OrderScanInput {
  /** Inclusive lower bound on created_at (ISO-8601). */
  sinceIso: string;
  /** Exclusive upper bound on created_at (ISO-8601). */
  untilIso: string;
  maxPages?: number;
}

interface RawOrder {
  created_at?: unknown;
  total_price?: unknown;
  financial_status?: unknown;
  currency?: unknown;
}

function parseMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function parseAmount(value: unknown): number {
  if (typeof value !== "string") return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function project(raw: RawOrder): OrderFact {
  return {
    createdMs: parseMs(raw.created_at),
    amount: parseAmount(raw.total_price),
    status: typeof raw.financial_status === "string" ? raw.financial_status.toLowerCase() : "",
    currency: typeof raw.currency === "string" ? raw.currency.toLowerCase() : "",
  };
}

/** Pull the `page_info` cursor from a Shopify `Link` header's rel="next", or null. */
export function nextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    if (!/rel="next"/.test(part)) continue;
    const urlMatch = part.match(/<([^>]+)>/);
    if (!urlMatch) continue;
    const pi = urlMatch[1]!.match(/[?&]page_info=([^&]+)/);
    if (pi) return decodeURIComponent(pi[1]!);
  }
  return null;
}

const FIELDS = "created_at,total_price,financial_status,currency";

async function fetchOrdersPage(
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
  return { orders: Array.isArray(data.orders) ? data.orders : [], link: res.headers.get("link") };
}

/**
 * Page `/orders.json` over `[sinceIso, untilIso)`, projecting each order to an
 * {@link OrderFact}. Exact under the cap; `truncated: true` beyond it. Throws
 * `Unauthorized401Error` (→ refreshAndRetry) / `ShopifyRateLimitError` /
 * `NotFoundError` / generic `Error`; the adapter classifies them.
 *
 * Shopify cursor pagination: the FIRST request carries the filters
 * (`status`/`created_at_*`/`fields`); follow-up requests carry ONLY
 * `limit`/`page_info`/`fields` (Shopify rejects other params alongside page_info).
 */
export async function scanOrdersWindow(
  shopDomain: string,
  accessToken: string,
  input: OrderScanInput,
): Promise<OrderScanResult> {
  const maxPages = input.maxPages ?? MAX_PAGES;
  const base = shopifyApiBase(shopDomain);
  const facts: OrderFact[] = [];

  const first = new URLSearchParams({
    status: "any",
    created_at_min: input.sinceIso,
    created_at_max: input.untilIso,
    limit: String(PAGE_SIZE),
    fields: FIELDS,
  });
  let url: string | null = `${base}/orders.json?${first.toString()}`;

  for (let page = 0; page < maxPages; page++) {
    const { orders, link }: { orders: RawOrder[]; link: string | null } = await fetchOrdersPage(url, accessToken);
    for (const raw of orders) facts.push(project(raw));

    const cursor = nextPageInfo(link);
    if (!cursor || orders.length === 0) return { facts, truncated: false };
    if (page === maxPages - 1) return { facts, truncated: true };

    // Follow-up pages: page_info + limit + fields ONLY (Shopify rejects other params).
    const next = new URLSearchParams({ limit: String(PAGE_SIZE), page_info: cursor, fields: FIELDS });
    url = `${base}/orders.json?${next.toString()}`;
  }

  return { facts, truncated: false };
}
