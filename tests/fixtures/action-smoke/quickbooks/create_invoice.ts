import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * quickbooks:create_invoice (writeSafe, artifact left) — create a
 * deterministic crsmoke- DRAFT invoice in the SANDBOX company (one line
 * against the env-pinned smoke item, explicit $1 amount, marker private
 * note; NO billing email so nothing could ever be sent), proven via an
 * independent per-invoice read-back.
 *
 *   execute  create_invoice -> CustomerRef from
 *            SMOKE_QUICKBOOKS_CUSTOMER_ID, one SalesItemLine against
 *            {{env.SMOKE_QUICKBOOKS_ITEM_ID}} with Amount 1. Capture
 *            { invoiceId } into ledger key "invoice". markerEchoPath
 *            proves the echoed private note.
 *   verify   get_invoice (SMOKE READ-BACK) -> GET invoice/{id};
 *            markerPath proves the marker on the PERSISTED private note.
 *
 * DISPOSITION: none. V2 registers no invoice void/delete (explicit
 * QUICKBOOKS-1 exclusion) -> marked DRAFT invoice stays in the sandbox
 * company (harmless: draft, unsent, $1, disposable sandbox).
 */
export default defineWriteSmokeFixture({
  provider: "quickbooks",
  action: "create_invoice",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    lineItems: [
      {
        itemId: "{{env.SMOKE_QUICKBOOKS_ITEM_ID}}",
        amount: 1,
        description: "{{smokeMarker}}line - safe to ignore",
      },
    ],
    privateNote: "{{smokeMarker}}invoice - safe to ignore",
  },
  configFromEnv: {
    customerId: "SMOKE_QUICKBOOKS_CUSTOMER_ID",
  },
  requiredEnv: [
    "SMOKE_QUICKBOOKS_CONNECTED",
    "SMOKE_QUICKBOOKS_CUSTOMER_ID",
    "SMOKE_QUICKBOOKS_ITEM_ID",
  ],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: {
      resourceKey: "invoice",
      idPath: "invoiceId",
      kind: "invoice",
    },
    markerEchoPath: "privateNote",
    verify: {
      provider: "quickbooks",
      action: "get_invoice",
      config: { invoiceId: "{{ledger.invoice.id}}" },
      smokeRead: true,
      markerPath: "invoice.privateNote",
    },
    // No cleanup: no registered invoice void/delete -> marked DRAFT
    // sandbox artifact left (unsent, $1).
  },
  notes:
    "create_invoice DRAFT (env-pinned smoke customer + item, explicit $1 line, " +
    "marker private note, NO billing email) -> get_invoice read-back proves the " +
    "persisted marker. writeSafe; marked draft sandbox invoice artifact left " +
    "(no registered void/delete).",
});
