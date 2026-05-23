import { z } from "zod";

/**
 * Resolved-config schema for the Discord `edit_message` action.
 *
 * V1 field names preserved verbatim per Slice 3.DISCORD-1 §7.1:
 * `guildId`, `channelId`, `messageId`, `content`. NO normalization.
 *
 * Discord enforces: only the message author (the bot, in our case)
 * may edit a message. Attempting to edit another author's message
 * returns 403 (code 50005). The handler surfaces this with a
 * bot-specific explanation so workflow authors know it's a Discord
 * platform limitation, not a misconfiguration.
 *
 * `guildId` is required for V1 parity even though Discord's PATCH
 * endpoint only needs `(channelId, messageId)` — V1's UI uses
 * `guildId` to drive the channel picker, and the field-name
 * preservation rule keeps it in the V2 schema for symmetry.
 *
 * 2000-character cap mirrored at the schema layer (Discord-enforced).
 */
export const EditMessageConfigSchema = z
  .object({
    guildId: z.string().min(1, "Discord guildId is required."),
    channelId: z.string().min(1, "Discord channelId is required."),
    messageId: z.string().min(1, "Discord messageId is required."),
    content: z
      .string()
      .min(1, "Discord message content is required.")
      .max(2000, "Discord caps message length at 2000 characters."),
  })
  .strict();

export type EditMessageConfig = z.infer<typeof EditMessageConfigSchema>;
