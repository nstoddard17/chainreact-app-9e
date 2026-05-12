import { z } from "zod";

/**
 * Resolved-config schema for the Slack post_interactive_blocks action.
 *
 * Posts a Block Kit message to a Slack channel via `chat.postMessage`.
 * Distinct action from send_channel_message — keeps the two schemas
 * honest (text-only vs blocks).
 *
 * Block validation strategy: each block must be an object with a
 * non-empty string `type`. Everything else passes through via
 * `passthrough()` — Slack rejects malformed block payloads server-side
 * with a clear error code (`invalid_blocks`, `invalid_blocks_format`),
 * and re-deriving Slack's full Block Kit schema in Zod is out of
 * scope for Slack 2.1 (Marcus's Commit 7 guidance).
 *
 * `text` is optional but recommended — Slack uses it for the
 * notification preview (mobile, screen readers, summary previews)
 * when the client can't render blocks. We do NOT auto-generate a
 * fallback string (V1 silently defaulted to `"Interactive message"`
 * — that's a hidden default per Q11). If the caller wants a
 * notification preview, they pass one explicitly.
 *
 * `threadTs` (optional): post as a thread reply, same semantics as
 * send_channel_message.
 */
export const PostInteractiveBlocksConfigSchema = z.object({
  channel: z.string().min(1, "Slack channel is required."),
  blocks: z
    .array(
      z
        .object({
          type: z.string().min(1, "Each block must have a non-empty `type`."),
        })
        .passthrough(),
    )
    .min(1, "blocks must be a non-empty array."),
  text: z.string().min(1).optional(),
  threadTs: z.string().min(1).optional(),
});
export type PostInteractiveBlocksConfig = z.infer<
  typeof PostInteractiveBlocksConfigSchema
>;
