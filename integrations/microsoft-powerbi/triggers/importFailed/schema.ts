import { z } from "zod";

/**
 * Config schema for the Power BI `import_failed` polling trigger.
 * `snapshot.seenImportIds` tracks the workspace import ids already
 * observed in the `Failed` state.
 */
export const PowerBiImportFailedConfigSchema = z.object({
  workspaceId: z.string().min(1),

  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      seenImportIds: z.array(z.string()),
      updatedAt: z.string().min(1),
    })
    .optional(),
  polling: z.object({ lastPolledAt: z.string().min(1) }).optional(),
});

export type PowerBiImportFailedConfig = z.infer<
  typeof PowerBiImportFailedConfigSchema
>;
