import { z } from "zod";

/** `eden:read_content` — read a social post by URL (metadata + optional transcript). */
export const ReadContentConfigSchema = z
  .object({
    url: z.string().url(),
    /** Q11: transcript is a behaviour-switching/cost field — required, no hidden default. */
    includeTranscript: z.boolean(),
    workspaceId: z.string().optional(),
  })
  .strict();
export type ReadContentConfig = z.infer<typeof ReadContentConfigSchema>;
