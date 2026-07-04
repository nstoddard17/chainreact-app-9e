import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:create_contact (writeSafe) — first HubSpot CRM write.
 *
 *   execute  create_contact -> capture { contactId } into ledger key "contact".
 *            The email local-part AND firstname carry the unique smoke marker
 *            (`crsmoke-<runToken>-`); the reserved example.com domain guarantees
 *            no real mailbox is ever referenced.
 *   verify   contact_state (smokeRead) -> INDEPENDENT GET-by-id read-back via the
 *            smoke-only seam; markerPath proves the marker on the PERSISTED
 *            firstname (never the create echo). The registered get_contacts
 *            action is a /search read — eventually consistent, so a
 *            seconds-old contact would flake it; the seam GET is consistent.
 *   cleanup  none — HubSpot has NO registered archive/delete action for
 *            contacts, and the smoke read-back seam is read-only by invariant.
 *            The marked contact is a harmless artifact on the throwaway portal
 *            (artifact "left").
 *
 * Connection is proven from the DB integration row by the dev test
 * (`probeWriteConnection`) — no SMOKE_HUBSPOT_CONNECTED requirement, and the
 * contact fixtures need NO target env (a contact needs no parent resource).
 *
 * `duplicateHandling` stays on the schema default ("fail"): the marker-unique
 * email can never collide, and a 409 would surface as an honest FAIL.
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "create_contact",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    email: "{{smokeMarker}}create-contact@example.com",
    firstname: "{{smokeMarker}}first",
    lastname: "smoke",
  },
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "contact", idPath: "contactId", kind: "contact" },
    // create_contact echoes the stored email; confirm the unique marker round-tripped.
    markerEchoPath: "email",
    verify: {
      provider: "hubspot",
      action: "contact_state",
      smokeRead: true,
      config: { contactId: "{{ledger.contact.id}}" },
      // Independent GET-by-id read-back confirms the marker on the persisted firstname.
      markerPath: "firstname",
    },
  },
  notes:
    "First HubSpot CRM write: create a smoke-marked contact (marker email + firstname) " +
    "-> contact_state seam GET-by-id read-back (marker on firstname). No registered " +
    "delete/archive action exists for contacts -> artifact left on the throwaway portal.",
});
