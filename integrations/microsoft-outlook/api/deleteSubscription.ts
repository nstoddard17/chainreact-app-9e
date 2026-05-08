import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "./_base";
import { NotFoundError, surfaceGraphError } from "./errors";

/**
 * Wrapper for Microsoft Graph `DELETE /v1.0/subscriptions/{id}`.
 *
 * Used by:  newEmail trigger deactivation hook.
 *
 * Best-effort by design (the deactivation orchestrator catches +
 * continues with row deletion; user's "disable" intent is met by the
 * trigger_resources row going away). The wrapper still throws on
 * unexpected errors so the orchestrator can log them.
 *
 * Special-case 404 → NotFoundError. V1's
 * lib/microsoft-graph/subscriptionManager.ts:235-246 swallows 404 (the
 * subscription expired or was deleted by another path); we preserve
 * that semantic via the typed error so callers can distinguish.
 *
 * V1 also swallows 403 ("token lacks permissions or subscription
 * created by different client") for the same reason — Graph auto-cleans
 * expired subscriptions, so a 403 on delete is operationally identical
 * to a 404. Slice 6 surfaces the 403 to the caller as a generic Error
 * with the Graph message; the deactivation hook decides whether to
 * swallow. (Trade-off: we lose V1's silent-403 path but keep the API
 * wrapper provider-faithful. The hook treats 403 the same as 404.)
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404.
 *   - generic `Error` on other failures with Graph error message surfaced.
 */

export interface DeleteSubscriptionInput {
  accessToken: string;
  subscriptionId: string;
}

export async function deleteSubscription(
  input: DeleteSubscriptionInput,
): Promise<void> {
  const url = `${graphApiBase()}/v1.0/subscriptions/${encodeURIComponent(
    input.subscriptionId,
  )}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph subscriptions DELETE returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `subscription ${input.subscriptionId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph subscriptions DELETE failed: ${surfaceGraphError(text, res.status)}`,
    );
  }
}
