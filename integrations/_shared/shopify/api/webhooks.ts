import { shopifyRequest } from "./_request";

/**
 * Shopify Admin REST `/webhooks` resource wrappers — Slice 12 Commit 4.
 *
 * Used by the `webhook_received` trigger's activate / deactivate
 * hooks to manage per-shop webhook subscriptions.
 *
 * **Per-shop, per-topic.** Each call subscribes (or removes) ONE
 * topic on ONE shop. The activate hook iterates the user's selected
 * topics and creates one subscription per topic, accumulating the
 * webhook IDs. Deactivation walks the stored IDs and deletes each.
 *
 * **Auth: merchant access token** (NOT the platform's app secret).
 * Shopify webhook subscriptions are owned by the merchant — they
 * appear in the merchant's admin UI and are deleted when the merchant
 * uninstalls the app. The merchant's offline access token (from
 * `getActiveForExecution(...).accessTokenEncrypted`) is the auth
 * principal. This is structurally different from Stripe Connect's
 * platform-secret model (Slice 11).
 *
 * **No expiration.** Shopify webhooks live until explicit deletion
 * (`webhooksDelete`) or until the merchant uninstalls the app. The
 * trigger registers no renewal handler — see
 * `triggers/webhookReceived/index.ts`.
 */

// ─── Wire-format response ───────────────────────────────────────────────────

/**
 * Shopify webhook subscription resource shape (current docs +
 * cross-checked against V1's [`ShopifyTriggerLifecycle.ts:117-118`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/ShopifyTriggerLifecycle.ts#L117)
 * create response handling).
 */
export interface ShopifyWebhook {
  id: number;
  topic: string;
  address: string;
  format?: string;
  api_version?: string;
  created_at?: string;
  updated_at?: string;
}

interface ShopifyWebhookResponse {
  webhook: ShopifyWebhook;
}

// ─── webhooksCreate ─────────────────────────────────────────────────────────

export interface WebhooksCreateInput {
  shopDomain: string;
  /** Merchant's decrypted offline access token. */
  accessToken: string;
  /** Shopify topic string, e.g. `"orders/create"`. */
  topic: string;
  /**
   * Notification URL Shopify will POST to for this topic. Includes
   * `?workflowId=X&nodeId=Y` query params for the receive route's
   * strict-direct-lookup.
   */
  address: string;
}

export async function webhooksCreate(
  input: WebhooksCreateInput,
): Promise<ShopifyWebhook> {
  const response = await shopifyRequest<ShopifyWebhookResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "POST",
    path: "/webhooks.json",
    body: {
      webhook: {
        topic: input.topic,
        address: input.address,
        format: "json",
      },
    },
    resourceForNotFound: `webhook (create topic ${input.topic})`,
  });
  return response.webhook;
}

// ─── webhooksDelete ─────────────────────────────────────────────────────────

export interface WebhooksDeleteInput {
  shopDomain: string;
  accessToken: string;
  /** Shopify webhook id from a prior create response. */
  webhookId: number;
}

export async function webhooksDelete(
  input: WebhooksDeleteInput,
): Promise<void> {
  await shopifyRequest<unknown>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "DELETE",
    path: `/webhooks/${input.webhookId}.json`,
    resourceForNotFound: `webhook ${input.webhookId}`,
  });
  // Shopify returns 200 with `{}` on successful delete. We ignore the
  // body — the absence of an error is sufficient.
}
