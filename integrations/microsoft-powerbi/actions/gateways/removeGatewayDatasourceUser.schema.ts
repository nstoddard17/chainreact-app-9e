import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:remove_gateway_datasource_user`.
 */
export const RemoveGatewayDatasourceUserConfigSchema = z
  .object({
    gatewayId: z.string().min(1),
    datasourceId: z.string().min(1),
    principalEmail: z.string().min(1),
  })
  .strict();

export type RemoveGatewayDatasourceUserConfig = z.infer<
  typeof RemoveGatewayDatasourceUserConfigSchema
>;
