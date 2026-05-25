import { graphRequest } from "./_request";

/**
 * Facebook Page `subscribed_apps` wrappers — Slice 3.FACEBOOK-5.
 *
 * `subscribed_apps` binds the app's webhook to a specific Page so the app
 * receives that Page's field notifications (here: `feed` — posts + comments)
 * at the app-level callback URL. It is **page-level, not per-workflow** —
 * subscribing is idempotent, and unsubscribing affects EVERY app workflow
 * watching that Page. The trigger lifecycle therefore reference-counts
 * before unsubscribing (see triggers/_shared/deactivate.ts).
 *
 * Both calls use a PAGE access token (derived at runtime via
 * `getPageAccessToken`) and require the `pages_manage_metadata` scope.
 *
 * Security: the page token is passed via the shared transport (Bearer +
 * appsecret_proof); never logged or echoed.
 */

export interface SubscribedAppsResult {
  success: boolean;
}

/**
 * `POST /{pageId}/subscribed_apps?subscribed_fields=feed` — subscribe the app
 * to the Page's feed changes. Idempotent: re-subscribing an already-
 * subscribed Page succeeds.
 */
export async function subscribePageToApp(input: {
  pageAccessToken: string;
  pageId: string;
  fields: readonly string[];
}): Promise<SubscribedAppsResult> {
  const result = await graphRequest<{ success?: boolean }>({
    accessToken: input.pageAccessToken,
    method: "POST",
    path: `/${input.pageId}/subscribed_apps`,
    query: { subscribed_fields: input.fields.join(",") },
  });
  return { success: result?.success ?? true };
}

/**
 * `DELETE /{pageId}/subscribed_apps` — unsubscribe the app from the Page.
 *
 * **Page-level side effect.** Only call when no other active workflow
 * watches this Page (reference-count guarded by the deactivation hook).
 */
export async function unsubscribePageFromApp(input: {
  pageAccessToken: string;
  pageId: string;
}): Promise<SubscribedAppsResult> {
  const result = await graphRequest<{ success?: boolean }>({
    accessToken: input.pageAccessToken,
    method: "DELETE",
    path: `/${input.pageId}/subscribed_apps`,
  });
  return { success: result?.success ?? true };
}
