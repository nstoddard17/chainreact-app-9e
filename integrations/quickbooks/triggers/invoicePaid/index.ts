import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import {
  quickbooksAppLevelActivate,
  quickbooksAppLevelDeactivate,
} from "../_shared/lifecycle";
import { makeQuickbooksRealmFilter } from "../_shared/filter";

/**
 * Module-init registration for `quickbooks:invoice_paid` —
 * QUICKBOOKS-1. Same app-level lifecycle + realm filter as
 * customer_created; the paid DERIVATION (payment → linked invoices →
 * balance check) lives in `integrations/quickbooks/webhooks/enrich.ts`,
 * not here.
 */
registerActivation("quickbooks", "invoice_paid", quickbooksAppLevelActivate);
registerDeactivation(
  "quickbooks",
  "invoice_paid",
  quickbooksAppLevelDeactivate,
);
export const quickbooksInvoicePaidFilter =
  makeQuickbooksRealmFilter("invoice_paid");
registerTriggerFilter(quickbooksInvoicePaidFilter);

export {
  quickbooksAppLevelActivate as activate,
  quickbooksAppLevelDeactivate as deactivate,
};
