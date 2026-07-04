import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * shopify:update_customer (writeSafe, artifact left) — rename a smoke-owned
 * customer and prove the SPECIFIC new value via a suffix-pinned independent
 * read.
 *
 *   setup    create_customer -> marker customer (unique synthetic email,
 *            welcome email explicitly off). Capture ledger key "customer".
 *   execute  update_customer -> first_name "{{smokeMarker}}updated".
 *   verify   customer_state (SMOKE READ-BACK) -> markerPath "firstName" +
 *            markerSuffix "updated" pin the exact updated value (the setup
 *            name, same run marker, cannot vacuously pass).
 *
 * DISPOSITION: none (no registered customer delete) -> marked customer left.
 */
export default defineWriteSmokeFixture({
  provider: "shopify",
  action: "update_customer",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    customer_id: "{{ledger.customer.id}}",
    first_name: "{{smokeMarker}}updated",
  },
  requiredEnv: ["SMOKE_SHOPIFY_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "shopify",
        action: "create_customer",
        config: {
          email: "{{smokeMarker}}upd@example.com",
          first_name: "{{smokeMarker}}cust",
          send_welcome_email: false,
          tags: "crsmoke",
        },
        captureResource: { resourceKey: "customer", idPath: "customerId", kind: "customer" },
      },
    ],
    verify: {
      provider: "shopify",
      action: "customer_state",
      config: { customerId: "{{ledger.customer.id}}" },
      smokeRead: true,
      markerPath: "firstName",
      markerSuffix: "updated",
    },
    // No cleanup: no registered Shopify customer delete -> marked artifact left.
  },
  notes:
    "create_customer (smoke seed) -> update_customer rename -> customer_state " +
    "read-back proves marker+updated firstName (suffix-pinned). writeSafe; marked " +
    "customer artifact left.",
});
