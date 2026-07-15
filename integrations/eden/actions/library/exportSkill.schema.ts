import { z } from "zod";

/** `eden:export_skill` — export a saved prompt/skill as portable Markdown. */
export const ExportSkillConfigSchema = z
  .object({ workspaceId: z.string().optional(), promptId: z.string().min(1) })
  .strict();
export type ExportSkillConfig = z.infer<typeof ExportSkillConfigSchema>;
