import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:create_gateway_datasource`.
 *
 * Q11: `privacyLevel` and `credentialType` are REQUIRED with no silent
 * default — both switch provider-side behavior (data-combination privacy /
 * which credential fields the gateway expects).
 *
 * Connection details are V2-shaped (`server` / `database` / `url` fields);
 * the handler synthesizes the documented JSON-in-string wire format —
 * authors never hand-write raw provider payloads. At least one connection
 * field is required (refinement).
 *
 * Credential material (`password` / `key`) is encrypted against the
 * gateway public key IN the handler before anything leaves the app —
 * plaintext is never sent to Power BI or echoed in outputs/errors.
 *
 * Credential types: `Basic` | `Windows` | `Key`. `OAuth2` is documented as
 * unsupported on Create Datasource; `Anonymous` is excluded because its
 * documented wire shape (`{"credentialData":""}`, shown only with
 * `NotEncrypted` and no encryptor) is unverified for the encrypted
 * on-premises path this action takes.
 */
export const CreateGatewayDatasourceConfigSchema = z
  .object({
    gatewayId: z.string().min(1),
    datasourceName: z.string().min(1),
    // Documented on-premises gateway datasource types (Create Datasource
    // type table). `Extension` is excluded — it needs an undocumented
    // extension-specific connectionDetails shape.
    datasourceType: z.enum([
      "SQL",
      "AnalysisServices",
      "Oracle",
      "PostgreSql",
      "MySql",
      "OData",
      "ODBC",
      "SharePoint",
      "SAPHana",
      "File",
      "Folder",
      "Web",
    ]),
    server: z.string().min(1).optional(),
    database: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    credentialType: z.enum(["Basic", "Windows", "Key"]),
    username: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    key: z.string().min(1).optional(),
    privacyLevel: z.enum(["None", "Public", "Organizational", "Private"]),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (!cfg.server && !cfg.database && !cfg.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "At least one connection detail (server, database, or url) is required.",
        path: ["server"],
      });
    }
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

export type CreateGatewayDatasourceConfig = z.infer<
  typeof CreateGatewayDatasourceConfigSchema
>;
