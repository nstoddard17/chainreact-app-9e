import { slackApiRequest, type SlackOkResponse } from "./_request";
import { SlackApiError } from "./errors";

/**
 * Slack `files.completeUploadExternal` client (Slack 2.4 Commit 2).
 *
 * Step 3 of Slack's two-step upload: after the bytes are POSTed to the
 * URL Slack returned in `filesGetUploadURLExternal`, this endpoint
 * finalizes the share, attaches the file to one or more channels (or
 * a DM), and returns the resolved Slack file metadata
 * (`url_private`, `permalink`, `mimetype`, etc.) the upload-action
 * needs to build its `FileRef(kind=provider_url)` output.
 *
 * Slack docs: https://api.slack.com/methods/files.completeUploadExternal
 *
 * Scope required: `files:write` (added in Slack 2.4 Commit 2).
 *
 * Slack's `files` array param accepts `{ id, title? }` per file. Slack
 * 2.4 Commit 3 (`upload_file`) only ever passes a single file, but
 * the wrapper preserves the array shape so future bulk-upload work
 * doesn't have to change the wrapper signature.
 *
 * `channelId` is a single channel id; Slack 2.4's `upload_file` action
 * accepts a single channel only (matching the Slack 2.3 channel-id-
 * only contract). Slack supports a comma-separated value here for
 * multi-channel shares, but the action layer (not this wrapper) owns
 * that flattening if/when we expose it.
 */
export interface FilesCompleteUploadExternalFile {
  /** Slack file id returned by `filesGetUploadURLExternal`. */
  id: string;
  /**
   * Optional display title. When omitted Slack falls back to the
   * filename Slack derived at upload time.
   */
  title?: string;
}

export interface FilesCompleteUploadExternalInput {
  botToken: string;
  files: ReadonlyArray<FilesCompleteUploadExternalFile>;
  /**
   * Channel id (C…, G…, D…). Slack 2.4 emits one id; multi-channel
   * sharing is composed at the action layer if exposed later.
   */
  channelId: string;
  /** Optional message attached to the file share. */
  initialComment?: string;
  /**
   * Optional Slack message timestamp — when set, the file appears as
   * a reply in that thread.
   */
  threadTs?: string;
}

export interface FilesCompleteUploadExternalResult {
  /**
   * Slack file objects returned by the API on success. Caller projects
   * the fields it needs (`id`, `name`, `mimetype`, `url_private`,
   * `permalink`, `channels`, …) into its `FileRef` + output shape.
   */
  files: ReadonlyArray<Readonly<Record<string, unknown>>>;
}

interface SlackResponseBody extends SlackOkResponse {
  files?: Array<Record<string, unknown>>;
}

export async function filesCompleteUploadExternal(
  input: FilesCompleteUploadExternalInput,
): Promise<FilesCompleteUploadExternalResult> {
  if (input.files.length === 0) {
    // Slack would reject this with `no_file` — short-circuit locally
    // so the error shape is consistent with the rest of the wrapper's
    // defense-in-depth checks rather than a remote round-trip.
    throw new SlackApiError("no_file");
  }

  const body: Record<string, unknown> = {
    files: input.files.map((f) =>
      f.title !== undefined ? { id: f.id, title: f.title } : { id: f.id },
    ),
    channel_id: input.channelId,
  };
  if (input.initialComment !== undefined) {
    body.initial_comment = input.initialComment;
  }
  if (input.threadTs !== undefined) {
    body.thread_ts = input.threadTs;
  }

  const response = await slackApiRequest<SlackResponseBody>(
    "files.completeUploadExternal",
    input.botToken,
    body,
  );

  if (!response.files || response.files.length === 0) {
    // Slack guarantees `files` on `ok: true`. Defense-in-depth: a
    // malformed-but-200 response surfaces as the same SlackApiError
    // shape as every other wrapper.
    throw new SlackApiError("malformed_response");
  }
  return { files: response.files };
}
