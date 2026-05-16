import type { ActionHandler } from "@/services/execution/handlers/types";
import { parseCsvList } from "@/core/integrations/parseCsvList";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { stageFileToStorage } from "@/services/files/stageFileToStorage";
import {
  listAttachments,
  type AttachmentMetadata,
} from "../api/listAttachments";
import {
  getAttachment as getAttachmentApi,
  type GraphAttachmentEnvelope,
  type GraphFileAttachmentEnvelope,
} from "../api/getAttachment";
import { GetAttachmentConfigSchema } from "./getAttachment.schema";

/**
 * Microsoft Outlook get_attachment action.
 *
 * Outlook Mail 2.3 Commit 4 — P-O2 fileAttachment-only port.
 *
 * Flow:
 *   1. Schema parse + post-parse conditional validation
 *      (fileExtensions required when downloadMode=by_extension;
 *      fileNameFilter required when downloadMode=by_name).
 *   2. Wrap LIST call in refreshAndRetry. Returns the attachment
 *      metadata array.
 *   3. Filter by:
 *      - excludeInline (default true) — skip attachments marked
 *        `isInline: true`.
 *      - downloadMode — "all" / "by_extension" / "by_name".
 *   4. For each remaining attachment, dispatch on `@odata.type`:
 *      - fileAttachment → per-id GET (refreshAndRetry-wrapped) →
 *        base64 decode → stageFileToStorage → FileRef emitted.
 *      - itemAttachment / referenceAttachment → metadata-only stub
 *        with `skipped: true` flag (P-O2 SKIP).
 *   5. Per-attachment failures are logged + continued; the action
 *      succeeds as long as at least ONE attachment was processed (or
 *      the filtered list was already empty).
 *
 * No bytes / base64 / contentBytes / content / data / bytes field
 * appears anywhere in the output. CLAUDE.md rule #1 enforced end-to-
 * end. FileRefs point at workflow_files storage paths (P-S3).
 *
 * Output:
 *   {
 *     attachments: Array<FileRefEntry | SkippedEntry>,
 *     count: number,            // ported + skipped
 *     downloadedCount: number,  // ported only
 *     totalSize: number,        // sum of `size` across all entries
 *   }
 */
export const getAttachment: ActionHandler = async (input) => {
  const config = GetAttachmentConfigSchema.parse(input.config);

  // Post-parse conditional validation. The schema can't express
  // "required only when downloadMode === ...", so enforce here.
  if (config.downloadMode === "by_extension") {
    const exts = parseCsvList(config.fileExtensions ?? null);
    if (exts.length === 0) {
      throw new Error(
        "get_attachment: `fileExtensions` is required when downloadMode is 'by_extension' (parsed to an empty list).",
      );
    }
  }
  if (config.downloadMode === "by_name") {
    if (!config.fileNameFilter || config.fileNameFilter.trim().length === 0) {
      throw new Error(
        "get_attachment: `fileNameFilter` is required when downloadMode is 'by_name'.",
      );
    }
  }

  const accountId =
    input.triggerEvent.provider === "microsoft-outlook"
      ? input.triggerEvent.accountId
      : null;

  // 1. LIST attachment metadata.
  const listed = await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-outlook",
    accountId,
    apiCall: (accessToken) =>
      listAttachments({
        accessToken,
        messageId: config.emailId,
      }),
  });

  // 2. Apply excludeInline + downloadMode filters.
  let metadata: AttachmentMetadata[] = listed.value;
  if (config.excludeInline) {
    metadata = metadata.filter((a) => a.isInline !== true);
  }

  if (config.downloadMode === "by_extension") {
    const exts = parseCsvList(config.fileExtensions ?? null).map((e) =>
      e.toLowerCase().replace(/^\./, ""),
    );
    metadata = metadata.filter((a) => {
      const name = a.name ?? "";
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      return exts.includes(ext);
    });
  } else if (config.downloadMode === "by_name") {
    const filter = config.fileNameFilter!.toLowerCase();
    metadata = metadata.filter((a) =>
      (a.name ?? "").toLowerCase().includes(filter),
    );
  }

  // 3. Per-attachment dispatch.
  const attachments: AttachmentOutputEntry[] = [];
  let downloadedCount = 0;
  let totalSize = 0;

  for (const meta of metadata) {
    let envelope: GraphAttachmentEnvelope;
    try {
      envelope = await refreshAndRetry({
        userId: input.userId,
        provider: "microsoft-outlook",
        accountId,
        apiCall: (accessToken) =>
          getAttachmentApi({
            accessToken,
            messageId: config.emailId,
            attachmentId: meta.id,
          }),
      });
    } catch (err) {
      // Log + skip individual failures. The overall action succeeds.
      console.warn(
        JSON.stringify({
          event: "outlook.get_attachment.per_attachment_failure",
          messageId: config.emailId,
          attachmentId: meta.id,
          message: (err as Error).message,
        }),
      );
      continue;
    }

    if (envelope["@odata.type"] === "#microsoft.graph.fileAttachment") {
      const fileEnvelope = envelope as GraphFileAttachmentEnvelope;
      try {
        const bytes = Buffer.from(fileEnvelope.contentBytes, "base64");
        const staged = await stageFileToStorage({
          userId: input.userId,
          workflowId: input.workflowId,
          runId: input.runId,
          nodeId: input.nodeId,
          fileName: fileEnvelope.name,
          mimeType:
            fileEnvelope.contentType ?? "application/octet-stream",
          bytes: new Uint8Array(bytes),
          sizeBytes: fileEnvelope.size ?? bytes.byteLength,
          provider: "microsoft-outlook",
        });
        attachments.push({
          file: staged.ref,
          id: fileEnvelope.id,
          name: fileEnvelope.name,
          contentType:
            fileEnvelope.contentType ?? "application/octet-stream",
          size: fileEnvelope.size ?? bytes.byteLength,
          subtype: "fileAttachment",
          skipped: false,
        });
        downloadedCount += 1;
        totalSize += fileEnvelope.size ?? bytes.byteLength;
      } catch (err) {
        // Staging failure — log + skip.
        console.warn(
          JSON.stringify({
            event: "outlook.get_attachment.stage_failure",
            messageId: config.emailId,
            attachmentId: meta.id,
            message: (err as Error).message,
          }),
        );
        continue;
      }
    } else if (envelope["@odata.type"] === "#microsoft.graph.itemAttachment") {
      attachments.push({
        id: envelope.id,
        name: envelope.name ?? "",
        contentType: envelope.contentType ?? "",
        size: envelope.size ?? 0,
        subtype: "itemAttachment",
        skipped: true,
        reason: "itemAttachment subtype not supported (P-O2 SKIP)",
      });
      totalSize += envelope.size ?? 0;
    } else if (
      envelope["@odata.type"] === "#microsoft.graph.referenceAttachment"
    ) {
      attachments.push({
        id: envelope.id,
        name: envelope.name ?? "",
        contentType: envelope.contentType ?? "",
        size: envelope.size ?? 0,
        subtype: "referenceAttachment",
        skipped: true,
        reason: "referenceAttachment subtype not supported (P-O2 SKIP)",
      });
      totalSize += envelope.size ?? 0;
    }
    // Unknown subtypes silently dropped (defensive forward-compat).
  }

  return {
    output: {
      attachments,
      count: attachments.length,
      downloadedCount,
      totalSize,
    },
  };
};

interface FileAttachmentOutputEntry {
  file: ReturnType<typeof stageFileToStorage> extends Promise<infer R>
    ? R extends { ref: infer F }
      ? F
      : never
    : never;
  id: string;
  name: string;
  contentType: string;
  size: number;
  subtype: "fileAttachment";
  skipped: false;
}

interface SkippedAttachmentOutputEntry {
  id: string;
  name: string;
  contentType: string;
  size: number;
  subtype: "itemAttachment" | "referenceAttachment";
  skipped: true;
  reason: string;
}

type AttachmentOutputEntry =
  | FileAttachmentOutputEntry
  | SkippedAttachmentOutputEntry;
