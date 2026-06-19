import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";

/**
 * Wrapper for Microsoft Graph `GET /me/mailFolders` — top-level mail folders.
 *
 * Added for the `microsoft-outlook:folders` options resolver
 * (ANALYTICS-SOURCES-OUTLOOK-1), which backs the folder picker on the Outlook
 * analytics `folder_message_count` widget.
 *
 * PRIVACY / scope: `$select=id,displayName` only — no message, subject, sender,
 * or unread/total counts are read. Single page, `$top`-capped; nested child
 * folders are not expanded (top-level only for v1). Uses the already-granted
 * `Mail.Read` scope; no new scope.
 *
 * Throws `Unauthorized401Error` on 401 (caught by refreshAndRetry); generic
 * `Error` with a surfaced (token-free) Graph message otherwise.
 */

export interface GraphMailFolder {
  id: string;
  displayName?: string | null;
}

export interface ListMailFoldersResult {
  value: GraphMailFolder[];
}

export interface ListMailFoldersInput {
  accessToken: string;
  /** 1..100 page cap (defensively clamped). */
  top?: number;
}

export async function listMailFolders(
  input: ListMailFoldersInput,
): Promise<ListMailFoldersResult> {
  const top = Math.max(1, Math.min(input.top ?? 100, 100));
  const params = new URLSearchParams();
  params.append("$select", "id,displayName");
  params.append("$top", String(top));
  const url = `${graphApiBase()}/v1.0/me/mailFolders?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error("Microsoft Graph GET me/mailFolders returned HTTP 401");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph GET me/mailFolders failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as ListMailFoldersResult;
}
