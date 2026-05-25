import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Gmail's `users.labels.create`.
 *
 * Gmail 2.2 Commit 1: introduced for the `create_label` action.
 * Same shape rules as `usersMessagesSend.ts` /
 * `usersMessagesModify.ts` / `usersDraftsCreate.ts`:
 *   - Per docs/rules/oauth-dispatcher.md §"Allowed flows" — throws
 *     `Unauthorized401Error` on HTTP 401 so the `refreshAndRetry`
 *     wrapper can detect and trigger one refresh + retry cycle.
 *   - Other HTTP errors propagate verbatim with Google's error
 *     `message` / `status` surfaced when present in the response.
 *
 * Scope requirement: `gmail.modify` (covers `gmail.labels`).
 *
 * Endpoint: POST {GMAIL_API_BASE}/gmail/v1/users/me/labels
 * Body: application/json — `{ name, labelListVisibility?,
 *       messageListVisibility?, color? }`.
 *
 * Optional-field semantics (V2 honest-default policy, parity-gmail.md
 * G-R5 / Q11):
 *   - `labelListVisibility` and `messageListVisibility` are sent only
 *     when provided. When omitted, Gmail's server-side default
 *     applies. V2 does NOT silently substitute V1's `'labelShow'` /
 *     `'show'` defaults at the handler boundary.
 *   - `color` is sent only when provided. Gmail requires BOTH
 *     `backgroundColor` AND `textColor` together — the schema
 *     enforces this at parse time, so this wrapper just forwards the
 *     object.
 *
 * Idempotency: V1 swallowed 409 "already exists" by refetching the
 * label list and returning the existing label as "alreadyExisted:
 * true". V2 does NOT replicate that — the wrapper throws the 409
 * verbatim and the handler surfaces the error honestly. Workflow
 * authors who want create-or-get semantics can compose a search step
 * upstream of `create_label` in a future slice when the labels-list
 * action lands.
 */

function gmailApiBase(): string {
  return process.env.GMAIL_API_BASE ?? "https://gmail.googleapis.com";
}

export type LabelListVisibility = "labelShow" | "labelShowIfUnread" | "labelHide";
export type MessageListVisibility = "show" | "hide";

export interface UsersLabelsCreateInput {
  /** Decrypted access token; supplied by `refreshAndRetry`. */
  accessToken: string;
  /** Label display name; required. */
  name: string;
  labelListVisibility?: LabelListVisibility;
  messageListVisibility?: MessageListVisibility;
  /**
   * Optional color. Gmail requires BOTH fields when color is set;
   * schema-level refinement enforces this so the wrapper just
   * forwards the object.
   */
  color?: {
    backgroundColor: string;
    textColor: string;
  };
}

export interface UsersLabelsCreateResult {
  id: string;
  name: string;
  type?: "system" | "user";
  labelListVisibility?: LabelListVisibility;
  messageListVisibility?: MessageListVisibility;
  color?: {
    backgroundColor?: string;
    textColor?: string;
  };
}

interface GmailErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export async function usersLabelsCreate(
  input: UsersLabelsCreateInput,
): Promise<UsersLabelsCreateResult> {
  const body: Record<string, unknown> = { name: input.name };
  if (input.labelListVisibility !== undefined) {
    body.labelListVisibility = input.labelListVisibility;
  }
  if (input.messageListVisibility !== undefined) {
    body.messageListVisibility = input.messageListVisibility;
  }
  if (input.color !== undefined) {
    body.color = input.color;
  }

  const res = await fetch(`${gmailApiBase()}/gmail/v1/users/me/labels`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Gmail users.labels.create returned HTTP 401",
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
    throw new Error(`Gmail labels.create failed: ${detail}`);
  }

  return (await res.json()) as UsersLabelsCreateResult;
}
