import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { stageFileToStorage } from "@/services/files/stageFileToStorage";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { usersMessagesGet } from "../api/usersMessagesGet";
import { usersMessagesAttachmentsGet } from "../api/usersMessagesAttachmentsGet";
import { extractAttachmentMetadata } from "../triggers/newAttachment/extractAttachmentMetadata";
import { decodeBase64Url } from "../utils/decodeBase64Url";
import { GetAttachmentConfigSchema } from "./getAttachment.schema";

/**
 * Gmail `get_attachment` action handler.
 *
 * Gmail 2.3 Commit 5 — fetches a Gmail attachment's bytes, stages
 * them via P-S3, and emits a `FileRef(kind=v2_storage, provider=
 * "gmail")`. V1's `getAttachment` returned base64 in the output;
 * V1's `downloadAttachment` did cross-provider Drive/OneDrive/Dropbox
 * upload. **Both folded into this single action** per Gmail 2.3
 * plan §8 decision §13.1 — composition (`gmail/get_attachment →
 * drive/upload_file`) replaces V1's monolith.
 *
 * Per Gmail 2.3 plan §7 "Behavior":
 *   1. Look up active Gmail integration (account resolution mirrors
 *      every other Gmail handler — Gmail trigger → use trigger's
 *      accountId; otherwise null → dispatcher picks the user's
 *      single active Gmail integration).
 *   2. Fetch message metadata via `usersMessagesGet({format:"full"})`
 *      and locate the target attachment via
 *      `extractAttachmentMetadata`. If not found, throw BEFORE the
 *      (more expensive) byte fetch. This is the trigger payload's
 *      same `attachmentId` lookup — workflow authors who pass an id
 *      from a different message see a clear error rather than a
 *      cryptic 404 deep in the byte path.
 *   3. Fetch attachment bytes via `usersMessagesAttachmentsGet`
 *      (wraps `users.messages.attachments.get`). Returns the wire
 *      shape `{data: base64url, size?}`.
 *   4. Decode base64url internally → `Uint8Array`. Decoded bytes
 *      never leave this function except as the `bytes` arg to
 *      `stageFileToStorage` (no `data` / `base64` / `content` /
 *      `bytes` key in the output).
 *   5. `stageFileToStorage({provider:"gmail", metadata:{messageId,
 *      attachmentId}})` — the workflow_files row records ONLY the
 *      messageId + attachmentId pair (Gmail 2.3 plan §9 metadata
 *      policy: NO tokens, NO PII, NO email headers).
 *   6. Return the FileRef + metadata fields.
 *
 * Both API round-trips (metadata fetch + byte fetch) are wrapped in
 * `refreshAndRetry`. `stageFileToStorage` errors (upload, metadata
 * insert) propagate verbatim — the partial-failure-orphan-cleanup
 * lives inside that service.
 */
export const getAttachment: ActionHandler = async (input) => {
  const config = GetAttachmentConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "gmail"
      ? input.triggerEvent.accountId
      : null;

  // 1) Fetch message metadata with format=full so we can enumerate
  //    attachment metadata. extractAttachmentMetadata is shared with
  //    the new_attachment trigger — single source of truth for the
  //    MIME-tree walk.
  const message = await refreshAndRetry({
    userId: input.userId,
    provider: "gmail",
    accountId,
    apiCall: async (accessToken) =>
      usersMessagesGet({
        accessToken,
        messageId: config.messageId,
        format: "full",
      }),
  });

  const attachments = extractAttachmentMetadata(message);
  const target = attachments.find(
    (a) => a.attachmentId === config.attachmentId,
  );
  if (!target) {
    throw new Error(
      `Gmail attachment not found: messageId=${config.messageId}, attachmentId=${config.attachmentId}.`,
    );
  }

  // 2) Fetch attachment bytes (wire shape: base64url + optional size).
  const wire = await refreshAndRetry({
    userId: input.userId,
    provider: "gmail",
    accountId,
    apiCall: async (accessToken) =>
      usersMessagesAttachmentsGet({
        accessToken,
        messageId: config.messageId,
        attachmentId: config.attachmentId,
      }),
  });

  // 3) Decode internally. Bytes never reach `output`.
  const bytes = decodeBase64Url(wire.data);

  // 4) Stage to P-S3 storage. Provider-reported size prefers the
  //    bytes endpoint's `size` field, falls back to the part-level
  //    `sizeBytes` from extraction.
  const reportedSize =
    typeof wire.size === "number" ? wire.size : target.sizeBytes;
  const staged = await stageFileToStorage({
    userId: input.userId,
    workflowId: input.workflowId,
    runId: input.runId,
    nodeId: input.nodeId,
    fileName: target.filename,
    mimeType: target.mimeType || "application/octet-stream",
    bytes,
    sizeBytes: reportedSize,
    provider: "gmail",
    // Metadata policy (Gmail 2.3 plan §9): ONLY messageId +
    // attachmentId. No headers, no subject, no addresses, no tokens.
    metadata: {
      messageId: config.messageId,
      attachmentId: config.attachmentId,
    },
  });

  return {
    output: {
      file: staged.ref,
      messageId: config.messageId,
      attachmentId: config.attachmentId,
      fileName: target.filename,
      mimeType: target.mimeType || "application/octet-stream",
      sizeBytes: reportedSize,
    },
  };
};
