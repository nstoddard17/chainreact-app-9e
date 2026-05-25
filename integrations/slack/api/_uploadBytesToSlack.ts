import { SlackApiError } from "./errors";

/**
 * Raw bytes POST to the Slack-issued upload URL (Slack 2.4 Commit 2).
 *
 * Step 2 of Slack's two-step upload — after `filesGetUploadURLExternal`
 * returns an `upload_url`, the caller POSTs the actual bytes to that
 * URL. The destination is a per-upload AWS S3 presigned URL (not a
 * `slack.com/api/*` Web API endpoint), so we do NOT route through
 * `slackApiRequest`:
 *   - No JSON body — bytes go raw with `Content-Type: application/octet-stream`.
 *   - No `Authorization` header (the URL is a one-shot pre-signed value).
 *   - No `ok: true/false` JSON response shape — Slack-S3 returns plain HTTP.
 *
 * Security contract (Slack 2.4 plan §7 V1 rot #9):
 *   - The `uploadUrl` is secret-equivalent. It MUST NOT appear in any
 *     thrown error message or log line.
 *   - The bytes payload MUST NOT appear in any thrown error message or
 *     log line. The wrapper never logs.
 *   - On non-2xx the wrapper throws `SlackApiError("upload_failed")`
 *     (Slack-shaped code; no `http_<status>` because the destination
 *     isn't a Slack Web API endpoint and the status mapping would be
 *     misleading).
 *
 * Idempotency: the `upload_url` is single-use. A second POST returns
 * 4xx; callers re-issue a new URL via `filesGetUploadURLExternal`
 * rather than retry the same URL.
 */
export interface UploadBytesToSlackInput {
  /** One-shot Slack-issued upload URL from `filesGetUploadURLExternal`. */
  uploadUrl: string;
  /** Bytes to upload. */
  bytes: Uint8Array;
  /**
   * Optional override for the `Content-Type` header. Slack-S3 ignores
   * the content type for the upload itself — Slack derives the file's
   * MIME from `filename` / `snippet_type` when the file is finalized
   * via `filesCompleteUploadExternal`. We default to
   * `application/octet-stream` because that's what the V1 client used
   * and is the safest catch-all for arbitrary bytes.
   */
  contentType?: string;
}

export async function uploadBytesToSlack(
  input: UploadBytesToSlackInput,
): Promise<void> {
  // Type-only alias for the `body` argument of `fetch()`. Inferring
  // from `typeof fetch` (runtime value) avoids referencing DOM-only
  // typenames (`BodyInit` / `RequestInit`) that the eslint `no-undef`
  // rule flags even in type position.
  type FetchBody = NonNullable<Parameters<typeof fetch>[1]>["body"];

  let response: Response;
  try {
    // `Uint8Array` is a valid `fetch` body at runtime (Node's
    // undici-backed fetch and modern browsers both accept it), but
    // the DOM `BodyInit` type union doesn't include it on every
    // TypeScript lib version. Cast at the boundary.
    response = await fetch(input.uploadUrl, {
      method: "POST",
      headers: {
        "content-type": input.contentType ?? "application/octet-stream",
      },
      body: input.bytes as unknown as FetchBody,
    });
  } catch {
    // Transport failure. The thrown error message MUST NOT include the
    // upload URL — that value is secret-equivalent. We swallow the
    // underlying cause entirely and surface a sterile code.
    throw new SlackApiError("upload_transport_error");
  }

  if (!response.ok) {
    // Slack-S3 non-2xx. Body may contain XML error detail (S3 style);
    // we deliberately don't read it — surfacing it could leak path
    // segments of the upload URL. The status code alone is enough for
    // operators to diagnose via timestamps.
    throw new SlackApiError("upload_failed");
  }
}
