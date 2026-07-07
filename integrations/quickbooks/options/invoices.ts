import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { invoiceList } from "@/integrations/_shared/quickbooks/api/invoices";
import {
  mapQuickbooksOptionsError,
  requireQuickbooksIntegration,
} from "./_shared";

/**
 * `quickbooks:invoices` options resolver — QUICKBOOKS-1.
 *
 * Backs the invoice pickers on send_invoice / get_invoice. The newest
 * 50 invoices (a picker is for recent work — older invoices are
 * reached by mapping an id via allowManualEntry). Labels are
 * `#DocNumber · CustomerName` — deliberately NO amounts, balances, or
 * emails in labels. `ctx.q` filters locally; creation order (newest
 * first) is preserved rather than alpha-sorted.
 */
const PAGE_SIZE = 50;

export const quickbooksInvoicesResolver: OptionsResolver = {
  source: "quickbooks:invoices",
  provider: "quickbooks",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireQuickbooksIntegration(ctx);

    let page;
    try {
      page = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "quickbooks",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          invoiceList({
            accessToken,
            realmId: integration.providerAccountId,
            maxResults: PAGE_SIZE,
          }),
      });
    } catch (err) {
      mapQuickbooksOptionsError(err, "invoices");
    }

    const items: OptionItem[] = [];
    for (const invoice of page.items) {
      if (!invoice.invoiceId) continue;
      const docLabel = invoice.docNumber ? `#${invoice.docNumber}` : `id ${invoice.invoiceId}`;
      items.push({
        value: invoice.invoiceId,
        label: invoice.customerName
          ? `${docLabel} · ${invoice.customerName}`
          : docLabel,
      });
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: page.hasMore };
  },
};
