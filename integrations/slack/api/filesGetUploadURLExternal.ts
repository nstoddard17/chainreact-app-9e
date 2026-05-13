import { slackApiRequest, type SlackOkResponse } from "./_request";
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
 * Implementation note — content type: Slack's reference docs list
 * `application/x-www-form-urlencoded` as the documented content type
 * for this endpoint, but JSON POST is accepted in practice by all
 * other V2 Slack wrappers (`chat.postMessage`, `conversations.*`,
 * etc.) and is what the official Bolt SDK uses. We use the shared
 * `slackApiRequest` helper for consistency with every other V2 Slack
 * wrapper. If Slack ever rejects JSON for this endpoint we add a
 * `slackApiFormRequest` sibling and migrate — not before.
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
  const body: Record<string, unknown> = {
    filename: input.filename,
    length: String(input.length),
  };
  if (input.snippetType !== undefined) body.snippet_type = input.snippetType;

  const response = await slackApiRequest<SlackResponseBody>(
    "files.getUploadURLExternal",
    input.botToken,
    body,
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
