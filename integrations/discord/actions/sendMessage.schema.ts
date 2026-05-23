import { z } from "zod";

/**
 * Resolved-config schema for the Discord `send_message` action.
 *
 * V1 field names preserved verbatim per Slice 3.DISCORD-1 §7.1:
 * `guildId`, `channelId`, `message`. NO normalization to snake_case.
 *
 * `message` accepts free-form text. Discord supports inline markdown
 * (`**bold**`, `__underline__`, `<@user_id>`, `<#channel_id>`,
 * `<:emoji_id:>`). V1's specialized `discord-rich-text` FieldType is
 * intentionally NOT introduced in V2 — workflow authors enter raw
 * Discord-syntax text in a `textarea` per Slice 3.DISCORD-1 §7.1.
 *
 * Embed fields (`embedTitle`, `embedDescription`, etc.) from V1 are
 * intentionally NOT ported in this slice — the per-user instruction
 * scopes `send_message` to the three core fields only. Embed support
 * can land as a follow-up extension to the schema + handler without
 * breaking the existing `(messageId, channelId, content, …)` output
 * contract.
 *
 * Discord enforces a 2000-character message cap; we mirror at the
 * schema layer so the error surfaces as a config-shape problem
 * locally instead of as a Discord API error.
 */
export const SendMessageConfigSchema = z
  .object({
    guildId: z.string().min(1, "Discord guildId is required."),
    channelId: z.string().min(1, "Discord channelId is required."),
    message: z
      .string()
      .min(1, "Discord message body is required.")
      .max(2000, "Discord caps message length at 2000 characters."),
  })
  .strict();

export type SendMessageConfig = z.infer<typeof SendMessageConfigSchema>;
