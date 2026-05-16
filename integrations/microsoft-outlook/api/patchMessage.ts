import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";

/**
 * Wrapper for Microsoft Graph `PATCH /me/messages/{id}`.
 *
 * Endpoint: PATCH {base}/v1.0/me/messages/{id}
 * Used by:  add_categories action (Outlook Mail 2.2 Commit 2). The
 *           `patch` field is intentionally open-shape so a future
 *           `set_read_status` / `set_flag` action can reuse this wrapper
 *           without a new HTTP shape — same endpoint, different patch
 *           fields.
 *
 * Graph PATCH semantics on `categories[]` are **REPLACE, not append** —
 * the supplied array becomes the message's new full category list. The
 * handler's bounded output echoes the array Graph returned post-PATCH so
 * downstream workflow refs to `{{node.categories}}` see the new state.
 *
 * Scope: requires `Mail.ReadWrite` (per Outlook Mail 2.1 P-O1 widening).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (caught by refreshAndRetry).
 *   - generic `Error` on other failures with Graph error surfaced.
 */
export interface PatchMessageInput {
  accessToken: string;
  /** Graph message id; URL-encoded inside this wrapper. */
  messageId: string;
  /**
   * Partial Graph message fields to PATCH. Only fields present here are
   * serialized into the request body — absent fields stay unchanged on
   * the message. Open shape: future actions add more fields without
   * breaking 2.2's `add_categories` consumer.
   */
  patch: {
    categories?: string[];
    // Future: isRead?: boolean; flag?: { flagStatus: string }; etc.
  };
}

/**
 * Subset of the updated-message envelope the handler maps to its output.
 * The full envelope is the entire message; we only project the fields
 * that round-trip cleanly for downstream variable refs.
 */
export interface PatchedMessage {
  id: string;
  categories?: string[];
}

export async function patchMessage(
  input: PatchMessageInput,
): Promise<PatchedMessage> {
  const url = `${graphApiBase()}/v1.0/me/messages/${encodeURIComponent(
    input.messageId,
  )}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.patch),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph PATCH me/messages/{id} returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph PATCH me/messages/{id} failed: ${surfaceGraphError(
        text,
        res.status,
      )}`,
    );
  }

  return (await res.json()) as PatchedMessage;
}
