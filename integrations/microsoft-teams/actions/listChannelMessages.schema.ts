import { z } from "zod";

/**
 * Resolved-config schema for the Teams `list_channel_messages` action
 * (Slice 4.TEAMS-READ-2).
 *
 * Lists a channel's top-level messages, one page. `teamId` + `channelId`
 * required; `top` caps the page at Graph's channel-messages ceiling (1..50,
 * default 20). `.strict()` rejects stray fields.
 *
 * METADATA-ONLY contract: the handler returns header-level fields only and
 * NEVER surfaces message body / subject / sender display name / attachments
 * / reactions / mentions (see the handler's explicit projection). Uses the
 * already-granted `ChannelMessage.Read.All` scope — no new scope.
 */
export const ListChannelMessagesConfigSchema = z
  .object({
    teamId: z.string().min(1, "teamId is required."),
    channelId: z.string().min(1, "channelId is required."),
    /** Page cap, 1..50 (Graph channel-messages ceiling). Default 20. */
    top: z.number().int().min(1).max(50).default(20),
  })
  .strict();

export type ListChannelMessagesConfig = z.infer<
  typeof ListChannelMessagesConfigSchema
>;
