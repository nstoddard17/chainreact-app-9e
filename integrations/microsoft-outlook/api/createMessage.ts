import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";
import type {
  GraphMessageBody,
  GraphRecipient,
} from "./sendMail";

/**
 * Wrapper for Microsoft Graph `POST /me/messages` (create draft).
 *
 * Endpoint: POST {base}/v1.0/me/messages
 * Used by:  create_draft_email action (Outlook Mail 2.1 Commit 3).
 *
 * Unlike /me/sendMail (which returns 202 No Content), this endpoint
 * returns **201 Created** with the full draft envelope including the
 * new draft's `id` + `webLink` + `createdDateTime`. Workflows commonly
 * chain create_draft_email → other actions referencing the draft id —
 * the `draftId` output is load-bearing.
 *
 * Scope: requires `Mail.ReadWrite` (per Outlook Mail 2.1 P-O1 manifest
 * widening). Without it Graph returns 403 ErrorAccessDenied at this
 * endpoint and the standard error mapping surfaces the message.
 *
 * Body shape per Graph:
 *   {
 *     "subject": "...",
 *     "body": { "contentType": "Text" | "HTML", "content": "..." },
 *     "toRecipients": [...],
 *     "ccRecipients": [...],   // omitted when none
 *     "bccRecipients": [...],  // omitted when none
 *     "importance": "low" | "normal" | "high"
 *   }
 *
 * The wrapper omits `ccRecipients` and `bccRecipients` from the body
 * when the handler doesn't supply them — same convention as sendMail.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - generic `Error` on other failures with Graph error surfaced.
 */
export interface CreateMessageInput {
  accessToken: string;
  message: {
    subject: string;
    body: GraphMessageBody;
    toRecipients: GraphRecipient[];
    ccRecipients?: GraphRecipient[];
    bccRecipients?: GraphRecipient[];
    importance: "low" | "normal" | "high";
  };
}

/**
 * Subset of the Graph message envelope the handler maps to its output.
 * Fields beyond these are ignored by the handler (no provider response
 * spread per the Q-contract).
 */
export interface CreatedDraftMessage {
  id: string;
  subject?: string;
  webLink?: string;
  createdDateTime?: string;
}

export async function createMessage(
  input: CreateMessageInput,
): Promise<CreatedDraftMessage> {
  const url = `${graphApiBase()}/v1.0/me/messages`;

  const body: Record<string, unknown> = {
    subject: input.message.subject,
    body: input.message.body,
    toRecipients: input.message.toRecipients,
    importance: input.message.importance,
  };
  if (input.message.ccRecipients !== undefined) {
    body.ccRecipients = input.message.ccRecipients;
  }
  if (input.message.bccRecipients !== undefined) {
    body.bccRecipients = input.message.bccRecipients;
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
      "Microsoft Graph POST me/messages returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph POST me/messages failed: ${surfaceGraphError(
        text,
        res.status,
      )}`,
    );
  }

  return (await res.json()) as CreatedDraftMessage;
}
