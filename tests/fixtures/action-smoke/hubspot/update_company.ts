import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:update_company (writeSafe) — HubSpot CRM company lifecycle.
 *
 *   setup    create_company -> seed a smoke company (name "{{marker}}update-co",
 *            distinct from the create_company fixture's name in the same sweep;
 *            no domain so no dedupe/409 path). Capture { companyId } into ledger
 *            key "company".
 *   execute  update_company -> PATCH the seeded company's name to
 *            "{{marker}}updated".
 *   verify   company_state (smokeRead) -> INDEPENDENT GET-by-id read-back;
 *            markerPath "name" + markerSuffix "updated" requires
 *            "{{marker}}updated" — the seed name (no "updated") would fail, so
 *            this proves the PATCH landed on the persisted company.
 *   cleanup  none — no registered company delete/archive action (artifact "left").
 *
 * Connection is DB-probed by the dev test; company fixtures need no target env.
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "update_company",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    companyId: "{{ledger.company.id}}",
    name: "{{smokeMarker}}updated",
  },
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "hubspot",
        action: "create_company",
        config: {
          name: "{{smokeMarker}}update-co",
          description: "ChainReact action-smoke artifact - safe to ignore",
        },
        captureResource: { resourceKey: "company", idPath: "companyId", kind: "company" },
      },
    ],
    verify: {
      provider: "hubspot",
      action: "company_state",
      smokeRead: true,
      config: { companyId: "{{ledger.company.id}}" },
      markerPath: "name",
      markerSuffix: "updated",
    },
  },
  notes:
    "Seed smoke company -> update_company PATCHes name to {{marker}}updated -> " +
    "company_state seam GET-by-id read-back (marker + suffix 'updated'). No registered " +
    "company delete/archive action -> artifact left on the throwaway portal.",
});
