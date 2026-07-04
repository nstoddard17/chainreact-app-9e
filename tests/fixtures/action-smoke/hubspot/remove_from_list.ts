import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:remove_from_list (writeSafe, execute IS the cleanup) — HubSpot
 * list-membership finisher.
 *
 *   setup    add_contact_to_list -> put the STAGED marker contact on the
 *            STAGED/discovered MANUAL smoke list. Capture the MEMBERSHIP into
 *            ledger key "membership" (keyed on the echoed marker email — the
 *            action contract is email-keyed).
 *   execute  remove_from_list -> remove exactly the captured membership
 *            (email is the smoke-owned ledger id).
 *   verify   list_membership_state (smokeRead) -> INDEPENDENT memberships-page
 *            read-back; expectEquals member:false proves the contact's id is
 *            GONE from the list. `member:false` requires a SUCCESSFUL
 *            memberships read — an API/permission error (or missing list)
 *            fails the step -> honest VERIFY_FAILED, never a false "removed".
 *            The `contactIdsRemoved` echo is never trusted.
 *   (executeIsCleanup)  the removal IS the disposition: artifact "cleaned".
 *
 * Membership removal is reversible state (re-add restores it), matching the
 * slack remove_user_from_channel / gmail remove_label precedent -> risk
 * "write", not "destructive".
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "remove_from_list",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    listId: "{{env.SMOKE_HUBSPOT_LIST_ID}}",
    email: "{{ledger.membership.id}}",
  },
  requiredEnv: [
    "SMOKE_HUBSPOT_LIST_ID",
    "SMOKE_HUBSPOT_LIST_CONTACT_ID",
    "SMOKE_HUBSPOT_LIST_CONTACT_EMAIL",
  ],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "hubspot",
        action: "add_contact_to_list",
        config: {
          listId: "{{env.SMOKE_HUBSPOT_LIST_ID}}",
          email: "{{env.SMOKE_HUBSPOT_LIST_CONTACT_EMAIL}}",
        },
        captureResource: { resourceKey: "membership", idPath: "email", kind: "list membership" },
      },
    ],
    verify: {
      provider: "hubspot",
      action: "list_membership_state",
      smokeRead: true,
      config: {
        listId: "{{env.SMOKE_HUBSPOT_LIST_ID}}",
        contactId: "{{env.SMOKE_HUBSPOT_LIST_CONTACT_ID}}",
      },
      expectEquals: { path: "member", value: false },
    },
    // The action under test IS the disposition — no separate cleanup step.
    executeIsCleanup: true,
  },
  notes:
    "Seed membership (add staged contact to the smoke list) -> remove_from_list " +
    "removes it -> independent memberships-page read-back member:false (an error " +
    "never reads as removed). executeIsCleanup: artifact cleaned.",
});
