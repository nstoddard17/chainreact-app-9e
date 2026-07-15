import { edenCallTool, type EdenEnvelope } from "./_client";

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** A bounded creator (public profile). Drops Eden-internal sync bookkeeping. */
export interface EdenCreator {
  id: string | null;
  platform: string | null;
  username: string | null;
  displayName: string | null;
  profileUrl: string | null;
  followerCount: number | null;
  totalContentCount: number | null;
  /** Indexing state (e.g. "synced" / "pending") — surfaced so a workflow can branch, not block. */
  syncStatus: string | null;
}

function normalizeCreator(raw: unknown): EdenCreator {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    id: str(o.id),
    platform: str(o.platform),
    username: str(o.username),
    displayName: str(o.displayName),
    profileUrl: str(o.profileUrl),
    followerCount: num(o.followerCount),
    totalContentCount: num(o.totalContentCount),
    syncStatus: str(o.syncStatus),
  };
}

/** `eden_resolve_creator` → resolve a query/handle to one or more creators (bounded). */
export async function resolveCreator(input: {
  accessToken: string;
  query: string;
  platform?: string;
  limit?: number;
}): Promise<{ creators: EdenCreator[] }> {
  const env: EdenEnvelope = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_resolve_creator",
    args: {
      query: input.query,
      ...(input.platform ? { platform: input.platform } : {}),
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
    },
    idempotent: true,
  });
  const raw = Array.isArray(env.creators) ? (env.creators as unknown[]) : [];
  return { creators: raw.map(normalizeCreator).filter((c) => (c.id ?? "").length > 0 || (c.username ?? "").length > 0) };
}

/** `eden_find_creator_in_workspace` → a creator the workspace already tracks (bounded). */
export async function findCreatorInWorkspace(input: {
  accessToken: string;
  workspaceId?: string;
  platform: string;
  username: string;
  limit?: number;
}): Promise<{ creators: EdenCreator[] }> {
  const env: EdenEnvelope = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_find_creator_in_workspace",
    args: {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      platform: input.platform,
      username: input.username,
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
    },
    idempotent: true,
  });
  const raw = Array.isArray(env.creators) ? (env.creators as unknown[]) : [];
  return { creators: raw.map(normalizeCreator).filter((c) => (c.id ?? "").length > 0 || (c.username ?? "").length > 0) };
}

export interface EdenCreatorResearch {
  creator: EdenCreator;
  metrics: Record<string, number | null>;
  /** Indexing status ("synced"/"pending"/…) — a workflow should branch, not block indefinitely. */
  indexingStatus: string | null;
  indexedPostCount: number | null;
}

/**
 * `eden_analyze_creator` → profile + aggregate performance (outlier/baseline) for a creator. Returns a
 * bounded summary + an `indexingStatus`; if Eden is still indexing, that is surfaced (no blocking wait).
 */
export async function analyzeCreator(input: {
  accessToken: string;
  query: string;
  platform?: string;
  topPostLimit?: number;
  since?: string;
  focus?: string;
  workspaceId?: string;
}): Promise<EdenCreatorResearch> {
  const env: EdenEnvelope = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_analyze_creator",
    args: {
      query: input.query,
      ...(input.platform ? { platform: input.platform } : {}),
      ...(typeof input.topPostLimit === "number" ? { topPostLimit: input.topPostLimit } : {}),
      ...(input.since ? { since: input.since } : {}),
      ...(input.focus ? { focus: input.focus } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    idempotent: true,
  });
  const creator = normalizeCreator(env.creator);
  const library = (env.creator && typeof env.creator === "object" ? (env.creator as Record<string, unknown>).library : null) as
    | Record<string, unknown>
    | null;
  const totals = (env.totals ?? {}) as Record<string, unknown>;
  const boundedMetrics: Record<string, number | null> = {};
  for (const k of ["count", "avgViews", "avgEngagementRate", "avgOutlier", "medianOutlier", "totalViews", "totalLikes", "totalComments"]) {
    boundedMetrics[k] = num(totals[k]);
  }
  return {
    creator,
    metrics: boundedMetrics,
    indexingStatus: str(library?.status) ?? creator.syncStatus,
    indexedPostCount: num(library?.indexedPostCount),
  };
}

/** `eden_following_overview` → who the account follows, bounded to counts + a capped follow list. */
export async function followingOverview(input: {
  accessToken: string;
  workspaceId?: string;
  platform?: string;
  limit?: number;
}): Promise<{ totalFollowedCount: number | null; follows: EdenCreator[] }> {
  const env: EdenEnvelope = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_following_overview",
    args: {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.platform ? { platform: input.platform } : {}),
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
    },
    idempotent: true,
  });
  const raw = Array.isArray(env.follows) ? (env.follows as unknown[]) : [];
  return { totalFollowedCount: num(env.totalFollowedCount), follows: raw.map(normalizeCreator) };
}

export interface EdenCreatorList {
  id: string;
  name: string | null;
  memberCount: number | null;
}

/** `eden_list_creator_lists` → the workspace's creator lists (bounded). */
export async function listCreatorLists(input: {
  accessToken: string;
  workspaceId?: string;
}): Promise<{ lists: EdenCreatorList[]; count: number | null }> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_list_creator_lists",
    args: { ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}) },
    idempotent: true,
  });
  const raw = Array.isArray(env.lists) ? (env.lists as unknown[]) : [];
  const lists = raw
    .map((l) => {
      const o = (l ?? {}) as Record<string, unknown>;
      return { id: str(o.id) ?? "", name: str(o.name), memberCount: num(o.memberCount) ?? num(o.count) };
    })
    .filter((l) => l.id.length > 0);
  return { lists, count: num(env.count) };
}

/** `eden_analyze_list` → a creator list's members + aggregate analysis (bounded). */
export async function analyzeList(input: {
  accessToken: string;
  workspaceId?: string;
  query: string;
  memberLimit?: number;
}): Promise<{ creators: EdenCreator[] }> {
  const env: EdenEnvelope = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_analyze_list",
    args: {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      query: input.query,
      ...(typeof input.memberLimit === "number" ? { memberLimit: input.memberLimit } : {}),
    },
    idempotent: true,
  });
  const raw = Array.isArray(env.creators) ? (env.creators as unknown[]) : Array.isArray(env.members) ? (env.members as unknown[]) : [];
  return { creators: raw.map(normalizeCreator) };
}
