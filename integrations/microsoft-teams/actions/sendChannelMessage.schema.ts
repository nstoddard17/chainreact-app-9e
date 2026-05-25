import { z } from "zod";

/**
 * Resolved-config schema for the Teams send_channel_message action.
 *
 * `contentType` defaults to `'html'` — matches V1's sendMessage handler
 * and the Teams UI default. The caller can pass `'text'` explicitly
 * for plain-text content where HTML rendering would be unsafe (e.g.
 * forwarding untrusted trigger-payload content). This is a behavior
 * switch, not a high-risk Q11 default — Q11 categories are
 * auto-notify / visibility / consent / AI behavior, none of which
 * apply to message-content rendering.
 */
export const SendChannelMessageConfigSchema = z
  .object({
    teamId: z.string().min(1),
    channelId: z.string().min(1),
    content: z.string().min(1),
    contentType: z.enum(["text", "html"]).default("html"),
  })
  .strict();

export type SendChannelMessageConfig = z.infer<
  typeof SendChannelMessageConfigSchema
>;
