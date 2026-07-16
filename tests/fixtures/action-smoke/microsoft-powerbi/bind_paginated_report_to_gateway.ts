import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:bind_paginated_report_to_gateway — LIVE-UNSAFE by
 * default.
 *
 * Changes which on-premises gateway (and therefore which stored
 * credentials) a shared paginated report's data sources use. The
 * bindDetails row here is a placeholder — a live certification must
 * supply the REAL RDL data source name + gateway datasource id
 * (SMOKE_POWERBI_GATEWAY_DATASOURCE_ID) of a throwaway report.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "bind_paginated_report_to_gateway",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {
    bindDetails: [
      {
        datasourceName: "DataSource1",
        datasourceObjectId: "00000000-0000-0000-0000-000000000000",
      },
    ],
  },
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
    paginatedReportId: "SMOKE_POWERBI_PAGINATED_REPORT_ID",
    gatewayId: "SMOKE_POWERBI_GATEWAY_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_PAGINATED_REPORT_ID",
    "SMOKE_POWERBI_GATEWAY_ID",
    "SMOKE_POWERBI_GATEWAY_DATASOURCE_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Mutates shared report config: rebinding data sources to a gateway switches the credentials the report uses. liveSafe false — certify manually against a throwaway RDL report, replacing the placeholder bindDetails with the real data source name + SMOKE_POWERBI_GATEWAY_DATASOURCE_ID.",
});
