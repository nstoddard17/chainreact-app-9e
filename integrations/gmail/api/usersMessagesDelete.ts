import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Gmail's `users.messages.delete` (PERMANENT delete).
 *
 * Gmail 2.2 Commit 2: introduced for the `delete_email` action's
 * `deleteMode="permanent"` path. **Permanently** removes a message —
 * Gmail does NOT keep a copy in the trash; the message is
 * unrecoverable. Workflow authors who want recoverability use
 * `deleteMode="trash"` (which routes to `usersMessagesTrash`).
 *
 * Gmail's success response is 204 No Content (empty body) — the
 * wrapper returns `{ messageId }` so the caller has a stable
 * acknowledgment shape without parsing an empty response.
 *
 * Endpoint: DELETE {GMAIL_API_BASE}/gmail/v1/users/me/messages/{id}
 *
 * Scope requirement: `gmail.modify` (shipped in Gmail 2.1 Commit 1).
 */

function gmailApiBase(): string {
  return process.env.GMAIL_API_BASE ?? "https://gmail.googleapis.com";
}

export interface UsersMessagesDeleteInput {
  /** Decrypted access token; supplied by `refreshAndRetry`. */
  accessToken: string;
  /** Gmail message id to permanently delete. */
  messageId: string;
}

export interface UsersMessagesDeleteResult {
  /** Echoed from the input so the caller has a confirmation shape. */
  messageId: string;
}

interface GmailErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export async function usersMessagesDelete(
  input: UsersMessagesDeleteInput,
): Promise<UsersMessagesDeleteResult> {
  const res = await fetch(
    `${gmailApiBase()}/gmail/v1/users/me/messages/${encodeURIComponent(input.messageId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
    },
  );

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Gmail users.messages.delete returned HTTP 401",
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
      // not JSON
    }
    throw new Error(`Gmail delete failed: ${detail}`);
  }

  // 204 No Content — no body to parse. Return the input id as the
  // acknowledgment so the handler's output is shape-stable.
  return { messageId: input.messageId };
}
