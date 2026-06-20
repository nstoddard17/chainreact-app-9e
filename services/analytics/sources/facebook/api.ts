import { graphRequest } from "@/integrations/_shared/facebook/api/_request";

/**
 * Bounded, READ-ONLY, COUNT-ONLY + METADATA-ONLY Facebook Page reader for the analytics
 * source (Slice ANALYTICS-SOURCES-FACEBOOK-1). Reuses the shared Facebook Graph transport
 * (`graphRequest` — Bearer auth + appsecret_proof + typed error mapping:
 * Unauthorized401Error / RateLimitError / FacebookPermissionError / NotFoundError /
 * FacebookApiError).
 *
 * PRIVACY: requests ONLY aggregate page fields + post `created_time`. Page node read
 * uses `fields=fan_count,followers_count` (aggregate audience counts — no user data).
 * Post scan uses `fields=created_time` and projects each post to a transient epoch-ms
 * timestamp. NO post message/story, comments, reactions, attachments, media URLs,
 * commenter/user identities, profiles, or page access tokens are ever read into a
 * result, returned, or cached. Post `id` is never requested or stored — pagination uses
 * Graph's opaque `after` cursor.
 *
 * SAFETY — bounded to prevent an unbounded post scan: the post scan is capped at
 * {@link POSTS_MAX_PAGES} × {@link POSTS_PAGE_SIZE}; `truncated: true` is reported when
 * the budget is exhausted. The page id is a validated numeric id and `fields`/`limit`
 * are server-side constants — no raw Graph query comes from widget config.
 */

export const POSTS_PAGE_SIZE = 100; // Graph posts edge page size.
/** Post scan: up to 20 pages = 2000 posts before truncation. */
export const POSTS_MAX_PAGES = 20;

export interface PageAudienceCounts {
  /** Total Page likes (`fan_count`), or null when Graph omits it. */
  fanCount: number | null;
  /** Total Page followers (`followers_count`), or null when Graph omits it. */
  followersCount: number | null;
}

interface RawPageNode {
  fan_count?: unknown;
  followers_count?: unknown;
}

function asCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Read a Page's aggregate audience counts (`fan_count` + `followers_count`) using its
 * Page access token. Aggregate numbers only — never user/follower identities.
 */
export async function getPageAudienceCounts(input: {
  pageAccessToken: string;
  pageId: string;
}): Promise<PageAudienceCounts> {
  const node = await graphRequest<RawPageNode>({
    accessToken: input.pageAccessToken,
    path: `/${input.pageId}`,
    query: { fields: "fan_count,followers_count" },
  });
  return { fanCount: asCount(node.fan_count), followersCount: asCount(node.followers_count) };
}

export interface PagePostsScanResult {
  /** Epoch-ms `created_time` of scanned posts. Counts only — never content. */
  timestamps: number[];
  /** True when the post-scan budget was exhausted before the edge finished. */
  truncated: boolean;
}

interface RawPost {
  created_time?: unknown;
}

interface PostsEdge {
  data?: RawPost[];
  paging?: { cursors?: { after?: string }; next?: string };
}

function parseMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Scan a Page's published posts (the `/{pageId}/posts` edge), collecting only each
 * post's `created_time` as an epoch-ms timestamp. Requests `fields=created_time` ONLY
 * (no message/story/attachments). Paginates via Graph's opaque `after` cursor, bounded
 * by `maxPages`; `truncated: true` when the budget is exhausted. The post id is never
 * requested, returned, or cached.
 */
export async function scanPagePosts(
  pageAccessToken: string,
  pageId: string,
  input: { maxPages?: number } = {},
): Promise<PagePostsScanResult> {
  const maxPages = input.maxPages ?? POSTS_MAX_PAGES;
  const timestamps: number[] = [];
  let after: string | undefined;
  let truncated = false;

  for (let page = 0; page < maxPages; page++) {
    const edge: PostsEdge = await graphRequest<PostsEdge>({
      accessToken: pageAccessToken,
      path: `/${pageId}/posts`,
      query: { fields: "created_time", limit: POSTS_PAGE_SIZE, after },
    });
    for (const raw of edge.data ?? []) {
      const ms = parseMs(raw.created_time);
      if (ms !== null) timestamps.push(ms);
    }
    const next = edge.paging?.next;
    const cursor = edge.paging?.cursors?.after;
    if (!next || typeof cursor !== "string" || cursor.length === 0) {
      return { timestamps, truncated: false };
    }
    after = cursor;
    if (page === maxPages - 1) truncated = true;
  }

  return { timestamps, truncated };
}
