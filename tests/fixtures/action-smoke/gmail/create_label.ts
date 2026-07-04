import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * gmail:create_label (writeSafe) — create a deterministic crsmoke- user label, prove it
 * exists via an INDEPENDENT list_labels read-back.
 *
 *   execute  create_label -> users.labels.create a `{{smokeMarker}}label`. Capture the
 *            new { labelId } into ledger key "label".
 *   verify   list_labels -> INDEPENDENT users.labels.list; assert the run marker is
 *            PRESENT in the serialized `labels` (the create echo is never trusted).
 *
 * DISPOSITION: none. Gmail exposes NO registered delete-label action (and no
 * users.labels.delete wrapper), so the label cannot be cleaned via the harness. It is a
 * clearly-marked crsmoke- label on the throwaway account (an accepted artifact). Each run
 * leaves one marked label. Scope: `gmail.labels` / `gmail.modify`.
 */
export default defineWriteSmokeFixture({
  provider: "gmail",
  action: "create_label",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    name: "{{smokeMarker}}label",
  },
  requiredEnv: ["SMOKE_GMAIL_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "label", idPath: "labelId", kind: "label" },
    verify: {
      provider: "gmail",
      action: "list_labels",
      config: {},
      markerPath: "labels",
    },
    // No cleanup: Gmail has no registered delete-label action -> throwaway label artifact.
  },
  notes:
    "create_label crsmoke- -> list_labels read-back proves the marker name is present. " +
    "writeSafe; label artifact (no registered Gmail delete-label action).",
});
