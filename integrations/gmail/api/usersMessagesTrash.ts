import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Gmail's `users.messages.trash`.
 *
 * Gmail 2.2 Commit 2: introduced for the `delete_email` action's
 * `deleteMode="trash"` path. Moves a message to the user's trash
 * (recoverable for 30 days per Gmail's TOS).
 *
 * Same shape rules as the other Gmail API wrappers:
 *   - Throws `Unauthorized401Error` on HTTP 401 so the
 *     `refreshAndRetry` wrapper can trigger one refresh + retry.
 *   - Other HTTP errors propagate verbatim with Google's error
 *     `message` / `status` surfaced when present.
 *
 * Endpoint: POST {GMAIL_API_BASE}/gmail/v1/users/me/messages/{id}/trash
 * Body: none. Gmail returns the modified message resource (now
 *   carrying the `TRASH` label).
 *
 * Scope requirement: `gmail.modify` (shipped in Gmail 2.1 Commit 1).
 */

function gmailApiBase(): string {
  return process.env.GMAIL_API_BASE ?? "https://gmail.googleapis.com";
}

export interface UsersMessagesTrashInput {
  /** Decrypted access token; supplied by `refreshAndRetry`. */
  accessToken: string;
  /** Gmail message id to move to trash. */
  messageId: string;
}

export interface UsersMessagesTrashResult {
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

export async function usersMessagesTrash(
  input: UsersMessagesTrashInput,
): Promise<UsersMessagesTrashResult> {
  const res = await fetch(
    `${gmailApiBase()}/gmail/v1/users/me/messages/${encodeURIComponent(input.messageId)}/trash`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
    },
  );

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Gmail users.messages.trash returned HTTP 401",
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
    throw new Error(`Gmail trash failed: ${detail}`);
  }

  return (await res.json()) as UsersMessagesTrashResult;
}
