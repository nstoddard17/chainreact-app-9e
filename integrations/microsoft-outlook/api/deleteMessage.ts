import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";

/**
 * Wrapper for Microsoft Graph `DELETE /me/messages/{id}` —
 * **permanent delete** semantics.
 *
 * Endpoint: DELETE {base}/v1.0/me/messages/{id}
 * Used by:  delete_email action's `deleteMode: "permanent"` mode
 *           (Outlook Mail 2.2 Commit 2). The `"trash"` mode reuses the
 *           `moveMessage` wrapper with `destinationId: "deleteditems"`.
 *
 * Graph returns 204 No Content. The message is **irreversibly removed** —
 * it does NOT pass through the Deleted Items folder. Recoverable-items
 * retention (Exchange Online setting) may still hold the message for the
 * tenant's configured window, but workflow authors should treat this as
 * unrecoverable.
 *
 * Scope: requires `Mail.ReadWrite` (per Outlook Mail 2.1 P-O1 widening).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (caught by refreshAndRetry).
 *   - generic `Error` on other failures with Graph error surfaced.
 *     Notably 404 → "Email not found"-style message (the message may
 *     have already been deleted by the user or another workflow).
 */
export interface DeleteMessageInput {
  accessToken: string;
  /** Graph message id; URL-encoded inside this wrapper. */
  messageId: string;
}

export async function deleteMessage(
  input: DeleteMessageInput,
): Promise<void> {
  const url = `${graphApiBase()}/v1.0/me/messages/${encodeURIComponent(
    input.messageId,
  )}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph DELETE me/messages/{id} returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph DELETE me/messages/{id} failed: ${surfaceGraphError(
        text,
        res.status,
      )}`,
    );
  }
  // 204 — no body to parse.
}
