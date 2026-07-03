import { slackApiRequestForm, type SlackOkResponse } from "./_request";
import { SlackApiError } from "./errors";

/**
 * Slack `files.info` client (Slack 2.4 Commit 2).
 *
 * Reads a single Slack file object by id. Slack 2.4 uses this from
 * three places:
 *   - `download_file`: metadata + `url_private_download` lookup before
 *     fetching bytes (Commit 4).
 *   - `get_file_info`: metadata-only action (Commit 4).
 *   - upload-side defensive re-read is NOT done — `filesCompleteUploadExternal`
 *     returns the file object directly.
 *
 * Slack docs: https://api.slack.com/methods/files.info
 *
 * TRANSPORT: form-encoded (`slackApiRequestForm`), NOT JSON. Verified live —
 * `files.info` rejects the `application/json` body with `invalid_arguments` (same class
 * as `conversations.info` / `users.info` / `files.getUploadURLExternal`); its params are
 * flat scalars (`file` / `count`), so it uses the form transport. (This bug silently
 * broke `get_file_info` + `download_file` until it was caught by the file-action smoke.)
 *
 * Scope required: `files:read` (added in Slack 2.4 Commit 2).
 *
 * The optional `count` parameter requests up to N comments (Slack
 * paginates beyond that). When omitted Slack returns no comments.
 * The wrapper does NOT page comments — the action layer decides how
 * deep to read; only the first page is exposed here.
 */
export interface FilesInfoInput {
  botToken: string;
  /** Slack file id (F-prefixed). */
  fileId: string;
  /**
   * Optional: ask Slack for up to N comments. Slack maxes out at 1000
   * for this endpoint; we don't enforce — Slack rejects out-of-bounds
   * with its own error code.
   */
  count?: number;
}

export interface FilesInfoResult {
  /** Slack file object, verbatim (snake_case keys preserved). */
  file: Readonly<Record<string, unknown>>;
  /**
   * Comments returned with the file (empty when caller omitted
   * `count`). Caller decides whether to project these into the
   * action output.
   */
  comments: ReadonlyArray<Readonly<Record<string, unknown>>>;
}

interface SlackResponseBody extends SlackOkResponse {
  file?: Record<string, unknown>;
  comments?: Array<Record<string, unknown>>;
}

export async function filesInfo(
  input: FilesInfoInput,
): Promise<FilesInfoResult> {
  const params: Record<string, string | number | boolean | undefined> = {
    file: input.fileId,
  };
  if (input.count !== undefined) params.count = input.count;

  const response = await slackApiRequestForm<SlackResponseBody>(
    "files.info",
    input.botToken,
    params,
  );

  if (!response.file) {
    // Slack guarantees `file` on `ok: true`. Defense in depth — same
    // shape as every other wrapper's missing-field check.
    throw new SlackApiError("file_not_found");
  }
  return {
    file: response.file,
    comments: response.comments ?? [],
  };
}
