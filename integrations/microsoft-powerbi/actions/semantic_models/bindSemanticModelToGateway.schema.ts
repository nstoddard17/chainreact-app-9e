import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:bind_semantic_model_to_gateway`.
 *
 * `datasourceObjectIds` is optional — when omitted, Power BI binds the
 * model to the first matching data source in the gateway.
 */
export const BindSemanticModelToGatewayConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    semanticModelId: z.string().min(1),
    gatewayId: z.string().min(1),
    datasourceObjectIds: z.array(z.string().min(1)).min(1).max(100).optional(),
  })
  .strict();

export type BindSemanticModelToGatewayConfig = z.infer<
  typeof BindSemanticModelToGatewayConfigSchema
>;
