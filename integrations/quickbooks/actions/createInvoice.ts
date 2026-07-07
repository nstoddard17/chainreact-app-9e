import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { invoiceCreate } from "@/integrations/_shared/quickbooks/api/invoices";
import { resolveRealm } from "./_resolveRealm";
import { CreateInvoiceConfigSchema } from "./createInvoice.schema";

/**
 * QuickBooks `create_invoice` action handler — QUICKBOOKS-1.
 *
 * `POST /v3/company/{realmId}/invoice` via the typed wrapper under
 * `refreshAndRetry`. Creates a DRAFT invoice — this action NEVER emails
 * the customer; sending is the separate, explicitly-labeled
 * `send_invoice` action.
 *
 * Only user-configured fields are sent (no hidden defaults, no invented
 * tax values, no item auto-creation). Output is the shared bounded
 * invoice projection.
 */
export const createInvoice: ActionHandler = async (input) => {
  const config = CreateInvoiceConfigSchema.parse(input.config);
  const { realmId, providerAccountId } = await resolveRealm(input);

  const invoice = await refreshAndRetry({
    accountId: input.accountId,
    provider: "quickbooks",
    providerAccountId,
    apiCall: (accessToken) =>
      invoiceCreate({
        accessToken,
        realmId,
        customerId: config.customerId,
        lines: config.lineItems.map((line) => ({
          itemId: line.itemId,
          amount: line.amount,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          description: line.description,
          taxCodeId: line.taxCodeId,
        })),
        txnDate: config.txnDate,
        dueDate: config.dueDate,
        termId: config.termId,
        customerEmail: config.customerEmail,
        customerMemo: config.customerMemo,
        privateNote: config.privateNote,
        globalTaxCalculation: config.globalTaxCalculation,
      }),
  });

  return { output: { ...invoice } };
};
