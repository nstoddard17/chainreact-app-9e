import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:update_paginated_report_datasources — LIVE-UNSAFE
 * by default.
 *
 * Repoints a shared paginated report's data sources at a new
 * server/database; every viewer immediately reads from the new target
 * and the caller must own the data source. The datasourceName/new
 * server values here are placeholders — a live certification must
 * supply the REAL RDL data source name of a throwaway report.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "update_paginated_report_datasources",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {
    updates: [
      {
        datasourceName: "SqlDatasource",
        newServer: "smoke-sql-server",
        newDatabase: "smoke-sql-database",
      },
    ],
  },
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
    paginatedReportId: "SMOKE_POWERBI_PAGINATED_REPORT_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_PAGINATED_REPORT_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Mutates shared report config: retargets the paginated report's data source connections. liveSafe false — certify manually against a throwaway RDL report, replacing the placeholder datasourceName/server/database with real values.",
});
