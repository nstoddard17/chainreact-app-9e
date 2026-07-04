/**
 * Write smoke harness deps — Facebook smoke read-back seam + page discovery.
 *
 * Facebook registers only ONE read action (get_page_insights, which reads
 * aggregate metrics, not a specific post/photo/video), so the post/photo/video
 * write verifications go through this seam's bounded, READ-ONLY Graph GETs of OUR
 * smoke-created objects. Outputs are sanitized projections (only the marker-bearing
 * field a verify reads) — never raw Graph payloads, tokens, media bytes/URLs, or
 * PII. Every call runs inside `refreshAndRetry` (seam-refresh-guard; Facebook is
 * non-refreshable, so this is a no-op on success but keeps the same path as the
 * handlers) and derives a fresh Page access token at runtime (never persisted),
 * exactly like the action handlers.
 *
 * CONTAINMENT: the seam only ever READS an object whose id was created by THIS run
 * (ledger-captured) on the connected smoke Page. Nothing is mutated here.
 *
 * "Not found" mapping: Graph returns HTTP 400 / code 100 (GraphMethodException)
 * when you GET a deleted/nonexistent node. The request layer surfaces that as a
 * sanitized `FacebookApiError` whose tag carries `code=100` — the seam maps ONLY
 * that to `found:false` (delete_post's deletion proof) and RE-THROWS anything else,
 * so a permission/API failure can never read as "deleted".
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { graphRequest } from "@/integrations/_shared/facebook/api/_request";
import { getPageAccessToken } from "@/integrations/_shared/facebook/api/getPageAccessToken";
import { pagesList } from "@/integrations/_shared/facebook/api/pagesList";
import { postsList } from "@/integrations/_shared/facebook/api/postsList";
import { NotFoundError, FacebookApiError } from "@/integrations/_shared/facebook/errors";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

interface FacebookContext {
  readonly providerAccountId: string | null;
  readonly accountId: string;
}

async function resolveFacebook(ctx: SmokeReaderContext): Promise<FacebookContext | null> {
  const integration = await getActiveForExecution(ctx.accountId, "facebook", null);
  if (!integration) return null;
  return { providerAccountId: integration.providerAccountId, accountId: ctx.accountId };
}

/** Run a page-scoped read: derive the Page token at runtime, then call `fn`. */
function pageCall<T>(
  fb: FacebookContext,
  pageId: string,
  fn: (pageToken: string) => Promise<T>,
): Promise<T> {
  return refreshAndRetry({
    accountId: fb.accountId,
    provider: "facebook",
    providerAccountId: fb.providerAccountId,
    apiCall: async (userToken) => {
      const pageToken = await getPageAccessToken({ accessToken: userToken, pageId });
      return fn(pageToken);
    },
  });
}

function strOf(config: Readonly<Record<string, unknown>>, key: string): string {
  const v = config[key];
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number") return String(v);
  return "";
}

/** True when a thrown error means "the Graph node does not exist" (deleted). */
function isNonexistentNode(err: unknown): boolean {
  if (err instanceof NotFoundError) return true;
  // Sanitized tag shape: "GraphMethodException/code=100[/subcode=33]".
  return err instanceof FacebookApiError && /(?:^|\/)code=100(?:\/|$)/.test(err.tag);
}

/** Wrap a GET: nonexistent-node -> `notFound` projection; anything else rethrows. */
async function foundOrMissing<T extends Record<string, unknown>>(
  read: () => Promise<T>,
  notFound: T,
): Promise<StepRunOutcome> {
  try {
    return { ok: true, output: await read(), reason: null };
  } catch (err) {
    if (isNonexistentNode(err)) return { ok: true, output: notFound, reason: null };
    throw err;
  }
}

interface GraphPostLite {
  message?: string;
}
interface GraphCommentsLite {
  data?: Array<{ message?: string }>;
}
interface GraphPhotoLite {
  name?: string;
}
interface GraphVideoLite {
  title?: string;
  description?: string;
}

/**
 * SMOKE-ONLY read-back for the Facebook post/photo/video write batch. Bounded,
 * READ-ONLY Graph GETs of OUR smoke-created objects. Returns a StepRunOutcome when
 * it owns the (facebook, action) pair; null otherwise.
 */
export async function facebookSmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider !== "facebook") return null;
  const fb = await resolveFacebook(ctx);
  if (!fb) return { ok: false, output: null, reason: "facebook not connected" };

  const pageId = strOf(input.config, "pageId");
  if (!pageId) return { ok: false, output: null, reason: `${input.action}: missing pageId` };

  if (input.action === "post_state") {
    const postId = strOf(input.config, "postId");
    if (!postId) return { ok: false, output: null, reason: "post_state: missing postId" };
    return foundOrMissing(
      async () => {
        const post = await pageCall(fb, pageId, (t) =>
          graphRequest<GraphPostLite>({ accessToken: t, path: `/${postId}`, query: { fields: "id,message" } }),
        );
        return { found: true, message: post.message ?? "" };
      },
      { found: false, message: "" },
    );
  }

  if (input.action === "page_posts") {
    // Recent page posts (ids only) — the delete proof reads this list and asserts a
    // control "keeper" post is PRESENT (the read is live + non-vacuous) while the
    // deleted target is ABSENT. Avoids GET-of-deleted-node ambiguity (a deleted page
    // post GET returns code=10, not code=100, on this Page).
    const res = await pageCall(fb, pageId, (t) =>
      postsList({ pageAccessToken: t, pageId, limit: 100 }),
    );
    return {
      ok: true,
      output: { found: true, postIds: (res.data ?? []).map((p) => p.id) },
      reason: null,
    };
  }

  if (input.action === "post_comments") {
    const postId = strOf(input.config, "postId");
    if (!postId) return { ok: false, output: null, reason: "post_comments: missing postId" };
    return foundOrMissing(
      async () => {
        const res = await pageCall(fb, pageId, (t) =>
          graphRequest<GraphCommentsLite>({ accessToken: t, path: `/${postId}/comments`, query: { fields: "id,message", limit: 50 } }),
        );
        return {
          found: true,
          comments: (res.data ?? []).map((c) => c.message ?? ""),
          commentCount: (res.data ?? []).length,
        };
      },
      { found: false, comments: [], commentCount: 0 },
    );
  }

  if (input.action === "photo_state") {
    const photoId = strOf(input.config, "photoId");
    if (!photoId) return { ok: false, output: null, reason: "photo_state: missing photoId" };
    return foundOrMissing(
      async () => {
        const photo = await pageCall(fb, pageId, (t) =>
          graphRequest<GraphPhotoLite>({ accessToken: t, path: `/${photoId}`, query: { fields: "id,name" } }),
        );
        return { found: true, name: photo.name ?? "" };
      },
      { found: false, name: "" },
    );
  }

  if (input.action === "video_state") {
    const videoId = strOf(input.config, "videoId");
    if (!videoId) return { ok: false, output: null, reason: "video_state: missing videoId" };
    return foundOrMissing(
      async () => {
        const video = await pageCall(fb, pageId, (t) =>
          graphRequest<GraphVideoLite>({ accessToken: t, path: `/${videoId}`, query: { fields: "id,title,description" } }),
        );
        return { found: true, title: video.title ?? "", description: video.description ?? "" };
      },
      { found: false, title: "", description: "" },
    );
  }

  return null;
}

// ─── Page discovery (READ-ONLY) ────────────────────────────────────────────────

export interface FacebookSmokePage {
  readonly pageId: string;
  readonly pageName: string;
}

/**
 * Discover a safe smoke Page id via `GET /me/accounts`. A pinned
 * SMOKE_FACEBOOK_PAGE_ID wins; otherwise prefer a page whose name looks
 * smoke/test/chainreact-named, else the FIRST managed page that carries a page
 * access token. READ-ONLY. Only the page id + name escape (never the token).
 */
export async function discoverFacebookSmokePage(
  accountId: string,
  userId: string,
  pinnedPageId: string | null,
): Promise<FacebookSmokePage | null> {
  const fb = await resolveFacebook({ accountId, userId });
  if (!fb) return null;
  try {
    const list = await refreshAndRetry({
      accountId: fb.accountId,
      provider: "facebook",
      providerAccountId: fb.providerAccountId,
      apiCall: (userToken) => pagesList({ accessToken: userToken }),
    });
    const managed = list.data.filter((p) => p.id && p.access_token);
    if (managed.length === 0) return null;
    if (pinnedPageId) {
      const pinned = managed.find((p) => p.id === pinnedPageId);
      if (pinned) return { pageId: pinned.id, pageName: pinned.name ?? "" };
    }
    const named = managed.find((p) => /smoke|test|chain\s*react/i.test(p.name ?? ""));
    const chosen = named ?? managed[0]!;
    return { pageId: chosen.id, pageName: chosen.name ?? "" };
  } catch {
    return null;
  }
}
