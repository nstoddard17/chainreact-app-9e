import { edenCallTool, type EdenEnvelope } from "./_client";

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export interface EdenSchedule {
  id: string;
  name: string | null;
  timezone: string | null;
}

/** `eden_list_schedules` → the workspace's posting schedules (bounded to id/name/timezone). */
export async function listSchedules(input: {
  accessToken: string;
  workspaceId?: string;
}): Promise<{ schedules: EdenSchedule[]; workspaceId: string | null }> {
  const env: EdenEnvelope = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_list_schedules",
    args: { ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}) },
    idempotent: true,
  });
  const raw = Array.isArray(env.schedules) ? (env.schedules as unknown[]) : [];
  const schedules: EdenSchedule[] = raw.map((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    return { id: str(o.id) ?? "", name: str(o.name), timezone: str(o.timezone) };
  }).filter((s) => s.id.length > 0);
  return { schedules, workspaceId: str(env.workspaceId) };
}

export interface EdenScheduledPost {
  id: string;
  status: string | null;
  scheduledFor: number | null;
}

/** `eden_list_scheduled_posts` → one page of queued/sent posts (bounded). */
export async function listScheduledPosts(input: {
  accessToken: string;
  workspaceId?: string;
  scheduleId?: string;
  status?: string;
  limit?: number;
}): Promise<{ posts: EdenScheduledPost[]; count: number | null; mode: string | null }> {
  const env: EdenEnvelope = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_list_scheduled_posts",
    args: {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.scheduleId ? { scheduleId: input.scheduleId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
    },
    idempotent: true,
  });
  const raw = Array.isArray(env.posts) ? (env.posts as unknown[]) : [];
  const posts: EdenScheduledPost[] = raw.map((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    return { id: str(o.id) ?? "", status: str(o.status), scheduledFor: num(o.scheduledFor) };
  }).filter((p) => p.id.length > 0);
  return { posts, count: num(env.count), mode: str(env.mode) };
}

export interface EdenScheduledPostDetail {
  id: string;
  status: string | null;
  scheduleId: string | null;
  timezone: string | null;
  platforms: string[];
  scheduledFor: number | null;
  scheduledAtIso: string | null;
  text: string | null;
  mediaCount: number;
  hasFirstComment: boolean;
  errorMessage: string | null;
  targets: Array<{ platform: string | null; kind: string | null; status: string | null }>;
}

/**
 * `eden_list_scheduled_posts` (`postId` + `mode:"full"`) → ONE post's bounded detail: id/status/
 * time/platforms/text/targets. Account-identity fields (`connectionId`) are dropped; `scheduledFor`
 * epoch-ms is normalized into an ISO string. Returns null when the post id isn't found.
 */
export async function readScheduledPost(input: {
  accessToken: string;
  workspaceId?: string;
  postId: string;
}): Promise<EdenScheduledPostDetail | null> {
  const env: EdenEnvelope = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_list_scheduled_posts",
    args: {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      postId: input.postId,
      mode: "full",
    },
    idempotent: true,
  });
  // An app-level error envelope (not merely "post absent") must not masquerade as not-found.
  if (env.ok === false) {
    const status = str(env.status) ?? "error";
    const message = str(env.message);
    throw new Error(`Eden eden_list_scheduled_posts failed (${status}): ${message ? message.slice(0, 400) : status}`);
  }
  const list = Array.isArray(env.posts) ? (env.posts as unknown[]) : [];
  const flat = env.post ?? env.id ? env : undefined;
  const rawPost = list.find((p) => (p as Record<string, unknown>)?.id === input.postId) ?? list[0] ?? flat;
  if (!rawPost || typeof rawPost !== "object") return null;
  const p = rawPost as Record<string, unknown>;
  const inner = (p.post ?? p) as Record<string, unknown>;
  const id = str(inner.id);
  if (!id) return null;
  const content = (inner.content ?? {}) as Record<string, unknown>;
  const extras = (content.extras ?? {}) as Record<string, unknown>;
  const media = Array.isArray(content.media) ? (content.media as unknown[]) : [];
  const platformsRaw = Array.isArray(inner.platforms) ? (inner.platforms as unknown[]) : [];
  const targetsRaw = Array.isArray(inner.targets) ? (inner.targets as unknown[]) : [];
  const scheduledFor = num(inner.scheduledFor);
  const isoOf = (ms: number | null): string | null => {
    if (ms === null) return null;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };
  return {
    id,
    status: str(inner.status),
    scheduleId: str(inner.scheduleId),
    timezone: str(inner.timezone),
    platforms: platformsRaw.map((x) => str(x)).filter((x): x is string => x !== null && x.length > 0),
    scheduledFor,
    scheduledAtIso: isoOf(scheduledFor),
    text: str(content.text),
    mediaCount: media.length,
    hasFirstComment: typeof extras.firstComment === "string" && (extras.firstComment as string).length > 0,
    errorMessage: str(inner.errorMessage),
    targets: targetsRaw.map((t) => {
      const o = (t ?? {}) as Record<string, unknown>;
      return { platform: str(o.platform), kind: str(o.kind), status: str(o.status) };
    }),
  };
}
