import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:update_paginated_report_datasources`.
 *
 * Row shape follows the documented paginated-report wire format
 * (`updateDetails: [{ datasourceName, connectionDetails: { server?,
 * database? } }]` — verified against the live reference 2026-07-15):
 * RDL data sources are selected by NAME. Each row must set at least
 * one new connection value; only set values are sent (the wrapper
 * synthesizes `connectionDetails`).
 */

const DatasourceUpdateRowSchema = z
  .object({
    datasourceName: z.string().min(1),
    newServer: z.string().min(1).optional(),
    newDatabase: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (row) => row.newServer !== undefined || row.newDatabase !== undefined,
    "Each update needs at least one of newServer / newDatabase.",
  );

export const UpdatePaginatedReportDatasourcesConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    paginatedReportId: z.string().min(1),
    updates: z.array(DatasourceUpdateRowSchema).min(1).max(50),
  })
  .strict();

export type UpdatePaginatedReportDatasourcesConfig = z.infer<
  typeof UpdatePaginatedReportDatasourcesConfigSchema
>;
