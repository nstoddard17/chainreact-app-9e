import { z } from "zod";

/**
 * Resolved-config schema for the Gmail `list_labels` action
 * (Slice 4.GMAIL-READ-1).
 *
 * `users.labels.list` takes no parameters — it returns every label on the
 * mailbox. The config is therefore an empty object. `.strict()` rejects any
 * stray field so a paste-in config from another action fails fast rather
 * than silently ignoring unexpected input.
 *
 * Read-only, metadata-only: returns label id/name/type — never message
 * content, bodies, or attachments.
 */
export const ListLabelsConfigSchema = z.object({}).strict();

export type ListLabelsConfig = z.infer<typeof ListLabelsConfigSchema>;
