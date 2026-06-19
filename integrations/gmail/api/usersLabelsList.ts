import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Gmail's `users.labels.list`.
 *
 * Introduced for the `gmail:labels` options resolver (Slice ANALYTICS-SOURCES-GMAIL-1)
 * — the label picker on the Gmail analytics widget. Read-only.
 *
 * Same shape rules as the other Gmail API wrappers:
 *   - Throws `Unauthorized401Error` on HTTP 401 so `refreshAndRetry` can trigger
 *     one refresh + retry cycle.
 *   - Other HTTP errors propagate with Google's error `message` / `status`.
 *
 * Scope requirement: `gmail.readonly` (already granted — labels read is covered).
 * Returns only label id / name / type — no message content.
 *
 * Endpoint: GET {GMAIL_API_BASE}/gmail/v1/users/me/labels
 */

function gmailApiBase(): string {
  return process.env.GMAIL_API_BASE ?? "https://gmail.googleapis.com";
}

export interface GmailLabel {
  id: string;
  name: string;
  type?: "system" | "user";
}

export interface UsersLabelsListResult {
  labels: readonly GmailLabel[];
}

interface GmailErrorPayload {
  error?: { code?: number; message?: string; status?: string };
}

export async function usersLabelsList(input: {
  accessToken: string;
}): Promise<UsersLabelsListResult> {
  const res = await fetch(`${gmailApiBase()}/gmail/v1/users/me/labels`, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error("Gmail users.labels.list returned HTTP 401");
  }

  if (!res.ok) {
    const text = await res.text();
    let detail = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text) as GmailErrorPayload;
      if (parsed?.error?.message) detail = parsed.error.message;
      else if (parsed?.error?.status) detail = parsed.error.status;
    } catch {
      // not JSON — keep HTTP status
    }
    throw new Error(`Gmail labels.list failed: ${detail}`);
  }

  const json = (await res.json()) as { labels?: GmailLabel[] };
  return { labels: json.labels ?? [] };
}
