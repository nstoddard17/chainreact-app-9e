import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { invoiceList } from "@/integrations/_shared/quickbooks/api/invoices";
import { resolveRealm } from "./_resolveRealm";
import { ListInvoicesConfigSchema } from "./listInvoices.schema";

/** One bounded page per run; QBO's own max is 1000 — V2 caps at 100. */
const DEFAULT_PAGE_SIZE = 25;

/**
 * QuickBooks `list_invoices` action handler — QUICKBOOKS-1.
 *
 * One bounded page of invoices per run via the query wrapper (fixed
 * predicates only — customer + TxnDate range, AND-joined; user input is
 * escaped server-side and NEVER becomes a raw query). Newest first.
 * Offset pagination (`startPosition`, 1-based) because QBO has no
 * cursors; `hasMore` is the honest full-page signal (the query
 * response carries no total count).
 */
export const listInvoices: ActionHandler = async (input) => {
  const config = ListInvoicesConfigSchema.parse(input.config);
  const { realmId, providerAccountId } = await resolveRealm(input);

  const page = await refreshAndRetry({
    accountId: input.accountId,
    provider: "quickbooks",
    providerAccountId,
    apiCall: (accessToken) =>
      invoiceList({
        accessToken,
        realmId,
        customerId: config.customerId,
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        maxResults: config.pageSize ?? DEFAULT_PAGE_SIZE,
        startPosition: config.startPosition,
      }),
  });

  return {
    output: {
      invoices: page.items,
      count: page.items.length,
      hasMore: page.hasMore,
      nextStartPosition: page.hasMore ? page.nextStartPosition : null,
    },
  };
};
