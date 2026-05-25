import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";

/**
 * Wrapper for Microsoft Graph `me/sendMail`.
 *
 * Endpoint: POST {base}/v1.0/me/sendMail
 * Used by:  send_email action.
 *
 * Graph's sendMail returns 202 Accepted with NO response body — there's
 * no message id available from this call. (V1 follows up with a Sent
 * Items lookup to retrieve the id, but Slice 6 deliberately skips that
 * extra round-trip; the action's output is the resolved recipients +
 * subject + a `sent: true` flag, no provider-side id.)
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - generic `Error` on other failures with the Graph error message
 *     surfaced (e.g., "ErrorInvalidRecipients", "MailboxNotEnabledForRESTAPI").
 */

export interface GraphRecipient {
  /** RFC 5322 address. Display-name parsing is out of scope (Q7). */
  emailAddress: { address: string };
}

export interface GraphMessageBody {
  contentType: "Text" | "HTML";
  content: string;
}

/**
 * Microsoft Graph `fileAttachment` envelope (Outlook Mail 2.1 Commit 4).
 *
 * Used as one element of `message.attachments[]` on the sendMail body.
 * `contentBytes` is base64-encoded by the handler before reaching this
 * wrapper — the wrapper never touches raw bytes / Buffer / streams.
 *
 * Graph supports `itemAttachment` and `referenceAttachment` as alternate
 * `@odata.type` values; Outlook Mail 2.1 SKIPs both per the accepted
 * P-O2 design — `send_email` only ships `fileAttachment` for now.
 */
export interface GraphFileAttachment {
  "@odata.type": "#microsoft.graph.fileAttachment";
  /** Display name including extension. Used by Outlook UI + recipient client. */
  name: string;
  /** RFC-1341 type. Falls back to "application/octet-stream" upstream. */
  contentType: string;
  /** Base64-encoded bytes. The handler owns the encoding step. */
  contentBytes: string;
}

export interface SendMailInput {
  accessToken: string;
  message: {
    subject: string;
    body: GraphMessageBody;
    toRecipients: GraphRecipient[];
    ccRecipients?: GraphRecipient[];
    bccRecipients?: GraphRecipient[];
    importance: "low" | "normal" | "high";
    /**
     * Optional file attachments. When supplied as a non-empty array,
     * the wrapper includes `attachments` in the Graph body and Graph
     * dispatches a multipart-style email. Omitting / passing `[]`
     * preserves the pre-2.1 behavior (no attachments) byte-for-byte.
     *
     * Size caps are handler-enforced (Outlook Mail 2.1: 3 MB per
     * attachment, 25 MB total) — the wrapper does not validate the
     * `contentBytes` byte length. Graph rejects payloads above ~35 MB
     * with HTTP 413; below that and above our handler cap, Graph might
     * accept the call but truncate or fail at delivery time, so the
     * handler refuses to call the wrapper for oversized payloads.
     */
    attachments?: GraphFileAttachment[];
  };
  /**
   * When true, Graph saves the message to Sent Items. Defaults to true
   * server-side; we forward verbatim and let the schema/handler decide
   * whether to pass it. Slice 6 always sets `true` (matches V1 default).
   */
  saveToSentItems?: boolean;
}

/**
 * Resolves to `void` on 202 Accepted — Graph returns no body.
 */
export async function sendMail(input: SendMailInput): Promise<void> {
  const url = `${graphApiBase()}/v1.0/me/sendMail`;

  const body: Record<string, unknown> = {
    message: input.message,
  };
  if (input.saveToSentItems !== undefined) {
    body.saveToSentItems = input.saveToSentItems;
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
      "Microsoft Graph me/sendMail returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/sendMail failed: ${surfaceGraphError(text, res.status)}`,
    );
  }
  // 202 — no body to parse.
}
