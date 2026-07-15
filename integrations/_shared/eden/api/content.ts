import { edenCallTool, type EdenEnvelope } from "./_client";

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function bool(v: unknown): boolean {
  return v === true;
}

/** Bounded metrics for a social post (public engagement numbers only). */
export interface EdenPostMetrics {
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  engagementRate: number | null;
  outlierScore: number | null;
}

/** A bounded social-post read (content metadata + optional transcript). Public creator content. */
export interface EdenReadPost {
  contentId: string | null;
  platform: string | null;
  contentType: string | null;
  contentUrl: string | null;
  title: string | null;
  body: string | null;
  bodyTruncated: boolean;
  publishedAt: number | null;
  durationSeconds: number | null;
  hashtags: string[];
  language: string | null;
  metrics: EdenPostMetrics | null;
  transcript: string | null;
  transcriptStatus: string | null;
  creator: { username: string | null; displayName: string | null; followerCount: number | null; profileUrl: string | null } | null;
}

function metrics(m: unknown): EdenPostMetrics | null {
  if (!m || typeof m !== "object") return null;
  const o = m as Record<string, unknown>;
  return {
    viewCount: num(o.viewCount),
    likeCount: num(o.likeCount),
    commentCount: num(o.commentCount),
    shareCount: num(o.shareCount),
    engagementRate: num(o.engagementRate),
    outlierScore: num(o.outlierScore),
  };
}

function normalizePost(post: unknown): EdenReadPost {
  const o = (post ?? {}) as Record<string, unknown>;
  const prof = (o.profile ?? null) as Record<string, unknown> | null;
  const tags = Array.isArray(o.hashtags) ? (o.hashtags as unknown[]).filter((t): t is string => typeof t === "string") : [];
  return {
    contentId: str(o.contentId),
    platform: str(o.platform),
    contentType: str(o.contentType),
    contentUrl: str(o.contentUrl),
    title: str(o.title),
    body: str(o.body),
    bodyTruncated: bool(o.bodyTruncated),
    publishedAt: num(o.publishedAt),
    durationSeconds: num(o.durationSeconds),
    hashtags: tags,
    language: str(o.language),
    metrics: metrics(o.metrics),
    transcript: str(o.transcript),
    transcriptStatus: str(o.transcriptStatus),
    creator: prof
      ? {
          username: str(prof.username),
          displayName: str(prof.displayName),
          followerCount: num(prof.followerCount),
          profileUrl: str(prof.profileUrl),
        }
      : null,
  };
}

/**
 * `eden_read_card` → read a social post by URL (content metadata + optional transcript). Returns a
 * bounded post; the caller-facing `contentId` (Eden UUID) can be fed to save_post_to_board.
 */
export async function readCard(input: {
  accessToken: string;
  url: string;
  includeTranscript: boolean;
  workspaceId?: string;
}): Promise<{ status: string | null; platform: string | null; contentId: string | null; post: EdenReadPost | null }> {
  const env: EdenEnvelope = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_read_card",
    args: {
      url: input.url,
      includeTranscript: input.includeTranscript,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    idempotent: true,
  });
  return {
    status: str(env.status),
    platform: str(env.platform),
    contentId: str(env.contentId),
    post: env.post && typeof env.post === "object" ? normalizePost(env.post) : null,
  };
}

/**
 * `eden_read_social_post` → read an already-indexed saved post by Eden `contentId` + platform
 * (optionally with transcript). Returns the same bounded post shape, or an indexing/absence status.
 */
export async function readSocialPost(input: {
  accessToken: string;
  contentId: string;
  platform: string;
  includeTranscript: boolean;
  workspaceId?: string;
}): Promise<{ status: string | null; post: EdenReadPost | null }> {
  const env: EdenEnvelope = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_read_social_post",
    args: {
      contentId: input.contentId,
      platform: input.platform,
      includeTranscript: input.includeTranscript,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    idempotent: true,
  });
  return {
    status: str(env.status),
    post: env.post && typeof env.post === "object" ? normalizePost(env.post) : null,
  };
}

export interface EdenCapture {
  id: string;
  title: string | null;
  url: string | null;
  status: string | null;
  createdAt: number | null;
}

/** `eden_list_captures` → the workspace's web captures (one page). */
export async function listCaptures(input: {
  accessToken: string;
  workspaceId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ captures: EdenCapture[]; count: number | null }> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_list_captures",
    args: {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
      ...(typeof input.offset === "number" ? { offset: input.offset } : {}),
    },
    idempotent: true,
  });
  const raw = Array.isArray(env.captures) ? (env.captures as unknown[]) : [];
  const captures = raw
    .map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      return { id: str(o.id) ?? "", title: str(o.title), url: str(o.url), status: str(o.status), createdAt: num(o.createdAt) };
    })
    .filter((c) => c.id.length > 0);
  return { captures, count: num(env.count) };
}

export interface EdenHighlight {
  id: string;
  text: string | null;
  url: string | null;
  createdAt: number | null;
}

/** `eden_list_highlights` → the account's saved highlights (one page). */
export async function listHighlights(input: {
  accessToken: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
}): Promise<{ highlights: EdenHighlight[]; count: number | null }> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_list_highlights",
    args: {
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
      ...(typeof input.offset === "number" ? { offset: input.offset } : {}),
      ...(input.orderBy ? { orderBy: input.orderBy } : {}),
    },
    idempotent: true,
  });
  const raw = Array.isArray(env.highlights) ? (env.highlights as unknown[]) : [];
  const highlights = raw
    .map((h) => {
      const o = (h ?? {}) as Record<string, unknown>;
      return { id: str(o.id) ?? "", text: str(o.text), url: str(o.url), createdAt: num(o.createdAt) };
    })
    .filter((h) => h.id.length > 0);
  return { highlights, count: num(env.count) };
}
