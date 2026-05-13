import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Gmail's `users.messages.modify`.
 *
 * Gmail 2.1 Commit 2 expansion: introduced as the post-send labels
 * application path for `send_email` (when the caller supplies a
 * `labels` array). Same shape rules as `usersMessagesSend.ts`:
 *   - Per docs/rules/oauth-dispatcher.md §"Allowed flows" — throws
 *     `Unauthorized401Error` on HTTP 401 so the `refreshAndRetry`
 *     wrapper can detect and trigger one refresh + retry cycle.
 *   - Other HTTP errors propagate verbatim with Google's error
 *     `message` / `status` surfaced when present in the response
 *     body.
 *
 * Scope requirement: `gmail.modify` (added to the Gmail manifest in
 * Gmail 2.1 Commit 1 / P-G1).
 *
 * Endpoint: POST {GMAIL_API_BASE}/gmail/v1/users/me/messages/{id}/modify
 * Body:     application/json — `{ addLabelIds?, removeLabelIds? }`
 */

function gmailApiBase(): string {
  return process.env.GMAIL_API_BASE ?? "https://gmail.googleapis.com";
}

export interface UsersMessagesModifyInput {
  /** Decrypted access token; supplied by `refreshAndRetry`. */
  accessToken: string;
  /** Gmail message id (returned by users.messages.send). */
  messageId: string;
  /** Optional. Label IDs to add. */
  addLabelIds?: readonly string[];
  /** Optional. Label IDs to remove. */
  removeLabelIds?: readonly string[];
}

export interface UsersMessagesModifyResult {
  id: string;
  threadId: string;
  labelIds?: readonly string[];
}

interface GmailErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export async function usersMessagesModify(
  input: UsersMessagesModifyInput,
): Promise<UsersMessagesModifyResult> {
  const body: Record<string, readonly string[]> = {};
  if (input.addLabelIds !== undefined && input.addLabelIds.length > 0) {
    body.addLabelIds = input.addLabelIds;
  }
  if (input.removeLabelIds !== undefined && input.removeLabelIds.length > 0) {
    body.removeLabelIds = input.removeLabelIds;
  }

  const res = await fetch(
    `${gmailApiBase()}/gmail/v1/users/me/messages/${encodeURIComponent(input.messageId)}/modify`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Gmail users.messages.modify returned HTTP 401",
    );
  }

  if (!res.ok) {
    const text = await res.text();
    let detail = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text) as GmailErrorPayload;
      if (parsed?.error?.message) {
        detail = parsed.error.message;
      } else if (parsed?.error?.status) {
        detail = parsed.error.status;
      }
    } catch {
      // not JSON — keep HTTP status
    }
    throw new Error(`Gmail modify failed: ${detail}`);
  }

  return (await res.json()) as UsersMessagesModifyResult;
}
