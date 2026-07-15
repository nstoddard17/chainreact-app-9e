import { z } from "zod";

/** `eden:get_prompt` — read a saved prompt/skill's full definition. */
export const GetPromptConfigSchema = z
  .object({ workspaceId: z.string().optional(), promptId: z.string().min(1) })
  .strict();
export type GetPromptConfig = z.infer<typeof GetPromptConfigSchema>;
