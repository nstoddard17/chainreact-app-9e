import { z } from "zod";

/**
 * Resolved-config schema for the Gmail `get_profile` action
 * (Slice 4.GMAIL-READ-1).
 *
 * `users.getProfile` takes no parameters — it returns the connected
 * mailbox's own profile. The config is therefore an empty object.
 * `.strict()` rejects any stray field so a paste-in config from another
 * action fails fast.
 *
 * Read-only, metadata-only: returns the account email + mailbox counts +
 * historyId — never message content, bodies, or attachments.
 */
export const GetProfileConfigSchema = z.object({}).strict();

export type GetProfileConfig = z.infer<typeof GetProfileConfigSchema>;
