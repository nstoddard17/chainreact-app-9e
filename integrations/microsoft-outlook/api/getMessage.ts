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

/**
 * Microsoft Graph followup-flag block.
 *
 * Outlook Mail 2.3 — used by the `email_flagged` trigger's receive-time
 * filter (D-OM4 V1-parity over-fire) AND surfaced in the trigger's
 * normalized payload so workflows can branch on `flagStatus` /
 * `dueDateTime` / `completedDateTime` downstream.
 *
 * Graph nests datetime fields as `{ dateTime, timeZone }`; the
 * normalizer flattens to ISO strings for downstream consumption.
 */
export interface GraphMessageFlag {
  flagStatus?: "notFlagged" | "flagged" | "complete";
  completedDateTime?: { dateTime: string; timeZone?: string };
  dueDateTime?: { dateTime: string; timeZone?: string };
  startDateTime?: { dateTime: string; timeZone?: string };
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
  /** Last-modified timestamp — used by email_flagged's normalize. */
  lastModifiedDateTime?: string;
  hasAttachments?: boolean;
  importance?: "low" | "normal" | "high";
  webLink?: string;
  /**
   * Parent folder id (Graph message envelope field). Used by the
   * receive route as defense-in-depth — verifies that a notification
   * delivered against `/me/mailFolders/{folder}/messages` matches its
   * folder-scoped subscription mid-flight if a message was moved.
   */
  parentFolderId?: string;
  /**
   * Followup flag — present on every Graph message envelope (Graph
   * returns `flag: { flagStatus: "notFlagged" }` for unflagged messages
   * by default). Used by the `email_flagged` trigger receive-time
   * filter (Outlook Mail 2.3 D-OM4).
   */
  flag?: GraphMessageFlag;
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
