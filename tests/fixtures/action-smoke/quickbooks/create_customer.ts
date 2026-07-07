import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * quickbooks:create_customer (writeSafe, artifact left) — create a
 * deterministic crsmoke- customer in the SANDBOX company (run-unique
 * marker display name; QBO enforces DisplayName uniqueness so the
 * marker also guarantees no collision with real records), proven via an
 * independent per-customer read-back.
 *
 *   execute  create_customer -> displayName "{{smokeMarker}}Customer".
 *            Capture { customerId } into ledger key "customer".
 *            markerEchoPath proves the echoed display name.
 *   verify   get_customer (SMOKE READ-BACK) -> GET customer/{id};
 *            markerPath proves the marker on the PERSISTED display name.
 *
 * DISPOSITION: none. V2 registers no customer delete (explicit
 * QUICKBOOKS-1 exclusion) -> marked customer stays in the sandbox
 * company (harmless; sandbox companies are disposable).
 */
export default defineWriteSmokeFixture({
  provider: "quickbooks",
  action: "create_customer",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    displayName: "{{smokeMarker}}Customer",
    notes: "{{smokeMarker}}action-smoke record - safe to ignore",
  },
  requiredEnv: ["SMOKE_QUICKBOOKS_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: {
      resourceKey: "customer",
      idPath: "customerId",
      kind: "customer",
    },
    markerEchoPath: "displayName",
    verify: {
      provider: "quickbooks",
      action: "get_customer",
      config: { customerId: "{{ledger.customer.id}}" },
      smokeRead: true,
      markerPath: "customer.displayName",
    },
    // No cleanup: no registered QuickBooks customer delete -> marked
    // sandbox artifact left.
  },
  notes:
    "create_customer (marker display name; uniqueness enforced by QBO) -> " +
    "get_customer read-back proves the persisted marker. writeSafe; marked " +
    "sandbox customer artifact left (no registered customer delete).",
});
