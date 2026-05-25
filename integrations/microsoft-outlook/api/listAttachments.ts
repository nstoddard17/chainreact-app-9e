import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";

/**
 * Wrapper for Microsoft Graph `GET /me/messages/{id}/attachments`.
 *
 * Endpoint: GET {base}/v1.0/me/messages/{id}/attachments
 * Used by:  get_attachment action (Outlook Mail 2.3 Commit 4).
 *
 * Returns the list of attachment metadata for the message — each entry
 * carries `@odata.type` (the subtype discriminator), `name`,
 * `contentType`, `size`, and `isInline`. The list call may also include
 * `contentBytes` on small fileAttachment entries (Graph inlines payloads
 * under ~4 MB), but get_attachment always issues a per-id GET for
 * consistent byte materialization regardless of size.
 *
 * Scope: requires `Mail.Read` (already in manifest from Slice 6).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (caught by refreshAndRetry).
 *   - generic `Error` on other failures with Graph error surfaced.
 */

export interface AttachmentMetadata {
  /** Graph attachment id; passed back to the per-id GET endpoint. */
  id: string;
  /** Display filename. Optional in Graph; defensively typed. */
  name?: string;
  /** RFC-1341 type when present. */
  contentType?: string;
  /** Byte size when present. */
  size?: number;
  /** True for inline image attachments embedded in HTML email bodies. */
  isInline?: boolean;
  /**
   * Discriminator:
   *   - `#microsoft.graph.fileAttachment`
   *   - `#microsoft.graph.itemAttachment`
   *   - `#microsoft.graph.referenceAttachment`
   */
  "@odata.type": string;
}

export interface ListAttachmentsInput {
  accessToken: string;
  /** Graph message id; URL-encoded inside this wrapper. */
  messageId: string;
}

export interface ListAttachmentsResult {
  value: AttachmentMetadata[];
}

export async function listAttachments(
  input: ListAttachmentsInput,
): Promise<ListAttachmentsResult> {
  const url = `${graphApiBase()}/v1.0/me/messages/${encodeURIComponent(
    input.messageId,
  )}/attachments`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph GET me/messages/{id}/attachments returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph GET me/messages/{id}/attachments failed: ${surfaceGraphError(
        text,
        res.status,
      )}`,
    );
  }

  return (await res.json()) as ListAttachmentsResult;
}
