import { chargesList } from "@/integrations/stripe/api/charges";

/**
 * Bounded, READ-ONLY Stripe charge-window scanner for the analytics source
 * (Slice ANALYTICS-SOURCES-STRIPE-1). Reuses the shared `/v1/charges` wrapper
 * (same Bearer auth + 401→Unauthorized401Error mapping as the Stripe handlers),
 * scoped to a `created[gte..lte]` window.
 *
 * PRIVACY: each charge is projected to a transient 4-field FACT
 * `{ created, status, amount, currency }` — the minimum needed to count payments
 * and sum volume. The charge `id` is read ONLY to advance Stripe's pagination
 * cursor and is never placed in a fact or returned. Customer ids, descriptions,
 * receipts, payment-intent ids, card detail, metadata, and the raw payload are
 * never read into a fact. The facts are transient (in-memory for one query) — the
 * adapter reduces them to numeric aggregates and ONLY those aggregates are cached.
 *
 * SAFETY — bounded to prevent an unbounded ledger scan: a HARD page cap
 * (`MAX_PAGES` × {@link PAGE_SIZE}). Past the cap we stop and report
 * `truncated: true` (counts/volume become "at least") rather than walking the
 * whole charge history.
 */

export const PAGE_SIZE = 100;
/** ≤ 20 pages = 2000 charges per window scan before truncation. */
export const MAX_PAGES = 20;

/** Transient, non-identifying projection of one charge. Never cached/returned to client. */
export interface ChargeFact {
  /** Charge creation time, Unix seconds. */
  created: number;
  /** Stripe charge status (`succeeded` | `pending` | `failed`). */
  status: string;
  /** Amount in the currency's minor unit. */
  amount: number;
  /** Lowercase ISO currency code. */
  currency: string;
}

export interface WindowScanResult {
  facts: ChargeFact[];
  /** True when there were more charges in the window than the page cap. */
  truncated: boolean;
}

export interface WindowScanInput {
  /** Inclusive lower bound on `created`, Unix seconds. */
  gteSec: number;
  /** Inclusive upper bound on `created`, Unix seconds. */
  lteSec: number;
  maxPages?: number;
}

/**
 * Page `/v1/charges` over `[gteSec, lteSec]`, projecting each charge to a
 * {@link ChargeFact}. Exact under the cap; `truncated: true` beyond it. Throws
 * `Unauthorized401Error` (→ refreshAndRetry) / generic `Error` (→ adapter classifies).
 */
export async function scanChargesWindow(
  accessToken: string,
  input: WindowScanInput,
): Promise<WindowScanResult> {
  const maxPages = input.maxPages ?? MAX_PAGES;
  const facts: ChargeFact[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const res = await chargesList({
      accessToken,
      createdGte: input.gteSec,
      createdLte: input.lteSec,
      limit: PAGE_SIZE,
      ...(startingAfter ? { startingAfter } : {}),
    });

    for (const c of res.data) {
      facts.push({ created: c.created, status: c.status, amount: c.amount, currency: c.currency });
    }

    if (!res.has_more || res.data.length === 0) return { facts, truncated: false };
    // `id` is used ONLY as the opaque pagination cursor — never stored in a fact.
    startingAfter = res.data[res.data.length - 1]!.id;
    if (page === maxPages - 1) return { facts, truncated: true };
  }

  return { facts, truncated: false };
}
