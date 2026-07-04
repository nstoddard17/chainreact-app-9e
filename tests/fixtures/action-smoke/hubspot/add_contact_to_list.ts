import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:add_contact_to_list (writeSafe) — HubSpot list-membership finisher.
 *
 *   execute  add_contact_to_list -> add the STAGED marker contact (by its
 *            marker email) to the STAGED/discovered MANUAL smoke list. The
 *            created resource is the MEMBERSHIP — captured into ledger key
 *            "membership" keyed on the echoed marker email (the action
 *            contract is email-keyed; no membership object id exists).
 *            List + contact are staged OUTSIDE the harness
 *            (`stageHubSpotListMembershipTarget`: pinned/smoke-named MANUAL
 *            list reused, else a crsmoke list is created; contact created
 *            fresh; both torn down in the dev test's finally) so the parent
 *            objects never enter the run ledger.
 *   verify   list_membership_state (smokeRead) -> INDEPENDENT memberships-page
 *            read-back; expectEquals member:true proves the staged contact's
 *            id is IN the list (never trusts contactIdsAdded).
 *   cleanup  remove_from_list -> removes exactly the captured membership
 *            (email is the smoke-owned ledger id). Membership removal is the
 *            REQUIRED disposition -> LIVE_PASS_CLEANED.
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "add_contact_to_list",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    // listId / email overlaid from the staging env at run time.
  },
  configFromEnv: {
    listId: "SMOKE_HUBSPOT_LIST_ID",
    email: "SMOKE_HUBSPOT_LIST_CONTACT_EMAIL",
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
    // The membership is the created resource; its stable key under the
    // email-keyed action contract is the marker email echoed by the handler.
    captureResource: { resourceKey: "membership", idPath: "email", kind: "list membership" },
    // The echoed email carries the marker (staged as crsmoke-<token>-...).
    markerEchoPath: "email",
    verify: {
      provider: "hubspot",
      action: "list_membership_state",
      smokeRead: true,
      config: {
        listId: "{{env.SMOKE_HUBSPOT_LIST_ID}}",
        contactId: "{{env.SMOKE_HUBSPOT_LIST_CONTACT_ID}}",
      },
      expectEquals: { path: "member", value: true },
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "hubspot",
      action: "remove_from_list",
      config: {
        listId: "{{env.SMOKE_HUBSPOT_LIST_ID}}",
        email: "{{ledger.membership.id}}",
      },
    },
  },
  notes:
    "Add the staged marker contact to the staged/discovered MANUAL smoke list -> " +
    "independent memberships-page read-back (member:true) -> remove_from_list " +
    "cleanup removes the membership. Parent list/contact staged outside the harness " +
    "and torn down in the dev test finally.",
});
