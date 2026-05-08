import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "./_base";
import { surfaceGraphError } from "./errors";

/**
 * Wrapper for Microsoft Graph `POST /v1.0/subscriptions`.
 *
 * Used by:  newEmail trigger activation.
 *
 * Subscription creation is synchronous AT THE GRAPH SIDE but asynchronous
 * with respect to the webhook validation handshake: when Graph receives
 * this POST, it FIRST POSTs `?validationToken=<token>` to our
 * `notificationUrl` and waits up to 10 seconds for our route to echo
 * the token back as text/plain. Only after that handshake completes does
 * Graph return the subscription record to this caller. If our webhook
 * route fails or times out, the create call returns 4xx with an
 * informative message — see `learning/notes/microsoft-graph-validation`
 * (V1 doc) for the full sequence.
 *
 * Required `lifecycleNotificationUrl` for expirations > 1h: Graph posts
 * reauthorizationRequired and subscriptionRemoved events to that URL.
 * Slice 6 wires the URL but the lifecycle handler is a 200-stub.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - generic `Error` on other failures with the Graph error message
 *     surfaced (e.g., "ValidationFailed", "ExtensionError").
 */

export interface CreateSubscriptionInput {
  accessToken: string;
  /** "/me/messages" for new_email; resource string for other surfaces. */
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
  /** ISO-8601 timestamp; max ~70.5h after now for /me/messages (4230 min). */
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
