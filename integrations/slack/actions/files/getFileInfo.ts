import { decryptToken } from "@/core/encryption/tokens";
import { fileRefFromProviderUrl } from "@/core/files/createFileRef";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { SlackApiError } from "../../api/errors";
import { filesInfo } from "../../api/filesInfo";
import { SlackGetFileInfoConfigSchema } from "./getFileInfo.schema";

/**
 * Slack `get_file_info` action handler (Slack 2.4 Commit 4).
 *
 * Per Slack 2.4 plan §4.3:
 *   1. Look up the Slack integration + decrypt the bot token.
 *   2. `files.info(fileId, count?)` → metadata.
 *   3. Construct `FileRef(kind=provider_url, provider="slack")` via
 *      `fileRefFromProviderUrl` (never object-literal).
 *   4. Project flat metadata (title, fileType, permalink,
 *      permalinkPublic, uploaderId, channels, isPublic, isExternal,
 *      createdAt, commentsCount, comments) alongside the FileRef.
 *
 * Output never carries bytes / base64 / `content` / `data` (CLAUDE.md
 * rule #1). This action is the "metadata only" arm of the Slack file
 * surface; consumers that need bytes compose `download_file` or pass
 * the FileRef to a future provider-specific fetcher when one lands.
 */
export const getFileInfo: ActionHandler = async (input) => {
  const config = SlackGetFileInfoConfigSchema.parse(input.config);

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

  const { file: slackFile, comments } = await filesInfo({
    botToken,
    fileId: config.fileId,
    ...(config.includeComments === true && { count: 100 }),
  });

  // Field projection. Slack guarantees `id` + `name` on `ok: true`;
  // we still defend each read so a malformed Slack response surfaces
  // as a clear local error rather than a TypeError downstream.
  const fileName = readString(slackFile, "name");
  const mimeType = readString(slackFile, "mimetype");
  const urlPrivate = readString(slackFile, "url_private");
  if (!fileName || !mimeType || !urlPrivate) {
    throw new SlackApiError("malformed_response");
  }

  const sizeBytes = readNumber(slackFile, "size");
  const title = readString(slackFile, "title");
  const fileType = readString(slackFile, "filetype");
  const permalink = readString(slackFile, "permalink");
  const permalinkPublic = readString(slackFile, "permalink_public");
  const uploaderId = readString(slackFile, "user");
  const channels = readStringArray(slackFile, "channels") ?? [];
  const isPublic = readBoolean(slackFile, "is_public") ?? false;
  const isExternal = readBoolean(slackFile, "is_external") ?? false;
  const createdEpoch = readNumber(slackFile, "created");
  const createdAt =
    createdEpoch !== null
      ? new Date(createdEpoch * 1000).toISOString()
      : null;
  const commentsCount = readNumber(slackFile, "num_comments") ?? 0;

  const fileRef = fileRefFromProviderUrl({
    name: fileName,
    mimeType,
    ...(sizeBytes !== null && { sizeBytes }),
    url: urlPrivate,
    provider: "slack",
    providerFileId: config.fileId,
    ...(permalink && { metadata: { permalink } }),
  });

  return {
    output: {
      file: fileRef,
      fileId: config.fileId,
      fileName,
      title: title ?? null,
      fileType: fileType ?? null,
      mimeType,
      sizeBytes: sizeBytes ?? null,
      permalink: permalink ?? null,
      permalinkPublic: permalinkPublic ?? null,
      uploaderId: uploaderId ?? null,
      channels,
      isPublic,
      isExternal,
      createdAt,
      commentsCount,
      // When the caller did not ask for comments, we still expose the
      // (empty) array for downstream-shape stability.
      comments: config.includeComments === true ? comments : [],
    },
  };
};

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

function readBoolean(
  obj: Readonly<Record<string, unknown>>,
  key: string,
): boolean | null {
  const v = obj[key];
  return typeof v === "boolean" ? v : null;
}

function readStringArray(
  obj: Readonly<Record<string, unknown>>,
  key: string,
): readonly string[] | null {
  const v = obj[key];
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string" && item.length > 0) out.push(item);
  }
  return out;
}
