import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:create_company (writeSafe) — HubSpot CRM company lifecycle.
 *
 *   execute  create_company -> capture { companyId } into ledger key "company".
 *            The company NAME carries the unique smoke marker. NO domain is set:
 *            domain is HubSpot's company-dedupe key, and omitting it removes the
 *            only 409 path (duplicateHandling stays on the schema default "fail").
 *   verify   company_state (smokeRead) -> INDEPENDENT GET-by-id read-back via
 *            the smoke-only seam (strongly consistent; the registered
 *            get_companies /search read is eventually consistent and would
 *            flake on a seconds-old company). markerPath proves the marker on
 *            the PERSISTED name.
 *   cleanup  none — HubSpot has NO registered archive/delete action for
 *            companies (artifact "left" on the throwaway portal).
 *
 * Connection is DB-probed by the dev test; company fixtures need no target env.
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "create_company",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    name: "{{smokeMarker}}company",
    description: "ChainReact action-smoke artifact - safe to ignore",
  },
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "company", idPath: "companyId", kind: "company" },
    // create_company echoes the stored name; confirm the unique marker round-tripped.
    markerEchoPath: "name",
    verify: {
      provider: "hubspot",
      action: "company_state",
      smokeRead: true,
      config: { companyId: "{{ledger.company.id}}" },
      markerPath: "name",
    },
  },
  notes:
    "Create a smoke-marked company (marker name, no domain so no dedupe/409 path) -> " +
    "company_state seam GET-by-id read-back (marker on name). No registered company " +
    "delete/archive action -> artifact left on the throwaway portal.",
});
