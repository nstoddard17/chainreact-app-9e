import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:update_contact (writeSafe) — HubSpot CRM contact lifecycle.
 *
 *   setup    create_contact -> seed a smoke contact (firstname "{{marker}}seed",
 *            distinct marker email so it can never 409 against the
 *            create_contact fixture running in the same sweep). Capture
 *            { contactId } into ledger key "contact".
 *   execute  update_contact -> PATCH the seeded contact's firstname to
 *            "{{marker}}updated".
 *   verify   contact_state (smokeRead) -> INDEPENDENT GET-by-id read-back;
 *            markerPath "firstname" + markerSuffix "updated" requires
 *            "{{marker}}updated". The seed value is "{{marker}}seed" (no
 *            "updated"), so a no-op update fails the verify — proving the PATCH
 *            actually landed on the persisted contact.
 *   cleanup  none — no registered contact delete/archive action (artifact "left").
 *
 * Connection is DB-probed by the dev test; contact fixtures need no target env.
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "update_contact",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    contactId: "{{ledger.contact.id}}",
    firstname: "{{smokeMarker}}updated",
  },
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "hubspot",
        action: "create_contact",
        config: {
          email: "{{smokeMarker}}update-contact@example.com",
          firstname: "{{smokeMarker}}seed",
          lastname: "smoke",
        },
        captureResource: { resourceKey: "contact", idPath: "contactId", kind: "contact" },
      },
    ],
    verify: {
      provider: "hubspot",
      action: "contact_state",
      smokeRead: true,
      config: { contactId: "{{ledger.contact.id}}" },
      // The suffix pins the SPECIFIC updated value — the seed name would fail.
      markerPath: "firstname",
      markerSuffix: "updated",
    },
  },
  notes:
    "Seed smoke contact -> update_contact PATCHes firstname to {{marker}}updated -> " +
    "contact_state seam GET-by-id read-back (marker + suffix 'updated'). No registered " +
    "contact delete/archive action -> artifact left on the throwaway portal.",
});
