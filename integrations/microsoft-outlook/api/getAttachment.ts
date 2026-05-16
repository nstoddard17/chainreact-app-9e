import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";

/**
 * Wrapper for Microsoft Graph `GET /me/messages/{id}/attachments/{attId}`.
 *
 * Endpoint: GET {base}/v1.0/me/messages/{id}/attachments/{attachmentId}
 * Used by:  get_attachment action (Outlook Mail 2.3 Commit 4).
 *
 * Returns the full Graph attachment envelope. Subtype is discriminated
 * by `@odata.type`:
 *
 *   - `#microsoft.graph.fileAttachment` — carries base64 `contentBytes`.
 *     get_attachment dispatches these through `stageFileToStorage` →
 *     `FileRef(kind=v2_storage)`.
 *   - `#microsoft.graph.itemAttachment` — embedded message / event.
 *     Has `item: { @odata.type, ... }` instead of `contentBytes`.
 *     SKIPped per P-O2; metadata-only stub emitted with
 *     `skipped: true`.
 *   - `#microsoft.graph.referenceAttachment` — link to OneDrive /
 *     SharePoint file. Has `sourceUrl`. SKIPped per P-O2;
 *     metadata-only stub.
 *
 * Scope: requires `Mail.Read` (already in manifest).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (caught by refreshAndRetry).
 *   - generic `Error` on other failures with Graph error surfaced.
 *
 * Per-attachment failures are caught by the handler; this wrapper only
 * reports its own per-call shape.
 */

export interface GraphFileAttachmentEnvelope {
  "@odata.type": "#microsoft.graph.fileAttachment";
  id: string;
  name: string;
  contentType: string;
  size: number;
  /** Base64 string. Handler decodes via Buffer.from(..., "base64"). */
  contentBytes: string;
  isInline?: boolean;
  lastModifiedDateTime?: string;
}

export interface GraphItemAttachmentEnvelope {
  "@odata.type": "#microsoft.graph.itemAttachment";
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  /** Embedded message/event; opaque to V2. Used for diagnostic only. */
  item?: { "@odata.type"?: string };
}

export interface GraphReferenceAttachmentEnvelope {
  "@odata.type": "#microsoft.graph.referenceAttachment";
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  sourceUrl?: string;
}

export type GraphAttachmentEnvelope =
  | GraphFileAttachmentEnvelope
  | GraphItemAttachmentEnvelope
  | GraphReferenceAttachmentEnvelope;

export interface GetAttachmentInput {
  accessToken: string;
  /** Graph message id; URL-encoded inside this wrapper. */
  messageId: string;
  /** Graph attachment id from the LIST call. URL-encoded here. */
  attachmentId: string;
}

export async function getAttachment(
  input: GetAttachmentInput,
): Promise<GraphAttachmentEnvelope> {
  const url = `${graphApiBase()}/v1.0/me/messages/${encodeURIComponent(
    input.messageId,
  )}/attachments/${encodeURIComponent(input.attachmentId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph GET me/messages/{id}/attachments/{attId} returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph GET me/messages/{id}/attachments/{attId} failed: ${surfaceGraphError(
        text,
        res.status,
      )}`,
    );
  }

  return (await res.json()) as GraphAttachmentEnvelope;
}
