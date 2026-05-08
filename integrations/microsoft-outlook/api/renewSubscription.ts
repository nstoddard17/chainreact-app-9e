import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "./_base";
import { surfaceGraphError } from "./errors";

/**
 * Wrapper for Microsoft Graph `PATCH /v1.0/subscriptions/{id}`.
 *
 * Used by:  newEmail subscription renewal handler (registered with
 *           services/triggers/subscriptionRegistry; invoked by
 *           services/triggers/runRenewals.ts cron).
 *
 * Microsoft only allows one mutable field — `expirationDateTime`. Pass
 * a new timestamp (max 4230 minutes from now for /me/messages) and Graph
 * extends the lease.
 *
 * The renewal handler does NOT carry forward the access token used at
 * activation. The runRenewals cron operates in a fresh context where
 * the token may have rotated, so the wrapper is invoked through
 * refreshAndRetry; a 401 here triggers exactly one refresh+retry cycle.
 * V1's lib/microsoft-graph/subscriptionManager.ts:157-216 passed the
 * stored access token verbatim, which fails when the token has expired
 * since activation — the V1 rot we explicitly fix.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - generic `Error` on other failures with Graph error message surfaced.
 */

export interface RenewSubscriptionInput {
  accessToken: string;
  subscriptionId: string;
  /** ISO-8601 timestamp; max ~70.5h after now for /me/messages (4230 min). */
  expirationDateTime: string;
}

export interface RenewSubscriptionResult {
  id: string;
  expirationDateTime: string;
  resource?: string;
  changeType?: string;
}

export async function renewSubscription(
  input: RenewSubscriptionInput,
): Promise<RenewSubscriptionResult> {
  const url = `${graphApiBase()}/v1.0/subscriptions/${encodeURIComponent(
    input.subscriptionId,
  )}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expirationDateTime: input.expirationDateTime }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph subscriptions PATCH returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph subscriptions PATCH failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as RenewSubscriptionResult;
}
