import { z } from "zod";

/**
 * Zod schema for the Power BI `gateway_datasource_status_changed` polling
 * trigger.
 *
 * Snapshot holds the last observed connectivity state. `errorCode` is the
 * provider's short identifier-shaped code only (e.g.
 * `DM_GWPipeline_Client_GatewayUnreachable`) — `gatewayDatasourceStatusGet`
 * sanitizes it; the raw error envelope never reaches config or payload.
 */
export const PowerBiGatewayDatasourceStatusChangedConfigSchema = z.object({
  gatewayId: z.string().min(1),
  datasourceId: z.string().min(1),

  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      online: z.boolean(),
      errorCode: z.string().nullable(),
      updatedAt: z.string().min(1),
    })
    .optional(),
  polling: z.object({ lastPolledAt: z.string().min(1) }).optional(),
});

export type PowerBiGatewayDatasourceStatusChangedConfig = z.infer<
  typeof PowerBiGatewayDatasourceStatusChangedConfigSchema
>;
