import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { getPageAccessToken } from "@/integrations/_shared/facebook/api/getPageAccessToken";
import { conversationsList } from "@/integrations/_shared/facebook/api/conversationsList";
import { classifyFacebookResolverError, NotFoundError } from "./_errors";

/**
 * `facebook:conversations` options resolver — Slice 3.FACEBOOK-3.
 *
 * Page-scoped Messenger-conversation picker. Backs the `recipientId` field
 * on `send_message`.
 *
 * **Value shape — `conversationId:psid` (matches the FACEBOOK-2 runtime).**
 * `send_message` sends AS the Page to a recipient PSID. A bare conversation
 * id (`t_...`) is NOT a valid Messenger recipient, so the picker must yield
 * a PSID. Each conversation's `participants.data[]` lists the page plus the
 * user; the user's PSID is the participant whose id is NOT the page id. The
 * resolver emits `value = "<conversationId>:<psid>"` — the FACEBOOK-2
 * handler splits on `:` and uses the PSID (a raw PSID is also accepted).
 * Conversations where no distinct recipient can be identified are dropped
 * (they can't be messaged).
 *
 * **Dependency: `pageId` (verbatim).** `requiredDeps: ["pageId"]` — parented
 * to the `facebook:pages` selection; also used to identify (and exclude) the
 * page participant when deriving the recipient PSID.
 *
 * **Page-token derivation (FACEBOOK-2 D-FB5):** the Page token is derived
 * per call via `getPageAccessToken`, then used for
 * `GET /{pageId}/conversations` (requires `pages_messaging` — the stricter
 * Messenger surface). A page the user can't manage → `NotFoundError` →
 * empty `items` (cascade fallback).
 *
 * Mapping: `label` = the recipient participant's name (conversation-id
 * fallback). Order: Graph's default (most-recently-updated first) is
 * preserved. `q`: client-side case-insensitive substring on the label. The
 * conversation snippet / message text is never fetched or surfaced; error
 * sanitization is delegated to `classifyFacebookResolverError` (no token /
 * app secret / appsecret_proof / raw body / message text leakage).
 */

const PAGE_SIZE = 50;

export const facebookConversationsResolver: OptionsResolver = {
  source: "facebook:conversations",
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

    const integration = ctx.integration;

    const pageId = ctx.deps.pageId;
    if (typeof pageId !== "string" || pageId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a Page first.",
      );
    }

    const providerAccountId = integration.providerAccountId;

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "facebook",
        providerAccountId,
        apiCall: async (userToken) => {
          const pageAccessToken = await getPageAccessToken({
            accessToken: userToken,
            pageId,
          });
          return conversationsList({
            pageAccessToken,
            pageId,
            limit: PAGE_SIZE,
          });
        },
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { items: [], hasMore: false };
      }
      throw classifyFacebookResolverError(err, "conversations");
    }

    const mapped: Array<{ value: string; label: string }> = [];
    for (const conv of result.data) {
      if (typeof conv.id !== "string" || conv.id.length === 0) continue;
      const participants = conv.participants?.data ?? [];
      // The recipient is the participant that is NOT the page itself.
      const recipient = participants.find(
        (p) =>
          typeof p.id === "string" && p.id.length > 0 && p.id !== pageId,
      );
      if (!recipient) continue; // no messageable PSID — skip.
      const label =
        typeof recipient.name === "string" && recipient.name.length > 0
          ? recipient.name
          : conv.id;
      mapped.push({ value: `${conv.id}:${recipient.id}`, label });
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
