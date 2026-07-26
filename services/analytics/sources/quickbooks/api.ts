import { invoiceList } from "@/integrations/_shared/quickbooks/api/invoices";
import { majorUnitsToMinor } from "@/core/analytics/money";

/**
 * Bounded, READ-ONLY QuickBooks invoice-window scanner for the connected
 * analytics dataset (ANALYTICS-CONNECTED-DATA-CD-4B). Reuses the shipped
 * `invoiceList` wrapper — same Intuit query endpoint, same realm scoping, same
 * 401 → Unauthorized401Error mapping as the QuickBooks action handlers. No new
 * endpoint, no new scope, no write of any kind.
 *
 * PRIVACY: each invoice is projected to a transient FACT carrying only what
 * the measures need — transaction date, money as integer minor units, ISO
 * currency, and an OPAQUE per-account customer key plus its display label. The
 * invoice id, doc number, customer id, bill-to email, memo, private note and
 * line items are read into memory by the wrapper and then DROPPED here: they
 * never reach a fact, so they can never reach an aggregate, the snapshot
 * cache, or the browser. Facts are transient (one query) — only numeric
 * aggregates are cached.
 *
 * SAFETY — bounded to prevent an unbounded ledger scan: a HARD page cap
 * (`MAX_PAGES` × `PAGE_SIZE`). Past the cap we stop and report
 * `truncated: true` so the aggregation layer can mark the result
 * `scan_capped` rather than walking a whole company's invoice history.
 *
 * ORDERING / SCAN BIAS (live-certified): the wrapper orders by
 * `MetaData.CreateTime DESC`. Live certification observed 37/37 invoices
 * walked over 13 pages with zero duplicates, zero skips, a monotonically
 * non-increasing CreateTime and no tied CreateTime values — a tie-free sort
 * key is what makes QuickBooks' STARTPOSITION offset paging stable. Sorting by
 * TxnDate instead would tie heavily (12 distinct dates across 37 invoices) and
 * could shift rows between pages. The cost is an honest, documented bias: when
 * the cap is hit the result reflects the most recently CREATED invoices in the
 * window, which is not necessarily the most recent invoice DATES.
 */

/**
 * Minor-unit SCALE used when QuickBooks reports no currency at all. It is a
 * scale only — never a label: a fact with `currency: null` produces a result
 * with no `valueMeta.currency`, so the value renders as a plain number rather
 * than as dollars. The aggregation layer converts back with this same scale,
 * so the round-trip is exact. (Live certification found CurrencyRef present on
 * 25/25 invoices even with MultiCurrency disabled, so this is a defensive
 * path, not the normal one.)
 */
export const FALLBACK_SCALE_CURRENCY = "usd";

/** V2 page bound (QuickBooks' own MAXRESULTS ceiling is 1000). */
export const PAGE_SIZE = 100;
/** ≤ 20 pages = 2,000 invoices per window scan before truncation. */
export const MAX_PAGES = 20;

/** Transient, non-identifying projection of one invoice. Never cached/returned. */
export interface InvoiceFact {
  /** Invoice transaction date, `YYYY-MM-DD` (QuickBooks TxnDate). */
  txnDate: string | null;
  /** Original invoice total in integer minor units; null when unusable. */
  totalMinor: number | null;
  /** Balance still owed at query time, integer minor units; null when unusable. */
  balanceMinor: number | null;
  /** Lowercase ISO currency code, or null when QuickBooks reported none. */
  currency: string | null;
  /** Opaque, per-account-stable customer key — never the QuickBooks id. */
  customerKey: string | null;
  /** Customer display name for chart labels (no email/address/memo). */
  customerLabel: string | null;
}

export interface InvoiceScanResult {
  facts: InvoiceFact[];
  /** True when the window held more invoices than the page cap allows. */
  truncated: boolean;
  /** Invoices dropped because neither money field was usable. */
  malformed: number;
}

export interface InvoiceScanInput {
  realmId: string;
  /** Inclusive TxnDate lower bound, `YYYY-MM-DD`. */
  dateFrom: string;
  /** Inclusive TxnDate upper bound, `YYYY-MM-DD`. */
  dateTo: string;
  /**
   * Optional server-side single-customer predicate (`CustomerRef = '…'`,
   * live-certified). The id is used ONLY to build the predicate — it never
   * enters a fact.
   */
  customerId?: string;
  /** Maps a QuickBooks customer id to the opaque per-account key. */
  customerKeyOf: (customerId: string) => string;
  maxPages?: number;
}

/**
 * Page `select * from Invoice where TxnDate >= … and TxnDate <= …` over the
 * window, projecting each invoice to an {@link InvoiceFact}. Exact under the
 * cap; `truncated: true` beyond it. Throws `Unauthorized401Error`
 * (→ refreshAndRetry) or a QuickBooks API error (→ the adapter classifies it).
 */
export async function scanInvoiceWindow(
  accessToken: string,
  input: InvoiceScanInput,
): Promise<InvoiceScanResult> {
  const maxPages = input.maxPages ?? MAX_PAGES;
  const facts: InvoiceFact[] = [];
  let malformed = 0;
  let startPosition = 1;

  for (let page = 0; page < maxPages; page++) {
    const res = await invoiceList({
      accessToken,
      realmId: input.realmId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      maxResults: PAGE_SIZE,
      startPosition,
      ...(input.customerId ? { customerId: input.customerId } : {}),
    });

    for (const inv of res.items) {
      // QuickBooks reports money as MAJOR-unit decimals; convert to integer
      // minor units at the boundary so nothing downstream ever accumulates a
      // binary float. Currency drives the scale, so it is resolved first.
      const currency = inv.currency ? inv.currency.toLowerCase() : null;
      const scaleCurrency = currency ?? FALLBACK_SCALE_CURRENCY;
      const totalMinor =
        inv.totalAmount === null ? null : majorUnitsToMinor(inv.totalAmount, scaleCurrency);
      const balanceMinor =
        inv.balance === null ? null : majorUnitsToMinor(inv.balance, scaleCurrency);
      if (totalMinor === null && balanceMinor === null) {
        malformed += 1;
        continue;
      }
      facts.push({
        txnDate: inv.txnDate,
        totalMinor,
        balanceMinor,
        currency,
        customerKey: inv.customerId ? input.customerKeyOf(inv.customerId) : null,
        customerLabel: inv.customerName,
      });
    }

    // QuickBooks' query response carries no total, so a SHORT PAGE is the only
    // honest end-of-results signal (live-certified: page 13 of 13 was short).
    if (!res.hasMore || res.items.length === 0) {
      return { facts, truncated: false, malformed };
    }
    startPosition = res.nextStartPosition;
    if (page === maxPages - 1) return { facts, truncated: true, malformed };
  }

  return { facts, truncated: false, malformed };
}
