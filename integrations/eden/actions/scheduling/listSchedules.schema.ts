import { z } from "zod";

/** `eden:list_schedules` — posting schedules for a workspace (default workspace when omitted). */
export const ListSchedulesConfigSchema = z
  .object({ workspaceId: z.string().optional() })
  .strict();
export type ListSchedulesConfig = z.infer<typeof ListSchedulesConfigSchema>;
