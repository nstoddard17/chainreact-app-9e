import { hubspotRequest } from "./_request";

/**
 * HubSpot v3 webhook subscription management — Slice 13 Commit 5.
 *
 * Thin wrapper over `POST` / `DELETE` `/webhooks/v3/{appId}/subscriptions`.
 * Uses `hubspotRequest` for transport / auth / 401-mapping.
 *
 * Auth principal: the merchant's OAuth access token (user-bearer). Per
 * HubSpot's Webhooks API docs both a developer API key and an OAuth
 * token grant access to webhook subscription endpoints; V2 picks the
 * OAuth path because we already have user tokens and don't want a
 * separate `HUBSPOT_DEVELOPER_API_KEY` env. (V1 follows the same pattern
 * in [`HubSpotTriggerLifecycle.ts:132-138`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/HubSpotTriggerLifecycle.ts#L132).)
 *
 * **No `targetUrl` field** — Public Apps have a single global webhook
 * target URL configured in the developer-portal app settings; the
 * programmatic subscription POST only carries `eventType`,
 * `propertyName?` (for propertyChange events), and `active: true`.
 * V1's [`HubSpotTriggerLifecycle.ts:116-119`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/HubSpotTriggerLifecycle.ts#L116)
 * incorrectly sends a `targetUrl` field — HubSpot accepts and ignores
 * it (the configured global URL wins). V2 omits the dead field.
 *
 * Conflict handling: HubSpot returns 409 (`SubscriptionAlreadyExistsException`)
 * on duplicate-create with the same `(appId, eventType, propertyName)`
 * tuple. The shared-subscription lifecycle (Commit 5) calls
 * `hubspotAppSubscriptions.find()` first, so 409 should be rare — but
 * we still surface it as `ConflictError` (from
 * `_shared/hubspot/_request.ts`) so the lifecycle can race-recover by
 * re-fetching the existing row.
 *
 * 404 on delete is mapped to `NotFoundError` by `_request.ts`; the
 * lifecycle catches it and treats as "already gone" (best-effort
 * cleanup).
 */

export interface HubSpotWebhookSubscription {
  /** HubSpot's id for this subscription. String form. */
  id: string;
  /** e.g. `"contact.creation"` / `"contact.propertyChange"` / `"deal.deletion"`. */
  eventType: string;
  /** Only present for `*.propertyChange` events. */
  propertyName?: string | null;
  active: boolean;
  /**
   * Server-side timestamps (ISO-8601 or epoch ms — HubSpot's response
   * shape varies). Not load-bearing for V2; preserved for diagnostics.
   */
  createdAt?: string | number;
  updatedAt?: string | number;
}

interface RawSubscriptionResponse {
  id: number | string;
  eventType: string;
  propertyName?: string | null;
  active: boolean;
  createdAt?: string | number;
  updatedAt?: string | number;
}

function normalize(raw: RawSubscriptionResponse): HubSpotWebhookSubscription {
  return {
    id: String(raw.id),
    eventType: raw.eventType,
    propertyName: raw.propertyName ?? null,
    active: raw.active,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export interface CreateWebhookSubscriptionInput {
  accessToken: string;
  appId: string;
  eventType: string;
  /** Required for `*.propertyChange`, MUST be null otherwise. */
  propertyName: string | null;
  /** Defaults to `true`. */
  active?: boolean;
}

/**
 * Create one HubSpot app-level webhook subscription.
 *
 * `POST /webhooks/v3/{appId}/subscriptions`
 */
export async function createWebhookSubscription(
  input: CreateWebhookSubscriptionInput,
): Promise<HubSpotWebhookSubscription> {
  const body: Record<string, unknown> = {
    eventType: input.eventType,
    active: input.active ?? true,
  };
  if (input.propertyName !== null && input.propertyName !== undefined) {
    body.propertyName = input.propertyName;
  }
  const raw = await hubspotRequest<RawSubscriptionResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/webhooks/v3/${encodeURIComponent(input.appId)}/subscriptions`,
    body,
    resourceForNotFound: `webhook subscription (create ${input.eventType})`,
  });
  return normalize(raw);
}

export interface DeleteWebhookSubscriptionInput {
  accessToken: string;
  appId: string;
  /** The HubSpot-issued subscription id from create. */
  subscriptionId: string;
}

/**
 * Delete one HubSpot app-level webhook subscription.
 *
 * `DELETE /webhooks/v3/{appId}/subscriptions/{subscriptionId}`
 *
 * Returns void. 404 (already gone) is mapped to `NotFoundError` by the
 * shared request helper; the caller swallows it as best-effort cleanup.
 */
export async function deleteWebhookSubscription(
  input: DeleteWebhookSubscriptionInput,
): Promise<void> {
  await hubspotRequest<unknown>({
    accessToken: input.accessToken,
    method: "DELETE",
    path: `/webhooks/v3/${encodeURIComponent(input.appId)}/subscriptions/${encodeURIComponent(input.subscriptionId)}`,
    resourceForNotFound: `webhook subscription ${input.subscriptionId}`,
  });
}
