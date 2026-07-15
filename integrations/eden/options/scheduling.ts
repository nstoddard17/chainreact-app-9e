import { decryptToken } from "@/core/encryption/tokens";
import { type OptionItem, type OptionsResolver } from "@/services/options/types";
import { listSchedules, listScheduledPosts } from "@/integrations/_shared/eden/api/schedules";
import { filterByLabel, mapEdenOptionsError, requireEdenIntegration } from "./_shared";

/**
 * Eden scheduling option sources (EDEN-6). Three searchable pickers backing the scheduling
 * actions' Builder fields:
 *   - `eden:schedules`        — posting schedules (social sets). value = schedule id.
 *   - `eden:scheduled_posts`  — queued/sent posts + drafts. value = post id.
 *   - `eden:draft_posts`      — drafts only (status="draft"). value = post id.
 *
 * Personal-credential posture (same as the Batch 1/2 resolvers): decrypt the stored token and call
 * the read wrappers directly; bad/read-only token → INTEGRATION_DISCONNECTED reconnect hint. Labels
 * carry only id/status/time — NEVER post content, handles, or account identifiers.
 */

const POST_PAGE_LIMIT = 50;

function isoDay(ms: number | null): string | null {
  if (ms === null) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace(".000", "").replace("T", " ").replace("Z", " UTC");
}

export const edenSchedulesResolver: OptionsResolver = {
  source: "eden:schedules",
  provider: "eden",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireEdenIntegration(ctx);
    const accessToken = decryptToken(integration.accessTokenEncrypted);
    let result;
    try {
      result = await listSchedules({ accessToken });
    } catch (err) {
      mapEdenOptionsError(err);
    }
    const items: OptionItem[] = [];
    for (const s of result.schedules) {
      if (s.id.length === 0) continue;
      const label = s.name && s.name.length > 0 ? s.name : s.id;
      items.push({ value: s.id, label, ...(s.timezone ? { description: s.timezone } : {}) });
    }
    return { items: filterByLabel(items, ctx.q).sort((a, b) => a.label.localeCompare(b.label)), hasMore: false };
  },
};

function postsResolver(source: string, status?: string): OptionsResolver {
  return {
    source,
    provider: "eden",
    requiresIntegration: true,
    async resolve(ctx) {
      const integration = requireEdenIntegration(ctx);
      const accessToken = decryptToken(integration.accessTokenEncrypted);
      let result;
      try {
        result = await listScheduledPosts({
          accessToken,
          ...(status ? { status } : {}),
          limit: POST_PAGE_LIMIT,
        });
      } catch (err) {
        mapEdenOptionsError(err);
      }
      const items: OptionItem[] = [];
      for (const p of result.posts) {
        if (p.id.length === 0) continue;
        const when = isoDay(p.scheduledFor);
        const statusLabel = p.status ?? "post";
        const label = when ? `${statusLabel} · ${when}` : statusLabel;
        items.push({ value: p.id, label, description: p.id });
      }
      return { items: filterByLabel(items, ctx.q), hasMore: result.posts.length >= POST_PAGE_LIMIT };
    },
  };
}

export const edenScheduledPostsResolver: OptionsResolver = postsResolver("eden:scheduled_posts");
export const edenDraftPostsResolver: OptionsResolver = postsResolver("eden:draft_posts", "draft");
