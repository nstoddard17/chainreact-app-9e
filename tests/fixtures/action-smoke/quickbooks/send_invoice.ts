import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * quickbooks:send_invoice (writeSafe via env-pinned destination,
 * artifact left) — the ONLY customer-facing QuickBooks smoke. Sends a
 * freshly-created crsmoke- DRAFT invoice to the OWNER-CONTROLLED smoke
 * mailbox (SMOKE_QUICKBOOKS_SEND_TO — never a real customer address),
 * proven via an independent read-back of the persisted EmailStatus.
 *
 *   setup    create_invoice -> own marked $1 draft against the smoke
 *            customer/item (same shape as the create_invoice fixture).
 *            Capture { invoiceId } into ledger key "invoice".
 *   execute  send_invoice -> invoiceId {{ledger.invoice.id}}, sendTo
 *            {{env.SMOKE_QUICKBOOKS_SEND_TO}} (env-pinned safe
 *            destination — the Outlook send-to-SELF precedent).
 *   verify   get_invoice (SMOKE READ-BACK) -> expect the PERSISTED
 *            EmailStatus to be EmailSent; markerPath proves the setup
 *            marker on the private note (same invoice).
 *
 * DISPOSITION: none. No registered void/delete -> marked sent $1
 * sandbox invoice stays; the email lands only in the smoke mailbox.
 */
export default defineWriteSmokeFixture({
  provider: "quickbooks",
  action: "send_invoice",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    invoiceId: "{{ledger.invoice.id}}",
    sendTo: "{{env.SMOKE_QUICKBOOKS_SEND_TO}}",
  },
  requiredEnv: [
    "SMOKE_QUICKBOOKS_CONNECTED",
    "SMOKE_QUICKBOOKS_CUSTOMER_ID",
    "SMOKE_QUICKBOOKS_ITEM_ID",
    "SMOKE_QUICKBOOKS_SEND_TO",
  ],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "quickbooks",
        action: "create_invoice",
        config: {
          customerId: "{{env.SMOKE_QUICKBOOKS_CUSTOMER_ID}}",
          lineItems: [
            {
              itemId: "{{env.SMOKE_QUICKBOOKS_ITEM_ID}}",
              amount: 1,
              description: "{{smokeMarker}}send line - safe to ignore",
            },
          ],
          privateNote: "{{smokeMarker}}send invoice - safe to ignore",
        },
        captureResource: {
          resourceKey: "invoice",
          idPath: "invoiceId",
          kind: "invoice",
        },
      },
    ],
    verify: {
      provider: "quickbooks",
      action: "get_invoice",
      config: { invoiceId: "{{ledger.invoice.id}}" },
      smokeRead: true,
      markerPath: "invoice.privateNote",
      expectEquals: { path: "invoice.emailStatus", value: "EmailSent" },
    },
    // No cleanup: no registered invoice void/delete -> marked sent $1
    // sandbox artifact left; the email went to the env-pinned smoke
    // mailbox only.
  },
  notes:
    "setup creates an own marked $1 draft -> send_invoice emails it to the " +
    "env-pinned SMOKE mailbox (never a customer) -> get_invoice read-back " +
    "proves EmailStatus=EmailSent + the persisted marker. writeSafe " +
    "(env-pinned destination); marked sent sandbox invoice artifact left.",
});
