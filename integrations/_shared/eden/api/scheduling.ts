import { edenCallTool, type EdenEnvelope } from "./_client";

/**
 * Eden scheduling-WRITE adapter (EDEN-6, Batch 3). One wrapper per pinned, live-certified
 * scheduling tool. Every wrapper:
 *   - synthesizes Eden wire-format from V2-shaped inputs (authors never hand-write provider JSON);
 *   - returns a BOUNDED, normalized post (fixed key set — never spreads the raw envelope);
 *   - drops account-identity fields (`connectionId`) and never surfaces post text back into logs;
 *   - normalizes epoch-ms `scheduledFor` into an ISO string alongside the raw epoch.
 *
 * The 8 scheduling platforms (verbatim from every write tool's schema):
 *   twitter · threads · linkedin · substack · instagram · tiktok · facebook · youtube (Shorts).
 * Media is PUBLIC-URL only — the base64/multipart upload tools are deferred (file-output contract).
 */

export const EDEN_SCHEDULING_PLATFORMS = [
  "twitter",
  "threads",
  "linkedin",
  "substack",
  "instagram",
  "tiktok",
  "facebook",
  "youtube",
] as const;
export type EdenSchedulingPlatform = (typeof EDEN_SCHEDULING_PLATFORMS)[number];

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
/** epoch-ms → ISO-8601 string, or null when absent/invalid. */
function epochToIso(ms: number | null): string | null {
  if (ms === null) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Eden write tools return an APP-LEVEL `{ ok:false, status, httpStatus, message }` envelope on a
 * validation / permission / not-found failure WITHOUT the MCP transport throwing (the tool call
 * itself succeeded). We must surface those as thrown errors so the engine classifies them as
 * HANDLER_FAILED — never silently return an empty post (rule 8: errors propagate). The provider's
 * top-level `message` is validation guidance (e.g. "No active connection on this schedule for X"),
 * not post content, so it is safe to surface; the structured `errors` array is NOT included (it can
 * quote the offending segment text). The token is never part of the envelope.
 */
function assertEdenOk(env: EdenEnvelope, tool: string): void {
  if (env.ok === false) {
    const status = str(env.status) ?? "error";
    const message = str(env.message);
    const detail = message ? message.slice(0, 400) : `status: ${status}`;
    throw new Error(`Eden ${tool} failed (${status}): ${detail}`);
  }
}

// ── V2-shaped inputs ──────────────────────────────────────────────────────────

/** Public-URL media asset. NEVER bytes/base64 — the file-output contract. */
export interface EdenMediaInput {
  url: string;
  mimeType?: string;
  alt?: string;
}

/** The shared post-content body used by draft / schedule / publish / update. */
export interface EdenPostContent {
  platforms?: string[];
  text: string;
  /** Thread segment texts (X/Threads); each becomes `{ text }`. */
  segments?: string[];
  media?: EdenMediaInput[];
  /** YouTube Short title — maps to `perPlatform.youtube.title` (required for youtube). */
  youtubeTitle?: string;
  timezone?: string;
  idempotencyKey?: string;
}

/** Build Eden's content wire-format from V2-shaped inputs (no raw provider JSON from authors). */
function buildContentArgs(
  content: EdenPostContent,
  opts: { workspaceId?: string; scheduleId?: string },
): Record<string, unknown> {
  const media = (content.media ?? [])
    .filter((m) => typeof m.url === "string" && m.url.length > 0)
    .map((m) => ({
      url: m.url,
      ...(m.mimeType ? { mimeType: m.mimeType } : {}),
      ...(m.alt ? { alt: m.alt } : {}),
    }));
  const segments = (content.segments ?? [])
    .filter((t) => typeof t === "string" && t.length > 0)
    .map((t) => ({ text: t }));
  return {
    ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}),
    ...(opts.scheduleId ? { scheduleId: opts.scheduleId } : {}),
    ...(content.platforms && content.platforms.length > 0 ? { platforms: content.platforms } : {}),
    text: content.text,
    ...(segments.length > 0 ? { segments } : {}),
    ...(media.length > 0 ? { media } : {}),
    ...(content.youtubeTitle ? { perPlatform: { youtube: { title: content.youtubeTitle } } } : {}),
    ...(content.timezone ? { timezone: content.timezone } : {}),
    ...(content.idempotencyKey ? { idempotencyKey: content.idempotencyKey } : {}),
  };
}

// ── Bounded normalized outputs ────────────────────────────────────────────────

export interface EdenNormalizedTarget {
  platform: string | null;
  kind: string | null;
  status: string | null;
}

/** Fixed-key bounded post — never the raw envelope, never `connectionId`/account identity. */
export interface EdenScheduledPostResult {
  id: string;
  status: string | null;
  scheduleId: string | null;
  timezone: string | null;
  platforms: string[];
  scheduledFor: number | null;
  scheduledAtIso: string | null;
  targets: EdenNormalizedTarget[];
}

/** Pull the bounded post off an envelope. Eden nests it under `post`/`draft` or returns it flat. */
function normalizePost(env: EdenEnvelope, fallbackId?: string): EdenScheduledPostResult {
  const p = (env.post ?? env.draft ?? env) as Record<string, unknown>;
  const platformsRaw = Array.isArray(p.platforms) ? (p.platforms as unknown[]) : [];
  const targetsRaw = Array.isArray(p.targets) ? (p.targets as unknown[]) : [];
  const scheduledFor = num(p.scheduledFor);
  return {
    id: str(p.id) ?? fallbackId ?? "",
    status: str(p.status),
    scheduleId: str(p.scheduleId),
    timezone: str(p.timezone),
    platforms: platformsRaw.map((x) => str(x)).filter((x): x is string => x !== null && x.length > 0),
    scheduledFor,
    scheduledAtIso: epochToIso(scheduledFor),
    targets: targetsRaw.map((t) => {
      const o = (t ?? {}) as Record<string, unknown>;
      // `connectionId` (account identity) deliberately dropped.
      return { platform: str(o.platform), kind: str(o.kind), status: str(o.status) };
    }),
  };
}

// ── Write wrappers ────────────────────────────────────────────────────────────

/** `eden_create_scheduling_draft` → a draft row with no publish time (does NOT enqueue/publish). */
export async function createSchedulingDraft(input: {
  accessToken: string;
  workspaceId?: string;
  scheduleId?: string;
  content: EdenPostContent;
}): Promise<EdenScheduledPostResult> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_create_scheduling_draft",
    args: buildContentArgs(input.content, { workspaceId: input.workspaceId, scheduleId: input.scheduleId }),
    idempotent: false,
  });
  assertEdenOk(env, "eden_create_scheduling_draft");
  return normalizePost(env);
}

/** `eden_schedule_post` → enqueue for publishing at an explicit time (epoch-ms or ISO). */
export async function schedulePost(input: {
  accessToken: string;
  workspaceId?: string;
  scheduleId?: string;
  content: EdenPostContent;
  scheduledFor?: number;
  scheduledAtIso?: string;
}): Promise<EdenScheduledPostResult> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_schedule_post",
    args: {
      ...buildContentArgs(input.content, { workspaceId: input.workspaceId, scheduleId: input.scheduleId }),
      ...(typeof input.scheduledFor === "number" ? { scheduledFor: input.scheduledFor } : {}),
      ...(input.scheduledAtIso ? { scheduledAtIso: input.scheduledAtIso } : {}),
    },
    idempotent: false,
  });
  assertEdenOk(env, "eden_schedule_post");
  return normalizePost(env);
}

/** `eden_publish_post_now` → queue for IMMEDIATE public publishing. Recipient-visible, irreversible. */
export async function publishPostNow(input: {
  accessToken: string;
  workspaceId?: string;
  scheduleId?: string;
  content: EdenPostContent;
}): Promise<EdenScheduledPostResult> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_publish_post_now",
    args: buildContentArgs(input.content, { workspaceId: input.workspaceId, scheduleId: input.scheduleId }),
    idempotent: false,
  });
  assertEdenOk(env, "eden_publish_post_now");
  return normalizePost(env);
}

/**
 * `eden_update_scheduled_post` → edit a draft/scheduled post's body and/or time by id.
 * Body fields are all optional (omit → keep existing). Cannot edit a `publishing`/`posted` post.
 */
export async function updateScheduledPost(input: {
  accessToken: string;
  postId: string;
  scheduleId?: string;
  content?: Partial<EdenPostContent>;
  scheduledFor?: number;
  scheduledAtIso?: string;
  timezone?: string;
}): Promise<EdenScheduledPostResult> {
  const c = input.content ?? {};
  const media = (c.media ?? [])
    .filter((m) => typeof m?.url === "string" && m.url.length > 0)
    .map((m) => ({ url: m.url, ...(m.mimeType ? { mimeType: m.mimeType } : {}), ...(m.alt ? { alt: m.alt } : {}) }));
  const segments = (c.segments ?? [])
    .filter((t) => typeof t === "string" && t.length > 0)
    .map((t) => ({ text: t }));
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_update_scheduled_post",
    args: {
      postId: input.postId,
      ...(input.scheduleId ? { scheduleId: input.scheduleId } : {}),
      ...(c.platforms && c.platforms.length > 0 ? { platforms: c.platforms } : {}),
      ...(typeof c.text === "string" && c.text.length > 0 ? { text: c.text } : {}),
      ...(segments.length > 0 ? { segments } : {}),
      ...(media.length > 0 ? { media } : {}),
      ...(c.youtubeTitle ? { perPlatform: { youtube: { title: c.youtubeTitle } } } : {}),
      ...(typeof input.scheduledFor === "number" ? { scheduledFor: input.scheduledFor } : {}),
      ...(input.scheduledAtIso ? { scheduledAtIso: input.scheduledAtIso } : {}),
      ...(input.timezone ? { timezone: input.timezone } : {}),
    },
    idempotent: false,
  });
  assertEdenOk(env, "eden_update_scheduled_post");
  return normalizePost(env, input.postId);
}

/**
 * `eden_set_first_comment` → attach/clear the auto first-comment on a post.
 * `afterLikes` (like threshold) wins over `delayMinutes` when both are set (Eden's rule).
 * Empty `comment` removes the first comment.
 */
export async function setFirstComment(input: {
  accessToken: string;
  postId: string;
  comment: string;
  afterLikes?: number;
  delayMinutes?: number;
}): Promise<{ postId: string; status: string | null; hasFirstComment: boolean }> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_set_first_comment",
    args: {
      postId: input.postId,
      comment: input.comment,
      ...(typeof input.afterLikes === "number" ? { afterLikes: input.afterLikes } : {}),
      ...(typeof input.delayMinutes === "number" ? { delayMinutes: input.delayMinutes } : {}),
    },
    idempotent: false,
  });
  assertEdenOk(env, "eden_set_first_comment");
  const p = (env.post ?? env) as Record<string, unknown>;
  return {
    postId: str(p.id) ?? input.postId,
    status: str(p.status),
    hasFirstComment: input.comment.length > 0,
  };
}

/** `eden_cancel_scheduled_post` → cancel a scheduled post / delete a draft by id. Permanent. */
export async function cancelScheduledPost(input: {
  accessToken: string;
  postId: string;
  scheduleId?: string;
}): Promise<{ postId: string; status: string | null; cancelled: boolean }> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_cancel_scheduled_post",
    args: { postId: input.postId, ...(input.scheduleId ? { scheduleId: input.scheduleId } : {}) },
    idempotent: false,
  });
  assertEdenOk(env, "eden_cancel_scheduled_post");
  const p = (env.post ?? env) as Record<string, unknown>;
  const status = str(p.status);
  return { postId: str(p.id) ?? input.postId, status, cancelled: env.ok === true };
}
