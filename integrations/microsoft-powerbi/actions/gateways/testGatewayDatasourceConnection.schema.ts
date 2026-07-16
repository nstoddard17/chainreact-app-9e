import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:test_gateway_datasource_connection`.
 */
export const TestGatewayDatasourceConnectionConfigSchema = z
  .object({
    gatewayId: z.string().min(1),
    datasourceId: z.string().min(1),
  })
  .strict();

export type TestGatewayDatasourceConnectionConfig = z.infer<
  typeof TestGatewayDatasourceConnectionConfigSchema
>;
