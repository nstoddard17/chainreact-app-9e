import { decryptToken } from "@/core/encryption/tokens";
import { fileRefFromProviderUrl } from "@/core/files/createFileRef";
import {
  WORKFLOW_FILES_BUCKET,
  fetchFileBytes,
  type WorkflowFilesStorageAdapter,
} from "@/core/files/fetchFileBytes";
import { getFileRefSizeGuidance } from "@/core/files/limits";
import { getActiveForExecution } from "@/repositories/integrations";
import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { filesCompleteUploadExternal } from "../../api/filesCompleteUploadExternal";
import { filesGetUploadURLExternal } from "../../api/filesGetUploadURLExternal";
import { uploadBytesToSlack } from "../../api/_uploadBytesToSlack";
import { SlackUploadFileConfigSchema } from "./uploadFile.schema";

/**
 * Slack `upload_file` action handler (Slack 2.4 Commit 3).
 *
 * Per Slack 2.4 plan §4.1 + accepted decisions §10:
 *   1. Parse + validate config (schema accepts every FileRef arm).
 *   2. Reject `kind=provider_url` with a structured
 *      `SlackUploadConfigError` carrying the unblock hint. Per
 *      plan §10 #1: generic `provider_url` fetching requires
 *      provider-safe auth handling that does not exist yet.
 *   3. Resolve provider bytes via P-S3's `fetchFileBytes`:
 *        - `v2_storage` → through a Supabase storage adapter we
 *          construct here from the service-role client.
 *        - `signed_url` → through `fetchFileBytes`'s plain `fetch`
 *          path.
 *   4. Advisory size check against `getFileRefSizeGuidance("slack")`.
 *      Warn-only — Slack enforces the hard cap. (CLAUDE.md companion
 *      rule: per-provider size guidance is advisory until Phase 7.)
 *   5. Slack two-step upload:
 *        a. `filesGetUploadURLExternal({filename, length})`
 *        b. `uploadBytesToSlack({uploadUrl, bytes})`  — raw S3 POST,
 *           no auth header. Wrapper never logs the URL or bytes.
 *        c. `filesCompleteUploadExternal({files, channelId, ...})`
 *   6. Build output `FileRef(kind=provider_url, provider="slack")`
 *      via `fileRefFromProviderUrl`. Never construct the FileRef as
 *      an object literal (CLAUDE.md rule #2).
 *
 * Output shape:
 *   { file: FileRef(provider_url), fileId, permalink, channelIds }
 *
 * No bytes / base64 / data URLs ever appear in the output. (CLAUDE.md
 * rule #1.)
 */

/**
 * Surfaced when the user-supplied `FileRef` cannot be processed by
 * `upload_file`. Distinct from `SlackApiError` because the failure is
 * config-shape, not Slack-side.
 */
export class SlackUploadConfigError extends Error {
  readonly code: string;
  readonly hint: string;
  constructor(code: string, message: string, hint: string) {
    super(message);
    this.name = "SlackUploadConfigError";
    this.code = code;
    this.hint = hint;
  }
}

/**
 * Build a `WorkflowFilesStorageAdapter` backed by the service-role
 * Supabase client's storage SDK. Inlined here rather than extracted
 * to `services/files/` so the upload action stays self-contained for
 * Slack 2.4 Commit 3. If a second consumer needs the same adapter
 * (e.g. Slack 2.4 Commit 4 `download_file` would NOT — it writes via
 * `stageFileToStorage`), this lifts to `services/files/`.
 */
function buildWorkflowFilesStorageAdapter(
  reason: string,
): WorkflowFilesStorageAdapter {
  return {
    async download(storagePath: string): Promise<Uint8Array> {
      const supabase = getServiceRoleClient(reason);
      const { data, error } = await supabase.storage
        .from(WORKFLOW_FILES_BUCKET)
        .download(storagePath);
      if (error || !data) {
        // The adapter contract forbids leaking signed URLs / tokens.
        // Supabase storage errors don't include either, but we keep
        // the message generic on principle.
        throw new Error(
          `workflow-files download failed: ${error?.message ?? "no data"}`,
        );
      }
      const buf = await data.arrayBuffer();
      return new Uint8Array(buf);
    },
  };
}

export const uploadFile: ActionHandler = async (input) => {
  const config = SlackUploadFileConfigSchema.parse(input.config);

  // Provider-url rejection — handler level so the error can carry the
  // unblock hint per plan §10 #1.
  if (config.file.kind === "provider_url") {
    throw new SlackUploadConfigError(
      "provider_url_unsupported",
      "Slack upload_file does not support FileRef(kind=provider_url) yet.",
      "Stage bytes first via a download/staging action (e.g. slack:download_file) or supply a FileRef(kind=v2_storage | signed_url).",
    );
  }

  // From here on, `config.file.kind` is narrowed to "v2_storage" |
  // "signed_url" — both arms supported by `fetchFileBytes` in P-S3.
  const storage =
    config.file.kind === "v2_storage"
      ? buildWorkflowFilesStorageAdapter(
          `slack:upload_file run=${input.runId} node=${input.nodeId}`,
        )
      : undefined;

  const fetched = await fetchFileBytes(config.file, { storage });

  // Advisory size guidance. Warn-only — Slack enforces the hard cap;
  // hard quotas land in Phase 7 per CLAUDE.md companion rule.
  const guidance = getFileRefSizeGuidance("slack");
  if (fetched.sizeBytes > guidance) {
    console.warn(
      JSON.stringify({
        event: "slack.upload_file.size_exceeds_guidance",
        runId: input.runId,
        nodeId: input.nodeId,
        actualSize: fetched.sizeBytes,
        guidance,
      }),
    );
  }

  // Slack token lookup. accountId from triggerEvent is Slack-only;
  // matches the convention every other Slack action handler uses.
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

  // Step 1: ask Slack for an upload URL.
  const { uploadUrl, fileId: slackFileId } = await filesGetUploadURLExternal({
    botToken,
    filename: fetched.name,
    length: fetched.sizeBytes,
  });

  // Step 2: POST bytes to Slack's one-shot URL. The wrapper enforces
  // the no-leak contract — URL and bytes never appear in errors or
  // logs.
  await uploadBytesToSlack({
    uploadUrl,
    bytes: fetched.bytes,
    contentType: fetched.mimeType,
  });

  // Step 3: finalize. Title falls back to file.name when caller
  // omitted it (matches V1 default; accepted per Slack 2.4 plan §7
  // rot #10).
  const completeResult = await filesCompleteUploadExternal({
    botToken,
    files: [
      {
        id: slackFileId,
        title: config.title ?? fetched.name,
      },
    ],
    channelId: config.channel,
    ...(config.initialComment !== undefined && {
      initialComment: config.initialComment,
    }),
    ...(config.threadTs !== undefined && { threadTs: config.threadTs }),
  });

  const slackFile = completeResult.files[0];
  if (!slackFile) {
    // Defense-in-depth — `filesCompleteUploadExternal` already
    // throws when Slack returns an empty files array, but if
    // future Slack behavior shifts we want a clear local error.
    throw new Error("Slack files.completeUploadExternal returned no file.");
  }

  // Project Slack's returned file object into a FileRef + sibling
  // metadata. Construction through the builder enforces sanitize +
  // schema validation (CLAUDE.md rule #2).
  const fileName = readString(slackFile, "name") ?? fetched.name;
  const mimeType =
    readString(slackFile, "mimetype") ?? fetched.mimeType;
  const sizeBytes =
    readNumber(slackFile, "size") ?? fetched.sizeBytes;
  const urlPrivate =
    readString(slackFile, "url_private") ??
    readString(slackFile, "url_private_download");
  const permalink = readString(slackFile, "permalink");
  const channelIds = readStringArray(slackFile, "channels") ?? [config.channel];

  if (!urlPrivate) {
    // Slack always returns one of these on a successful share. If
    // the response shape is broken we surface a clear handler error
    // rather than build a malformed FileRef.
    throw new Error(
      "Slack files.completeUploadExternal response is missing url_private.",
    );
  }

  const fileRef = fileRefFromProviderUrl({
    name: fileName,
    mimeType,
    sizeBytes,
    url: urlPrivate,
    provider: "slack",
    providerFileId: slackFileId,
    ...(permalink !== null && permalink !== undefined && {
      metadata: { permalink },
    }),
  });

  return {
    output: {
      file: fileRef,
      fileId: slackFileId,
      permalink: permalink ?? null,
      channelIds,
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
