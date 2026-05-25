import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Gmail's `users.messages.attachments.get`.
 *
 * Gmail 2.3 Commit 5: returns the raw wire shape (`{ data, size }`)
 * for a Gmail attachment id discovered via `users.messages.get?
 * format=full` (or the `new_attachment` trigger payload). The `data`
 * field is **base64url-encoded** per Gmail spec — decoding to bytes
 * lives in the get_attachment handler (or the
 * `integrations/gmail/utils/decodeBase64Url.ts` helper), NOT in this
 * wrapper. The wrapper stays a thin transport-only adapter.
 *
 * Same error contract as the other Gmail wrappers (per
 * docs/rules/oauth-dispatcher.md §"Allowed flows"):
 *   - HTTP 401 → throws `Unauthorized401Error` so the
 *     `refreshAndRetry` wrapper can detect and trigger one refresh +
 *     retry cycle.
 *   - Other HTTP errors propagate verbatim with Google's error
 *     `message` / `status` surfaced when present in the response body.
 *
 * Scope requirement: `gmail.readonly` (already shipped in Slice 2 —
 * see Gmail 2.3 plan §10 scope analysis).
 *
 * Endpoint: GET {GMAIL_API_BASE}/gmail/v1/users/me/messages/{messageId}/attachments/{attachmentId}
 */

function gmailApiBase(): string {
  return process.env.GMAIL_API_BASE ?? "https://gmail.googleapis.com";
}

export interface UsersMessagesAttachmentsGetInput {
  /** Decrypted access token; supplied by `refreshAndRetry`. */
  accessToken: string;
  /** Gmail message id (from `new_attachment` trigger or upstream). */
  messageId: string;
  /** Gmail attachment id (from the trigger output or messages.get part). */
  attachmentId: string;
}

export interface UsersMessagesAttachmentsGetResult {
  /**
   * Base64url-encoded attachment bytes (Gmail's wire shape). Use
   * `integrations/gmail/utils/decodeBase64Url.ts` to materialize to a
   * `Uint8Array` before staging.
   */
  data: string;
  /** Provider-reported byte size. May be absent on some responses. */
  size?: number;
}

interface GmailErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export async function usersMessagesAttachmentsGet(
  input: UsersMessagesAttachmentsGetInput,
): Promise<UsersMessagesAttachmentsGetResult> {
  const res = await fetch(
    `${gmailApiBase()}/gmail/v1/users/me/messages/${encodeURIComponent(
      input.messageId,
    )}/attachments/${encodeURIComponent(input.attachmentId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${input.accessToken}` },
    },
  );

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Gmail users.messages.attachments.get returned HTTP 401",
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
    throw new Error(`Gmail attachments.get failed: ${detail}`);
  }

  return (await res.json()) as UsersMessagesAttachmentsGetResult;
}
