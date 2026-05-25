import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { getPageAccessToken } from "@/integrations/_shared/facebook/api/getPageAccessToken";
import { subscribePageToApp } from "@/integrations/_shared/facebook/api/subscribedApps";

/**
 * Shared activation hook for the Facebook Page webhook triggers
 * (`new_post`, `new_comment`) — Slice 3.FACEBOOK-5.
 *
 * Facebook's webhook is app-level (ONE callback URL registered in the Meta
 * App Dashboard), but each Page must be individually subscribed to the app
 * via `POST /{pageId}/subscribed_apps?subscribed_fields=feed`. That is the
 * REAL per-(workflow, page) activation work — it satisfies the
 * `trigger-meta-activation-invariant` test WITHOUT a `SHARED_INFRA_EXEMPT_KEYS`
 * entry (Facebook genuinely subscribes the Page at activate time).
 *
 * The Page access token is derived at runtime from the stored USER token
 * (`getPageAccessToken`) — never persisted (FACEBOOK-2 D-FB5). Wrapped in
 * `refreshAndRetry` so a stale token triggers one refresh + retry;
 * Facebook is non-refreshable, so a hard 401 surfaces as reconnect-required
 * and aborts the activate transition (TRIGGER_REGISTRATION_FAILED).
 *
 * Both triggers subscribe the SAME field (`feed` — posts AND comments arrive
 * on the one field). Re-subscribing an already-subscribed Page is idempotent,
 * so a workflow with both triggers on the same Page (or two workflows on the
 * same Page) is safe.
 *
 * Returns a config patch merged into `trigger_resources.config`:
 *   - `pageId` — echoed (the page the subscription covers).
 *   - `subscribedFields` — what was subscribed (diagnostic).
 *   - `subscribedAt` — activation timestamp marker.
 */

const SUBSCRIBED_FIELDS = ["feed"] as const;

export const facebookSharedActivate: ActivationFn = async ({ node, integration }) => {
  const pageId = node.config?.pageId;
  if (typeof pageId !== "string" || pageId.length === 0) {
    throw new Error(
      "facebook trigger activate: node.config.pageId is required.",
    );
  }

  await refreshAndRetry({
    userId: integration.userId,
    provider: "facebook",
    accountId: integration.providerAccountId,
    apiCall: async (userToken) => {
      const pageAccessToken = await getPageAccessToken({
        accessToken: userToken,
        pageId,
      });
      return subscribePageToApp({
        pageAccessToken,
        pageId,
        fields: SUBSCRIBED_FIELDS,
      });
    },
  });

  return {
    pageId,
    subscribedFields: [...SUBSCRIBED_FIELDS],
    subscribedAt: new Date().toISOString(),
  };
};
