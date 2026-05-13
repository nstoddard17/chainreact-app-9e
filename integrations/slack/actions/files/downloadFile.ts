import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import { stageFileToStorage } from "@/services/files/stageFileToStorage";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { SlackApiError } from "../../api/errors";
import { filesInfo } from "../../api/filesInfo";
import { SlackDownloadFileConfigSchema } from "./downloadFile.schema";

/**
 * Slack `download_file` action handler (Slack 2.4 Commit 4).
 *
 * Per Slack 2.4 plan §4.2 + §7 V1 rot fixes:
 *   1. Look up the Slack integration + decrypt the bot token.
 *   2. `files.info(fileId)` → metadata (name, mimetype, size,
 *      url_private[_download]). Slack errors (`file_not_found`,
 *      `file_deleted`, etc.) propagate verbatim via `SlackApiError`.
 *   3. Resolve the download URL — prefer `url_private_download`,
 *      fall back to `url_private`. If neither exists, fail with a
 *      clear `SlackApiError("file_no_download_url")`.
 *   4. Fetch bytes with `Authorization: Bearer <bot token>`. Direct
 *      fetch — we explicitly DO NOT route through P-S3's
 *      `fetchFileBytes` because that helper throws
 *      `UnsupportedProviderFetchError` for `provider_url` kind (the
 *      generic cross-provider fetcher is intentionally absent per
 *      plan §10 #1). Slack-specific auth lives in this handler.
 *   5. Stage bytes via `services/files/stageFileToStorage` → returns
 *      `FileRef(kind=v2_storage, provider="slack")`.
 *   6. Return `{ file, fileId, fileName, mimeType, sizeBytes }`.
 *
 * No bytes / base64 / `content` / `data` field ever appears in the
 * output (CLAUDE.md rule #1).
 *
 * Security:
 *   - `Authorization: Bearer …` header MUST NOT appear in error
 *     messages. The bot token is decrypted server-side and never
 *     surfaces; this handler enforces the same hygiene around the
 *     `url_private_download` URL itself (the URL is bot-token-bound
 *     but is still a downloadable handle for the duration of the
 *     bot's session — log/error redaction is defense in depth).
 *   - On non-2xx, `SlackApiError("http_<status>")` carries the
 *     status only. No URL, no token, no response body.
 *   - On transport throw, `SlackApiError("file_download_transport_error")`.
 *     The original error's message is dropped — fetch's underlying
 *     cause may include the URL.
 */
export const downloadFile: ActionHandler = async (input) => {
  const config = SlackDownloadFileConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "slack"
      ? input.triggerEvent.accountId
      : null;

  const integration = await getActiveForExecution(
    input.userId,
    "slack",
    accountId,
  );
  if (!integration) {
    throw new Error(
      accountId
        ? `No active Slack integration found for workspace ${accountId}.`
        : "No active Slack integration found for this user.",
    );
  }
  const botToken = decryptToken(integration.accessTokenEncrypted);

  // 1) Metadata round-trip — gives us name, mimetype, size, the
  //    private download URL, and the permalink to record on the FileRef.
  const { file: slackFile } = await filesInfo({
    botToken,
    fileId: config.fileId,
  });

  // 2) Resolve download URL. Slack returns both `url_private` and
  //    `url_private_download`; the latter forces a `Content-Disposition:
  //    attachment` response and is preferred. Either works with bot
  //    auth.
  const downloadUrl =
    readString(slackFile, "url_private_download") ??
    readString(slackFile, "url_private");
  if (!downloadUrl) {
    throw new SlackApiError("file_no_download_url");
  }

  const fileName =
    readString(slackFile, "name") ?? `slack-file-${config.fileId}`;
  const mimeType =
    readString(slackFile, "mimetype") ?? "application/octet-stream";
  const reportedSize = readNumber(slackFile, "size");
  const permalink = readString(slackFile, "permalink");
  const slackUploader = readString(slackFile, "user");

  // 3) Fetch bytes with the bot bearer.
  const bytes = await fetchSlackFileBytes(downloadUrl, botToken);

  // 4) Stage. `stageFileToStorage` owns the workflow-files bucket
  //    upload + metadata insert + orphan cleanup on failure. The
  //    returned FileRef points at the staged storage path.
  const staged = await stageFileToStorage({
    userId: input.userId,
    workflowId: input.workflowId,
    runId: input.runId,
    nodeId: input.nodeId,
    fileName,
    mimeType,
    bytes,
    ...(reportedSize !== null && { sizeBytes: reportedSize }),
    provider: "slack",
    metadata: buildStagedMetadata(permalink, slackUploader),
  });

  return {
    output: {
      file: staged.ref,
      fileId: config.fileId,
      fileName,
      mimeType,
      sizeBytes: bytes.byteLength,
    },
  };
};

/**
 * Fetch Slack's `url_private_download` with the bot bearer. Throws
 * SlackApiError with a sterile code on any failure; the URL and the
 * token never appear in the thrown message (defense-in-depth — the
 * URL is bot-token-bound but is still secret-equivalent for the
 * bot's session).
 */
async function fetchSlackFileBytes(
  url: string,
  botToken: string,
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { authorization: `Bearer ${botToken}` },
    });
  } catch {
    // The thrown cause may include the URL (fetch error messages
    // sometimes echo it). Drop the underlying message.
    throw new SlackApiError("file_download_transport_error");
  }

  if (!response.ok) {
    // Status only — never include URL or response body.
    throw new SlackApiError(`http_${response.status}`);
  }
  const buf = await response.arrayBuffer();
  return new Uint8Array(buf);
}

function buildStagedMetadata(
  permalink: string | null,
  slackUserId: string | null,
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  if (permalink) out.permalink = permalink;
  if (slackUserId) out.slackUserId = slackUserId;
  return Object.keys(out).length > 0 ? out : undefined;
}

function readString(
  obj: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const v = obj[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function readNumber(
  obj: Readonly<Record<string, unknown>>,
  key: string,
): number | null {
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
