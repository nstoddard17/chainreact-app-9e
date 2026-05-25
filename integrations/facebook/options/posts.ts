import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { getPageAccessToken } from "@/integrations/_shared/facebook/api/getPageAccessToken";
import { postsList } from "@/integrations/_shared/facebook/api/postsList";
import { classifyFacebookResolverError, NotFoundError } from "./_errors";

/**
 * `facebook:posts` options resolver — Slice 3.FACEBOOK-3.
 *
 * Page-scoped recent-posts picker. Backs the `postId` field on
 * `comment_on_post` / `update_post` / `delete_post`.
 *
 * **Dependency: `pageId` (verbatim).** `requiredDeps: ["pageId"]` — the
 * parent field is the `facebook:pages` selection. The route validates
 * `deps.pageId` is present + non-empty BEFORE dispatch; the in-resolver
 * guard is belt-and-suspenders.
 *
 * **Page-token derivation (FACEBOOK-2 D-FB5):** the connected row stores
 * the USER token only; the Page token is derived per call inside the
 * `refreshAndRetry` `apiCall` via `getPageAccessToken`, then used for the
 * page-scoped `GET /{pageId}/posts`. Mirrors the FACEBOOK-2 action
 * handlers. A page the user can't manage (`pages_show_list` not granted /
 * not an admin) → `getPageAccessToken` throws `NotFoundError` → empty
 * `items` (cascade fallback, same as `dropbox:files` / `monday:items`).
 *
 * Mapping: `value` = post id, `label` = a one-line message snippet
 * (post-id fallback for media-only posts), `description` = the created
 * date (YYYY-MM-DD) when available. Order: Graph's default (newest-first)
 * is preserved. `q`: client-side case-insensitive substring on the label.
 *
 * Error sanitization delegated to `classifyFacebookResolverError` — static
 * messages only; never leaks the user / page token, app secret,
 * `appsecret_proof`, raw Graph body, post message text, or media URLs.
 */

const PAGE_SIZE = 50;
const SNIPPET_MAX = 60;

function snippet(message: string): string {
  const oneLine = message.replace(/\s+/g, " ").trim();
  return oneLine.length > SNIPPET_MAX
    ? `${oneLine.slice(0, SNIPPET_MAX - 1)}…`
    : oneLine;
}

export const facebookPostsResolver: OptionsResolver = {
  source: "facebook:posts",
  provider: "facebook",
  requiresIntegration: true,
  requiredDeps: ["pageId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Facebook integration. Connect Facebook first.",
      );
    }

    const pageId = ctx.deps.pageId;
    if (typeof pageId !== "string" || pageId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a Page first.",
      );
    }

    const accountId = ctx.integration.providerAccountId;

    let result;
    try {
      result = await refreshAndRetry({
        userId: ctx.userId,
        provider: "facebook",
        accountId,
        apiCall: async (userToken) => {
          const pageAccessToken = await getPageAccessToken({
            accessToken: userToken,
            pageId,
          });
          return postsList({ pageAccessToken, pageId, limit: PAGE_SIZE });
        },
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { items: [], hasMore: false };
      }
      throw classifyFacebookResolverError(err, "posts");
    }

    const mapped: Array<{ value: string; label: string; description?: string }> =
      [];
    for (const post of result.data) {
      if (typeof post.id !== "string" || post.id.length === 0) continue;
      const label =
        typeof post.message === "string" && post.message.trim().length > 0
          ? snippet(post.message)
          : post.id;
      const created =
        typeof post.created_time === "string" &&
        /^\d{4}-\d{2}-\d{2}/.test(post.created_time)
          ? post.created_time.slice(0, 10)
          : null;
      mapped.push(
        created !== null
          ? { value: post.id, label, description: created }
          : { value: post.id, label },
      );
    }

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
