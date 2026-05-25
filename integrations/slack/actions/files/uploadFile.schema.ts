import { z } from "zod";
import { FileRefSchema } from "@/contracts/file";

/**
 * Resolved-config schema for the Slack `upload_file` action (Slack 2.4 Commit 3).
 *
 * Per Slack 2.4 plan §4.1 + accepted decision §10 #1:
 *   - `file` is a P-S3 `FileRef`. The schema accepts the full
 *     discriminated union (all three arms parse here); the handler
 *     rejects `kind=provider_url` at runtime with a structured
 *     `SlackUploadConfigError` so the error message can carry the
 *     unblock hint. (We considered schema-level rejection via
 *     `.refine` but a refine-failure surfaces as a Zod issue with
 *     limited room for hint text. Handler-level rejection lets us
 *     deliver the "stage bytes first" guidance verbatim.)
 *   - Channel-id-only contract (Slack 2.3 §6 #5): `channel` is a
 *     strict Slack id matching the V2 Slack handler convention. No
 *     `#name` resolution.
 *   - No `content` / `base64` / URL inline arms. No `asUser` toggle.
 *     No workspace selector. All V1 rot from Slack 2.4 plan §7.
 *   - The schema is `.strict()` — unknown fields are rejected so a
 *     stale workflow definition saved against an older schema can't
 *     smuggle V1 fields into the handler.
 */
export const SlackUploadFileConfigSchema = z
  .object({
    /**
     * Slack channel id. Accepts:
     *   - public channel: `C…`
     *   - private channel (modern): `C…` with channel_type=group  OR  legacy `G…`
     *   - DM: `D…`
     * Same regex shape Slack 2.3's `get_channel_info` uses (which is
     * the widest of the channel-targeted Slack actions).
     */
    channel: z
      .string()
      .regex(
        /^[CDG][A-Z0-9]+$/,
        "Slack channel id must match ^[CDG][A-Z0-9]+$ (C…/G… for channels, D… for DMs).",
      ),

    /**
     * P-S3 FileRef. The schema accepts every arm; the handler rejects
     * `kind=provider_url` at runtime (see schema header).
     */
    file: FileRefSchema,

    /**
     * Optional display title for the Slack share. Falls back to the
     * sanitized `file.name` when omitted (handler responsibility).
     */
    title: z.string().min(1).max(255).optional(),

    /**
     * Optional message posted alongside the file share. Slack's
     * `files.completeUploadExternal` delivers this as the
     * `initial_comment` — no separate `chat.postMessage` round-trip.
     */
    initialComment: z.string().min(1).max(40000).optional(),

    /**
     * Optional Slack message timestamp — file appears as a reply in
     * that thread. Format `"<seconds>.<microseconds>"` exactly as
     * Slack returns. No Slack-URL parsing here; the caller has
     * already extracted the ts at variable resolution time.
     */
    threadTs: z.string().min(1).optional(),
  })
  .strict();

export type SlackUploadFileConfig = z.infer<typeof SlackUploadFileConfigSchema>;
