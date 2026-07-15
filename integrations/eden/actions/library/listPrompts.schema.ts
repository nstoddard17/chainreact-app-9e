import { z } from "zod";

/** `eden:list_prompts` — list saved prompts & skills in a workspace. */
export const ListPromptsConfigSchema = z.object({ workspaceId: z.string().optional() }).strict();
export type ListPromptsConfig = z.infer<typeof ListPromptsConfigSchema>;
