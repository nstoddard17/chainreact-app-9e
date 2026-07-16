import { z } from "zod";
import { FileRefSchema } from "@/contracts/file";

/**
 * Resolved-config schema for `microsoft-powerbi:import_power_bi_file`.
 *
 * Q11: `nameConflict` is REQUIRED with no silent default — it is
 * behavior-switching (Overwrite/CreateOrOverwrite replace an existing
 * dataset; Ignore duplicates it). The documented value set is
 * Ignore | Abort | Overwrite | CreateOrOverwrite | GenerateUniqueName
 * (GenerateUniqueName is dataflow-model.json-only; RDL accepts only
 * Abort/Overwrite — provider-side rejections propagate to the engine).
 *
 * `file` accepts the full FileRef union (all three arms parse here);
 * the handler rejects `kind=provider_url` at runtime with a structured
 * error carrying the "stage bytes first" unblock hint — mirrors the
 * Slack `upload_file` pattern.
 *
 * `skipReport` accepts only `true` provider-side (.pbix only); the
 * handler forwards it only when set to `true`.
 */
export const ImportPowerBiFileConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    file: FileRefSchema,
    /** Target dataset name INCLUDING the file extension (e.g. `Report.pbix`). */
    datasetDisplayName: z.string().min(1).max(256),
    nameConflict: z.enum([
      "Ignore",
      "Abort",
      "Overwrite",
      "CreateOrOverwrite",
      "GenerateUniqueName",
    ]),
    skipReport: z.boolean().optional(),
  })
  .strict();

export type ImportPowerBiFileConfig = z.infer<
  typeof ImportPowerBiFileConfigSchema
>;
