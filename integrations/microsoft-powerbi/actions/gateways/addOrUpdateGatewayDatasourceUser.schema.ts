import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:add_or_update_gateway_datasource_user`.
 *
 * Q11: `accessRight` is REQUIRED with no silent default —
 * `ReadOverrideEffectiveIdentity` is a materially broader grant (embed
 * scenarios can impersonate effective identities). The documented `None`
 * value is a removal alias reserved for updates — removal goes through
 * the dedicated `remove_gateway_datasource_user` action instead.
 */
export const AddOrUpdateGatewayDatasourceUserConfigSchema = z
  .object({
    gatewayId: z.string().min(1),
    datasourceId: z.string().min(1),
    principalEmail: z.string().min(1),
    accessRight: z.enum(["Read", "ReadOverrideEffectiveIdentity"]),
  })
  .strict();

export type AddOrUpdateGatewayDatasourceUserConfig = z.infer<
  typeof AddOrUpdateGatewayDatasourceUserConfigSchema
>;
