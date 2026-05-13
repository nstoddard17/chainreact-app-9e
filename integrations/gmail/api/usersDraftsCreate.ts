import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Gmail's `users.drafts.create`.
 *
 * Gmail 2.1 Commit 3: introduced for the `create_draft` and
 * `create_draft_reply` action handlers. Same shape rules as
 * `usersMessagesSend.ts` and `usersMessagesModify.ts`:
 *   - Per docs/rules/oauth-dispatcher.md §"Allowed flows" — throws
 *     `Unauthorized401Error` on HTTP 401 so the `refreshAndRetry`
 *     wrapper can detect and trigger one refresh + retry cycle.
 *   - Other HTTP errors propagate verbatim with Google's error
 *     `message` / `status` surfaced when present in the response
 *     body.
 *
 * Scope requirement: `gmail.compose` (added to the Gmail manifest in
 * Gmail 2.1 Commit 1 / P-G1).
 *
 * Endpoint: POST {GMAIL_API_BASE}/gmail/v1/users/me/drafts
 * Body:     application/json — `{ message: { raw, threadId? } }`
 *
 * Response shape (subset of the Gmail Draft resource that callers
 * actually consume):
 *   - `id` — the draft id.
 *   - `message.id` — the underlying message id (Gmail assigns one
 *     even for unsent drafts so the draft has stable referencing).
 *   - `message.threadId` — the thread id. For draft replies the caller
 *     supplies `threadId` in the request and Gmail echoes it here.
 *   - `message.labelIds` — typically `["DRAFT"]`. Optional for tests.
 */

function gmailApiBase(): string {
  return process.env.GMAIL_API_BASE ?? "https://gmail.googleapis.com";
}

export interface UsersDraftsCreateInput {
  /** Decrypted access token; supplied by `refreshAndRetry`. */
  accessToken: string;
  /**
   * Base64url-encoded RFC 5322 message. Build via
   * `buildRfc5322Message` + `encodeBase64Url` from `../utils/rfc5322.ts`.
   */
  rawMessage: string;
  /**
   * Optional thread id. Required when creating a draft REPLY so Gmail
   * threads the draft alongside the originating message. Absent for
   * brand-new drafts.
   */
  threadId?: string;
}

export interface UsersDraftsCreateResult {
  id: string;
  message: {
    id: string;
    threadId: string;
    labelIds?: readonly string[];
  };
}

interface GmailErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export async function usersDraftsCreate(
  input: UsersDraftsCreateInput,
): Promise<UsersDraftsCreateResult> {
  const message: { raw: string; threadId?: string } = { raw: input.rawMessage };
  if (input.threadId !== undefined && input.threadId.length > 0) {
    message.threadId = input.threadId;
  }

  const res = await fetch(`${gmailApiBase()}/gmail/v1/users/me/drafts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Gmail users.drafts.create returned HTTP 401",
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
    throw new Error(`Gmail drafts.create failed: ${detail}`);
  }

  return (await res.json()) as UsersDraftsCreateResult;
}
