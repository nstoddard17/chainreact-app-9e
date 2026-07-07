import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { invoiceSend } from "@/integrations/_shared/quickbooks/api/invoices";
import { resolveRealm } from "./_resolveRealm";
import { SendInvoiceConfigSchema } from "./sendInvoice.schema";

/**
 * QuickBooks `send_invoice` action handler — QUICKBOOKS-1.
 *
 * `POST /v3/company/{realmId}/invoice/{id}/send[?sendTo]` via the typed
 * wrapper under `refreshAndRetry`. CUSTOMER-FACING: QuickBooks emails
 * the invoice — deliberately a separate action from create_invoice so a
 * workflow can never email by accident. V2 never invents a recipient:
 * without `sendTo`, QuickBooks uses the invoice's stored billing email
 * and fails with its own error when none exists.
 *
 * Output is the updated bounded invoice projection (`emailStatus`
 * flips to `EmailSent`).
 */
export const sendInvoice: ActionHandler = async (input) => {
  const config = SendInvoiceConfigSchema.parse(input.config);
  const { realmId, providerAccountId } = await resolveRealm(input);

  const invoice = await refreshAndRetry({
    accountId: input.accountId,
    provider: "quickbooks",
    providerAccountId,
    apiCall: (accessToken) =>
      invoiceSend({
        accessToken,
        realmId,
        invoiceId: config.invoiceId,
        sendTo: config.sendTo,
      }),
  });

  return { output: { ...invoice } };
};
