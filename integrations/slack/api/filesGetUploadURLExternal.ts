import { slackApiRequestForm, type SlackOkResponse } from "./_request";
import { SlackApiError } from "./errors";

/**
 * Slack `files.getUploadURLExternal` client (Slack 2.4 Commit 2).
 *
 * Step 1 of Slack's modern two-step upload: ask Slack for a one-shot
 * upload URL and a file id. The caller then POSTs bytes to that URL
 * via `_uploadBytesToSlack`, then finalizes the share with
 * `filesCompleteUploadExternal`. (The legacy `files.upload` endpoint
 * was deprecated by Slack — see Slack 2.4 plan §1 / §7.)
 *
 * Slack docs: https://api.slack.com/methods/files.getUploadURLExternal
 *
 * TRANSPORT: form-encoded (`slackApiRequestForm`), NOT JSON. Verified live —
 * `files.getUploadURLExternal` rejects the `application/json` body with
 * `invalid_arguments` (same class as `conversations.info` / `users.info`); its
 * documented content type is `application/x-www-form-urlencoded` and its params are
 * flat scalars (`filename` / `length` / `snippet_type`), so it uses the form transport.
 * (chat.postMessage / Block Kit keep JSON because they carry nested payloads.)
 *
 * Scope required: `files:write` (added in Slack 2.4 Commit 2).
 *
 * Slack's `length` field is documented as a string; we coerce to
 * string so callers can pass a JS `number` (the natural shape for a
 * byte length).
 */
export interface FilesGetUploadURLExternalInput {
  botToken: string;
  /** File name including extension — used by Slack to infer file type. */
  filename: string;
  /** Byte length of the payload that will be POSTed to the returned URL. */
  length: number;
  /**
   * Optional Slack snippet type override (e.g. `"text"`, `"markdown"`).
   * Most callers omit this; Slack derives type from `filename`.
   */
  snippetType?: string;
}

export interface FilesGetUploadURLExternalResult {
  /**
   * One-shot upload URL. Treat as a secret-equivalent value — see
   * `_uploadBytesToSlack` for the no-logging contract on this URL.
   */
  uploadUrl: string;
  /**
   * Slack file id (F-prefixed). Pass to `filesCompleteUploadExternal`
   * to finalize the share.
   */
  fileId: string;
}

interface SlackResponseBody extends SlackOkResponse {
  upload_url?: string;
  file_id?: string;
}

export async function filesGetUploadURLExternal(
  input: FilesGetUploadURLExternalInput,
): Promise<FilesGetUploadURLExternalResult> {
  const params: Record<string, string | number | boolean | undefined> = {
    filename: input.filename,
    length: String(input.length),
  };
  if (input.snippetType !== undefined) params.snippet_type = input.snippetType;

  const response = await slackApiRequestForm<SlackResponseBody>(
    "files.getUploadURLExternal",
    input.botToken,
    params,
  );

  // Defense-in-depth: Slack guarantees both fields on `ok: true`. A
  // malformed-but-200 response should surface the same SlackApiError
  // shape as every other wrapper's missing-field check.
  if (!response.upload_url || !response.file_id) {
    throw new SlackApiError("malformed_response");
  }
  return {
    uploadUrl: response.upload_url,
    fileId: response.file_id,
  };
}
