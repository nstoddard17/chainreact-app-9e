/**
 * Wrappers for Microsoft Graph `/v1.0/subscriptions` CRUD — shared
 * across every Microsoft provider with subscription-watch triggers.
 *
 * Resource-agnostic: takes `resource` + `changeType` as inputs so the
 * same wrappers cover `/me/messages` (Slice 6 mail) and `/me/events`
 * (Slice 7 calendar) and any future surface (Teams chats, OneDrive
 * items, Excel workbooks).
 *
 * Slice 7: extracted from
 * `integrations/microsoft-outlook/api/{createSubscription,renewSubscription,deleteSubscription}.ts`.
 * Behavior preserved verbatim — same wire-format, same error mapping,
 * same `Unauthorized401Error` / `NotFoundError` typed throws.
 */
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "./_base";
import { NotFoundError, surfaceGraphError } from "./errors";

// ─── createSubscription ──────────────────────────────────────────────────────

/**
 * POST /v1.0/subscriptions.
 *
 * Subscription creation is synchronous AT THE GRAPH SIDE but asynchronous
 * with respect to the webhook validation handshake: when Graph receives
 * this POST, it FIRST POSTs `?validationToken=<token>` to our
 * `notificationUrl` and waits up to 10 seconds for our route to echo
 * the token back as text/plain. Only after that handshake completes
 * does Graph return the subscription record to this caller. If our
 * webhook route fails or times out, the create call returns 4xx with
 * an informative message.
 *
 * Required `lifecycleNotificationUrl` for expirations > 1h: Graph posts
 * `reauthorizationRequired` and `subscriptionRemoved` events to that
 * URL. Slice 6 + 7 wire the URL but the lifecycle handler is a
 * 200-stub.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - generic `Error` on other failures with the Graph error message
 *     surfaced (e.g., "ValidationFailed", "ExtensionError").
 */
export interface CreateSubscriptionInput {
  accessToken: string;
  /** "/me/messages", "/me/events", future Microsoft resources. */
  resource: string;
  /** "created", "updated", "deleted", or comma-joined combinations. */
  changeType: string;
  /** Public HTTPS URL Graph will POST notifications to. */
  notificationUrl: string;
  /**
   * Public HTTPS URL Graph will POST lifecycle events to. Required when
   * the subscription's expirationDateTime > 1h after creation.
   */
  lifecycleNotificationUrl?: string;
  /** ISO-8601 timestamp; max ~70.5h after now for /me/messages + /me/events (4230 min). */
  expirationDateTime: string;
  /**
   * Per-subscription opaque token Graph echoes back in every notification's
   * `clientState` field. We generate + store + verify on receipt.
   */
  clientState: string;
}

export interface CreateSubscriptionResult {
  id: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  expirationDateTime: string;
  /** Graph echoes our clientState back in the response, NOT in subsequent
   * fetches. We rely on what we sent rather than what Graph returns. */
  clientState?: string;
  applicationId?: string;
  creatorId?: string;
}

export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<CreateSubscriptionResult> {
  const url = `${graphApiBase()}/v1.0/subscriptions`;

  const body: Record<string, unknown> = {
    changeType: input.changeType,
    notificationUrl: input.notificationUrl,
    resource: input.resource,
    expirationDateTime: input.expirationDateTime,
    clientState: input.clientState,
  };
  if (input.lifecycleNotificationUrl) {
    body.lifecycleNotificationUrl = input.lifecycleNotificationUrl;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph subscriptions POST returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph subscriptions POST failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as CreateSubscriptionResult;
}

// ─── renewSubscription ──────────────────────────────────────────────────────

/**
 * PATCH /v1.0/subscriptions/{id}.
 *
 * Used by:  per-provider subscription renewal handlers (registered with
 *           services/triggers/subscriptionRegistry; invoked by
 *           services/triggers/runRenewals.ts cron).
 *
 * Microsoft only allows one mutable field — `expirationDateTime`. Pass
 * a new timestamp (max 4230 minutes from now) and Graph extends the
 * lease.
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
  /** ISO-8601 timestamp; max ~70.5h after now (4230 min). */
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

// ─── deleteSubscription ─────────────────────────────────────────────────────

/**
 * DELETE /v1.0/subscriptions/{id}.
 *
 * Used by:  per-provider trigger deactivation hooks.
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
 * to a 404. The wrapper surfaces 403 to the caller as a generic Error
 * with the Graph message; the deactivation hook decides whether to
 * swallow.
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
