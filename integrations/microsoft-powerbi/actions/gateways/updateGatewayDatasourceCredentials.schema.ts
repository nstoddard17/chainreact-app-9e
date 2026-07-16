import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:update_gateway_datasource_credentials`.
 *
 * Q11: `credentialType` is REQUIRED — it switches which credential fields
 * the gateway expects. Same conditional-requirement refinements as
 * `create_gateway_datasource`: Basic/Windows need username+password, Key
 * needs key. Credential material is encrypted in the handler against the
 * gateway's current public key before the PATCH leaves the app.
 *
 * (OAuth2 IS documented as supported on Update Datasource, but a workflow
 * carrying a raw provider access token as config is not a V2 shape — this
 * action offers the same Basic/Windows/Key set as create.)
 */
export const UpdateGatewayDatasourceCredentialsConfigSchema = z
  .object({
    gatewayId: z.string().min(1),
    datasourceId: z.string().min(1),
    credentialType: z.enum(["Basic", "Windows", "Key"]),
    username: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    key: z.string().min(1).optional(),
    privacyLevel: z.enum(["None", "Public", "Organizational", "Private"]),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (cfg.credentialType === "Basic" || cfg.credentialType === "Windows") {
      if (!cfg.username) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `username is required for ${cfg.credentialType} credentials.`,
          path: ["username"],
        });
      }
      if (!cfg.password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `password is required for ${cfg.credentialType} credentials.`,
          path: ["password"],
        });
      }
    }
    if (cfg.credentialType === "Key" && !cfg.key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "key is required for Key credentials.",
        path: ["key"],
      });
    }
  });

export type UpdateGatewayDatasourceCredentialsConfig = z.infer<
  typeof UpdateGatewayDatasourceCredentialsConfigSchema
>;
