import { z } from "zod";

/** `eden:list_creator_lists` — list the workspace's creator lists. */
export const ListCreatorListsConfigSchema = z.object({ workspaceId: z.string().optional() }).strict();
export type ListCreatorListsConfig = z.infer<typeof ListCreatorListsConfigSchema>;
