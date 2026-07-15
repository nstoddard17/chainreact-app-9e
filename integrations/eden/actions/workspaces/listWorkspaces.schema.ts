import { z } from "zod";

/** `eden:list_workspaces` — no inputs; lists the connected account's workspaces. */
export const ListWorkspacesConfigSchema = z.object({}).strict();
export type ListWorkspacesConfig = z.infer<typeof ListWorkspacesConfigSchema>;
