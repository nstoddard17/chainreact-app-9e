import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";

/**
 * Wrapper for Microsoft Graph `me/messages/{id}/move`.
 *
 * Endpoint: POST {base}/v1.0/me/messages/{id}/move
 * Used by:  move_email action (Outlook Mail 2.2 Commit 2),
 *           delete_email action `"trash"` mode (same commit — trash is
 *           mechanically a move to the well-known "deleteditems" folder).
 *
 * Graph returns 201 Created with the **moved message envelope**. The new
 * message id differs from the source id (Outlook re-keys on move) — the
 * handler echoes both ids in its bounded output for downstream variable
 * refs.
 *
 * `destinationId` accepts either a well-known folder name
 * (`"inbox"`, `"sentitems"`, `"deleteditems"`, `"drafts"`, etc.) or a
 * custom Graph folder id. We pass whatever the workflow author supplied;
 * Graph 404s with `ErrorItemNotFound` if it's invalid, which the standard
 * error mapping surfaces verbatim.
 *
 * Scope: requires `Mail.ReadWrite` (per Outlook Mail 2.1 P-O1 widening).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (caught by refreshAndRetry).
 *   - generic `Error` on other failures with Graph error surfaced.
 */
export interface MoveMessageInput {
  accessToken: string;
  /** Graph message id; URL-encoded inside this wrapper. */
  messageId: string;
  /**
   * Destination mail folder id or well-known name.
   * Well-known names accepted by Graph: `inbox`, `drafts`, `sentitems`,
   * `deleteditems`, `archive`, `junkemail`, `outbox`. Custom folder ids
   * are opaque base64-like strings.
   */
  destinationId: string;
}

/**
 * Subset of the moved-message envelope the handler maps to its output.
 * The full Graph envelope includes the whole message; we only need the
 * new id and a confirmation of the destination — the handler echoes the
 * caller-supplied `destinationFolderId` separately for stability.
 */
export interface MovedMessage {
  /** New message id assigned by Graph in the destination folder. */
  id: string;
  /** Echo of Graph's parentFolderId on the moved envelope (when set). */
  parentFolderId?: string;
}

export async function moveMessage(
  input: MoveMessageInput,
): Promise<MovedMessage> {
  const url = `${graphApiBase()}/v1.0/me/messages/${encodeURIComponent(
    input.messageId,
  )}/move`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ destinationId: input.destinationId }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/messages/{id}/move returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/messages/{id}/move failed: ${surfaceGraphError(
        text,
        res.status,
      )}`,
    );
  }

  return (await res.json()) as MovedMessage;
}
