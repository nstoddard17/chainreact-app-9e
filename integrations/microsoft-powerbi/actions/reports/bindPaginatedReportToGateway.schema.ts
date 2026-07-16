import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:bind_paginated_report_to_gateway`.
 *
 * Wire contract (verified against the live reference 2026-07-15):
 * BOTH `gatewayObjectId` AND `bindDetails` are required for the
 * paginated-report variant — each bind row names an RDL data source in
 * the report and the gateway data source (uuid) to bind it to. This is
 * NOT the dataset BindToGateway shape (whose datasource ids are
 * optional).
 */

const BindDetailRowSchema = z
  .object({
    datasourceName: z.string().min(1),
    datasourceObjectId: z.string().min(1),
  })
  .strict();

export const BindPaginatedReportToGatewayConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    paginatedReportId: z.string().min(1),
    gatewayId: z.string().min(1),
    bindDetails: z.array(BindDetailRowSchema).min(1).max(50),
  })
  .strict();

export type BindPaginatedReportToGatewayConfig = z.infer<
  typeof BindPaginatedReportToGatewayConfigSchema
>;
