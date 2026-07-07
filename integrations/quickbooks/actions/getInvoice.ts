import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { invoiceGet } from "@/integrations/_shared/quickbooks/api/invoices";
import { resolveRealm } from "./_resolveRealm";
import { GetInvoiceConfigSchema } from "./getInvoice.schema";

/**
 * QuickBooks `get_invoice` action handler — QUICKBOOKS-1.
 *
 * `GET /v3/company/{realmId}/invoice/{id}` via the typed wrapper under
 * `refreshAndRetry`. Friendly not-found: an unknown id returns
 * `{ found: false, invoice: null }` — it does NOT throw, so workflows
 * can branch on `found` (e.g. after a deletion in QuickBooks).
 */
export const getInvoice: ActionHandler = async (input) => {
  const config = GetInvoiceConfigSchema.parse(input.config);
  const { realmId, providerAccountId } = await resolveRealm(input);

  const invoice = await refreshAndRetry({
    accountId: input.accountId,
    provider: "quickbooks",
    providerAccountId,
    apiCall: (accessToken) =>
      invoiceGet({
        accessToken,
        realmId,
        invoiceId: config.invoiceId,
      }),
  });

  if (invoice === null) {
    return { output: { found: false, invoice: null } };
  }
  return { output: { found: true, invoice } };
};
