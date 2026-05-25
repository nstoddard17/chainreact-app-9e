import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { getPageAccessToken } from "@/integrations/_shared/facebook/api/getPageAccessToken";
import { albumsList } from "@/integrations/_shared/facebook/api/albumsList";
import { classifyFacebookResolverError, NotFoundError } from "./_errors";

/**
 * `facebook:albums` options resolver — Slice 3.FACEBOOK-3.
 *
 * Page-scoped photo-album picker. **Forward-looking:** the FACEBOOK-2
 * `upload_photo` runtime does NOT yet consume an `albumId` (album
 * select/create is an accepted deferred follow-up — uploads currently go to
 * the Page's default Timeline Photos album). This resolver ships now
 * because it is part of the accepted FACEBOOK-3 resolver surface (plan §4 /
 * §7) — when the `upload_photo` album field lands, the picker is already in
 * place. No synthetic "Timeline Photos" default option is injected (V1 did
 * that to back an empty-value default); the value contract here is strictly
 * a real album id, leaving the default-album choice to the future field.
 *
 * **Dependency: `pageId` (verbatim).** `requiredDeps: ["pageId"]` — parented
 * to the `facebook:pages` selection.
 *
 * **Page-token derivation (FACEBOOK-2 D-FB5):** the Page token is derived
 * per call via `getPageAccessToken`, then used for `GET /{pageId}/albums`.
 * A page the user can't manage → `NotFoundError` → empty `items` (cascade
 * fallback).
 *
 * Mapping: `value` = album id, `label` = album name (id fallback),
 * `description` = the photo count when present (non-sensitive). Sort:
 * alphabetical by label. `q`: client-side case-insensitive substring on the
 * label. Error sanitization delegated to `classifyFacebookResolverError`.
 */

const PAGE_SIZE = 100;

export const facebookAlbumsResolver: OptionsResolver = {
  source: "facebook:albums",
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
          return albumsList({ pageAccessToken, pageId, limit: PAGE_SIZE });
        },
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { items: [], hasMore: false };
      }
      throw classifyFacebookResolverError(err, "albums");
    }

    const mapped: Array<{ value: string; label: string; description?: string }> =
      [];
    for (const album of result.data) {
      if (typeof album.id !== "string" || album.id.length === 0) continue;
      const label =
        typeof album.name === "string" && album.name.length > 0
          ? album.name
          : album.id;
      const description =
        typeof album.count === "number"
          ? `${album.count} photo${album.count === 1 ? "" : "s"}`
          : undefined;
      mapped.push(
        description !== undefined
          ? { value: album.id, label, description }
          : { value: album.id, label },
      );
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
