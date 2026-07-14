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
