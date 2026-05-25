import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";

/**
 * Wrapper for Microsoft Graph `me/messages/{id}/reply` and
 * `me/messages/{id}/replyAll`.
 *
 * Endpoint:
 *   - `replyAll === false` → POST {base}/v1.0/me/messages/{id}/reply
 *   - `replyAll === true`  → POST {base}/v1.0/me/messages/{id}/replyAll
 *
 * Used by:  reply_to_email action (Outlook Mail 2.1 Commit 3).
 *
 * Graph returns 202 Accepted with no body for both endpoints — there's
 * no provider-side message id available from this call. The handler
 * exposes `{ replied: true, replyAll, originalEmailId }` to downstream
 * nodes; the original message id is the only stable downstream variable.
 *
 * The `replyAll` boolean is selected here, not by the handler — this
 * keeps the endpoint-selection rule in one place and lets the wrapper
 * test cover both URL paths directly.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (caught by refreshAndRetry).
 *   - generic `Error` on other failures with the Graph error message
 *     surfaced (e.g. `ErrorItemNotFound`, `ErrorAccessDenied`).
 */
export interface ReplyMessageInput {
  accessToken: string;
  /** Graph message id; URL-encoded inside this wrapper. */
  messageId: string;
  /** Reply body. Graph wraps this as `{ comment }` on the request body. */
  comment: string;
  /** Routes to `/reply` or `/replyAll` — no default; handler must choose (Q11). */
  replyAll: boolean;
}

export async function replyMessage(input: ReplyMessageInput): Promise<void> {
  const path = input.replyAll ? "replyAll" : "reply";
  const url = `${graphApiBase()}/v1.0/me/messages/${encodeURIComponent(
    input.messageId,
  )}/${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ comment: input.comment }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      `Microsoft Graph me/messages/{id}/${path} returned HTTP 401`,
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/messages/{id}/${path} failed: ${surfaceGraphError(
        text,
        res.status,
      )}`,
    );
  }
  // 202 — no body to parse.
}
