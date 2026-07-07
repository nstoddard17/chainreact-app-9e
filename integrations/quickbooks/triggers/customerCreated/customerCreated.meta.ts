import type { TriggerMeta } from "@/contracts/triggerMeta";
import {
  QUICKBOOKS_CUSTOMER_PAYLOAD,
  quickbooksEventPrefix,
} from "../_shared/payloadShapes";

/**
 * Builder-facing metadata for `quickbooks:customer_created` —
 * QUICKBOOKS-1.
 *
 * App-level webhook (Intuit portal-configured; activation stores an
 * internal trigger-interest row only). Fired from Customer+Create
 * events after post-fetch enrichment — the payload is the full bounded
 * customer projection, not Intuit's compact event. No config fields:
 * the watched company is the connected integration's realm, stamped at
 * activation.
 */
export const quickbooksCustomerCreatedTriggerMeta: TriggerMeta = {
  key: "quickbooks:customer_created",
  provider: "quickbooks",
  type: "customer_created",
  displayName: "Customer Created",
  description:
    "Fires when a customer is created in the connected QuickBooks company. The event carries the full customer record (name, contact details, balance).",
  category: "commerce",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [
    ...quickbooksEventPrefix("customer_created"),
    ...QUICKBOOKS_CUSTOMER_PAYLOAD,
  ],
  displayOrder: 10,
};
