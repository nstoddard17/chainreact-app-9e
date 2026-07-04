import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * shopify:create_customer (writeSafe, artifact left) — create a deterministic
 * crsmoke- customer (run-unique synthetic email, welcome email EXPLICITLY off),
 * proven via an independent per-customer read.
 *
 *   execute  create_customer -> email "{{smokeMarker}}cust@example.com" (the
 *            run token makes it unique; example.com is reserved and
 *            non-deliverable, and send_welcome_email:false means Shopify sends
 *            nothing regardless — Q11 consent gate explicit). Capture
 *            { customerId } into ledger key "customer". markerEchoPath proves
 *            the stored email.
 *   verify   customer_state (SMOKE READ-BACK) -> GET customers/{id};
 *            markerPath proves the marker on the PERSISTED email.
 *
 * DISPOSITION: none. V2 registers no customer delete -> marked customer stays
 * on the partner test store.
 */
export default defineWriteSmokeFixture({
  provider: "shopify",
  action: "create_customer",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    email: "{{smokeMarker}}cust@example.com",
    first_name: "{{smokeMarker}}cust",
    send_welcome_email: false,
    tags: "crsmoke",
  },
  requiredEnv: ["SMOKE_SHOPIFY_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "customer", idPath: "customerId", kind: "customer" },
    markerEchoPath: "email",
    verify: {
      provider: "shopify",
      action: "customer_state",
      config: { customerId: "{{ledger.customer.id}}" },
      smokeRead: true,
      markerPath: "email",
    },
    // No cleanup: no registered Shopify customer delete -> marked artifact left.
  },
  notes:
    "create_customer (marker synthetic email, welcome email explicitly false) -> " +
    "customer_state read-back proves the persisted email marker. writeSafe; " +
    "marked customer artifact left (no registered customer delete).",
});
