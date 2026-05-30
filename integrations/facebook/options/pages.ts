import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { pagesList } from "@/integrations/_shared/facebook/api/pagesList";
import { classifyFacebookResolverError } from "./_errors";

/**
 * `facebook:pages` options resolver — Slice 3.FACEBOOK-3.
 *
 * Account-scoped Page picker (no deps). **Required** by every Facebook
 * action — they all act AS a Page, so `pageId` is the cascade root that
 * `facebook:posts` / `facebook:albums` / `facebook:conversations` depend
 * on. Lists the Pages the connected user manages via `GET /me/accounts`
 * (the same call the runtime page-token derivation uses), so authors only
 * ever see Pages they can actually act on.
 *
 * Architecture mirrors `monday:boards` / `dropbox:folders` (top-level
 * account-scoped picker):
 *   - `requiresIntegration: true`.
 *   - No `requiredDeps`.
 *   - `refreshAndRetry({ provider: "facebook", accountId })` — a stale
 *     user token triggers one refresh + retry. Facebook is non-refreshable,
 *     so a hard 401 surfaces as `INTEGRATION_DISCONNECTED` (reconnect).
 *
 * Mapping: `value` = page id, `label` = page name (id fallback). No
 * `description` — `/me/accounts` returns each Page's access token (which is
 * a derived Page token); a description is intentionally omitted to keep the
 * picker minimal AND to avoid touching the shared `pagesList` wrapper just
 * to fetch `category` / `tasks` (per-Page capability description is a
 * deferred polish item — adding fields to the FACEBOOK-2 runtime wrapper is
 * out of scope here). Sort: alphabetical by label. `q`: client-side
 * case-insensitive substring on the label.
 *
 * **Security:** the per-Page `access_token` returned by `/me/accounts` is a
 * live Page token. It is NEVER copied into an option item, description, or
 * error message. Error sanitization is delegated to
 * `classifyFacebookResolverError` (static messages only — no token / app
 * secret / appsecret_proof / raw Graph body leakage).
 */

export const facebookPagesResolver: OptionsResolver = {
  source: "facebook:pages",
  provider: "facebook",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Facebook integration. Connect Facebook first.",
      );
    }

    const integration = ctx.integration;

    const providerAccountId = integration.providerAccountId;

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "facebook",
        providerAccountId,
        apiCall: (accessToken) => pagesList({ accessToken }),
      });
    } catch (err) {
      throw classifyFacebookResolverError(err, "pages");
    }

    const mapped: Array<{ value: string; label: string }> = [];
    for (const page of result.data) {
      if (typeof page.id !== "string" || page.id.length === 0) continue;
      // SECURITY: never copy page.access_token (a live Page token) into items.
      const label =
        typeof page.name === "string" && page.name.length > 0
          ? page.name
          : page.id;
      mapped.push({ value: page.id, label });
    }

    mapped.sort((a, b) =>
      a.label.toLowerCase() < b.label.toLowerCase()
        ? -1
        : a.label.toLowerCase() > b.label.toLowerCase()
          ? 1
          : 0,
    );

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? mapped.filter((i) => i.label.toLowerCase().includes(lowerQ))
        : mapped;

    return {
      items: filtered,
      hasMore:
        typeof result.paging?.next === "string" &&
        result.paging.next.length > 0,
    };
  },
};
