import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:update_semantic_model_datasources`.
 *
 * Each row rewires ONE data source: the `current*` fields select the
 * existing source, the `new*` fields describe the new target. The
 * refinement requires at least one `current*` and one `new*` value per
 * row — an empty selector or an empty target is meaningless.
 *
 * `datasourceType` wire ids: research.md documents the supported source
 * PRODUCTS (SQL Server, Azure SQL, Azure Analysis Services, Azure
 * Synapse, OData, SharePoint, Teradata, SAP HANA); Azure SQL and Synapse
 * ride under `Sql`. See the wrapper NOTE for the wire-id derivation.
 */
const DatasourceUpdateRowSchema = z
  .object({
    datasourceType: z.enum([
      "Sql",
      "AnalysisServices",
      "OData",
      "SharePoint",
      "Teradata",
      "SapHana",
    ]),
    currentServer: z.string().min(1).optional(),
    currentDatabase: z.string().min(1).optional(),
    currentUrl: z.string().min(1).optional(),
    newServer: z.string().min(1).optional(),
    newDatabase: z.string().min(1).optional(),
    newUrl: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (row) =>
      row.currentServer !== undefined ||
      row.currentDatabase !== undefined ||
      row.currentUrl !== undefined,
    "Each update needs at least one current connection value (server, database, or URL) to select the existing data source.",
  )
  .refine(
    (row) =>
      row.newServer !== undefined ||
      row.newDatabase !== undefined ||
      row.newUrl !== undefined,
    "Each update needs at least one new connection value (server, database, or URL).",
  );

export const UpdateSemanticModelDatasourcesConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    semanticModelId: z.string().min(1),
    updates: z.array(DatasourceUpdateRowSchema).min(1).max(20),
  })
  .strict();

export type UpdateSemanticModelDatasourcesConfig = z.infer<
  typeof UpdateSemanticModelDatasourcesConfigSchema
>;
