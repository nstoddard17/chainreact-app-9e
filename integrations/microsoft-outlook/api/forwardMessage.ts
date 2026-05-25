import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";
import type { GraphRecipient } from "./sendMail";

/**
 * Wrapper for Microsoft Graph `me/messages/{id}/forward`.
 *
 * Endpoint: POST {base}/v1.0/me/messages/{id}/forward
 * Used by:  forward_email action (Outlook Mail 2.1 Commit 3).
 *
 * Graph returns 202 Accepted with no body. The handler exposes
 * `{ forwarded: true, originalEmailId, to, cc }` — recipient projection
 * for downstream variable refs.
 *
 * Body shape per Graph:
 *   {
 *     "toRecipients": [...],
 *     "ccRecipients": [...],   // omitted when none
 *     "comment": "..."         // omitted when undefined
 *   }
 *
 * The wrapper omits `ccRecipients` and `comment` from the JSON body when
 * the handler doesn't supply them (rather than sending `null`). Graph
 * treats omission and missing identically — matches Slice 6 `sendMail`'s
 * "omit cc/bcc when empty" convention.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - generic `Error` on other failures with Graph error surfaced.
 */
export interface ForwardMessageInput {
  accessToken: string;
  /** Graph message id; URL-encoded inside this wrapper. */
  messageId: string;
  toRecipients: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  /** Optional. Omitted from body when undefined. Empty string still sends. */
  comment?: string;
}

export async function forwardMessage(
  input: ForwardMessageInput,
): Promise<void> {
  const url = `${graphApiBase()}/v1.0/me/messages/${encodeURIComponent(
    input.messageId,
  )}/forward`;

  const body: Record<string, unknown> = {
    toRecipients: input.toRecipients,
  };
  if (input.ccRecipients !== undefined) {
    body.ccRecipients = input.ccRecipients;
  }
  if (input.comment !== undefined) {
    body.comment = input.comment;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/messages/{id}/forward returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/messages/{id}/forward failed: ${surfaceGraphError(
        text,
        res.status,
      )}`,
    );
  }
  // 202 — no body to parse.
}
