import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";

/**
 * Wrapper for Microsoft Graph `me/messages/{id}`.
 *
 * Endpoint: GET {base}/v1.0/me/messages/{id}
 * Used by:  new_email trigger (Commit 4) — fetches the full message at
 *           notification time, since the Graph notification payload
 *           contains only the message id, not the body.
 *
 * Slice 6 fetches the FULL body (no $select narrowing). Workflow authors
 * who don't need the body still pay the storage cost; if real workflows
 * trip storage limits we add a `bodyPreviewOnly` config in a follow-up.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (message deleted between notification
 *     and fetch — common for short-lived spam, also fires when the user
 *     lacks access).
 *   - generic `Error` on other failures with Graph error message surfaced.
 */

export interface GraphEmailAddress {
  name?: string;
  address?: string;
}

export interface GraphRecipientField {
  emailAddress?: GraphEmailAddress;
}

export interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: {
    contentType?: string;
    content?: string;
  };
  from?: GraphRecipientField;
  sender?: GraphRecipientField;
  toRecipients?: GraphRecipientField[];
  ccRecipients?: GraphRecipientField[];
  bccRecipients?: GraphRecipientField[];
  receivedDateTime?: string;
  sentDateTime?: string;
  hasAttachments?: boolean;
  importance?: "low" | "normal" | "high";
  webLink?: string;
}

export interface GetMessageInput {
  accessToken: string;
  /** Graph message id (URL-safe; Graph already URL-encodes safe). */
  messageId: string;
}

export async function getMessage(
  input: GetMessageInput,
): Promise<GraphMessage> {
  const url = `${graphApiBase()}/v1.0/me/messages/${encodeURIComponent(
    input.messageId,
  )}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/messages/{id} returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `message ${input.messageId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/messages/{id} failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as GraphMessage;
}
