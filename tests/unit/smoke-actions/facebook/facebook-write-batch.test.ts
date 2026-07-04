/**
 * @jest-environment node
 *
 * Write smoke harness — Facebook post/page write batch (6 actions).
 *
 * Drives each fixture through the pure `runWriteSmoke` orchestrator over a FAKE
 * boundary. Protects the contracts that matter:
 *   - every verify goes through the facebook per-object state seams (the only
 *     registered read is aggregate page insights);
 *   - CONTAINMENT: every fixture targets ONLY the connected smoke Page via
 *     {{env.SMOKE_FACEBOOK_PAGE_ID}} (never a hardcoded/personal timeline);
 *   - text post + comment + photo are created, read back, and DELETED via the
 *     registered delete_post (artifact cleaned); delete_post proves its own
 *     deletion via found==false; suffix-pinned update cannot vacuously pass;
 *   - a wrong/absent read-back is VERIFY_FAILED; missing page/media targets are
 *     BLOCKED_ENV; delete_post needs the destructive opt-in.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import {
  runWriteSmoke,
  type StepRunOutcome,
  type WriteHarnessDeps,
} from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const PAGE = "PAGE_123";
const PHOTO_PATH = "smoke/facebook-photo/x.png";
const VIDEO_PATH = "smoke/facebook-video/x.mp4";

const env = (n: string): string | undefined =>
  n === "SMOKE_FACEBOOK_CONNECTED"
    ? "true"
    : n === "SMOKE_FACEBOOK_PAGE_ID"
      ? PAGE
      : n === "SMOKE_FACEBOOK_PHOTO_STORAGE_PATH"
        ? PHOTO_PATH
        : n === "SMOKE_FACEBOOK_VIDEO_STORAGE_PATH"
          ? VIDEO_PATH
          : undefined;

const KEYS = [
  "facebook:create_post",
  "facebook:update_post",
  "facebook:delete_post",
  "facebook:comment_on_post",
  "facebook:upload_photo",
  "facebook:upload_video",
] as const;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

function depsWith(reads: Record<string, Record<string, unknown>> = {}): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input): Promise<StepRunOutcome> {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      switch (input.action) {
        case "create_post": {
          // Distinct ids per role so the delete_post keeper/target proof is meaningful.
          const msg = String(input.config.message ?? "");
          const postId = /keeper/.test(msg) ? "POST_KEEPER" : /delete-target/.test(msg) ? "POST_TARGET" : "PAGE_100";
          return { ok: true, output: { postId, pageId: input.config.pageId, scheduledPublishTime: null }, reason: null };
        }
        case "update_post":
          return { ok: true, output: { postId: input.config.postId, pageId: input.config.pageId, success: true }, reason: null };
        case "delete_post":
          return { ok: true, output: { success: true, deletedPostId: input.config.postId, deletedAt: "2026-07-04T00:00:00Z" }, reason: null };
        case "comment_on_post":
          return { ok: true, output: { commentId: "C1", postId: input.config.postId, pageId: input.config.pageId }, reason: null };
        case "upload_photo":
          return { ok: true, output: { photoId: "PHOTO_1", postId: "PAGE_POST_1", pageId: input.config.pageId, published: true }, reason: null };
        case "upload_video":
          return { ok: true, output: { videoId: "VIDEO_1", pageId: input.config.pageId, published: true }, reason: null };
        default:
          return { ok: false, output: null, reason: `no plan for ${input.action}` };
      }
    },
    async smokeReadBack(input): Promise<StepRunOutcome> {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (reads[input.action]) return { ok: true, output: reads[input.action]!, reason: null };
      switch (input.action) {
        case "post_state":
          // Contains BOTH the bare marker and marker+"updated" so create and update
          // (suffix-pinned) verifies both pass on the default read-back.
          return { ok: true, output: { found: true, message: `${MARKER}updated post - safe to delete` }, reason: null };
        case "page_posts":
          // keeper present, delete-target absent -> the delete proof passes.
          return { ok: true, output: { found: true, postIds: ["POST_KEEPER", "OTHER_1"] }, reason: null };
        case "post_comments":
          return { ok: true, output: { found: true, comments: [`${MARKER}comment - safe to ignore`], commentCount: 1 }, reason: null };
        case "photo_state":
          return { ok: true, output: { found: true, name: `${MARKER}photo - safe to delete` }, reason: null };
        case "video_state":
          return { ok: true, output: { found: true, title: `${MARKER}video`, description: `${MARKER}video - safe to delete` }, reason: null };
        default:
          return { ok: false, output: null, reason: "no plan" };
      }
    },
  };
}

// ─── Shape + containment ──────────────────────────────────────────────────────

describe("facebook write batch — shape + containment", () => {
  it("every fixture verifies via a facebook smoke seam and targets the smoke Page", () => {
    for (const key of KEYS) {
      const f = fixtureFor(key);
      expect(f.writeHarness?.verify?.smokeRead).toBe(true);
      expect(f.writeHarness?.verify?.provider).toBe("facebook");
      expect(f.config.pageId).toBe("{{env.SMOKE_FACEBOOK_PAGE_ID}}");
      expect(f.requiredEnv).toContain("SMOKE_FACEBOOK_PAGE_ID");
    }
  });

  it("cleanup deletes via the registered delete_post on a smoke-owned ledger ref", () => {
    for (const key of ["facebook:create_post", "facebook:update_post", "facebook:comment_on_post", "facebook:upload_photo", "facebook:upload_video"] as const) {
      const f = fixtureFor(key);
      expect(f.writeHarness?.cleanup?.action).toBe("delete_post");
      expect(f.writeHarness?.cleanupKind).toBe("delete");
      expect(JSON.stringify(f.writeHarness?.cleanup?.config)).toMatch(/\{\{ledger\.\w+\.id\}\}/);
    }
    // delete_post: the execute IS the target's disposition (executeIsCleanup); a
    // separate cleanup removes the control keeper post.
    const del = fixtureFor("facebook:delete_post").writeHarness;
    expect(del?.executeIsCleanup).toBe(true);
    expect(del?.cleanup?.action).toBe("delete_post");
    expect(JSON.stringify(del?.cleanup?.config)).toMatch(/\{\{ledger\.keeper\.id\}\}/);
  });

  it("delete_post is destructive-classed; media fixtures publish + carry a v2_storage FileRef", () => {
    expect(fixtureFor("facebook:delete_post").risk).toBe("destructive");
    expect(fixtureFor("facebook:delete_post").writeHarness?.liveClass).toBe("destructiveSafe");
    expect((fixtureFor("facebook:upload_photo").config.photo as { kind: string }).kind).toBe("v2_storage");
    expect((fixtureFor("facebook:upload_video").config.video as { kind: string }).kind).toBe("v2_storage");
    expect(fixtureFor("facebook:upload_photo").config.published).toBe(true);
  });

  it("no fixture text targets a personal timeline or a hardcoded numeric page id", () => {
    const serialized = JSON.stringify(KEYS.map((k) => fixtureFor(k)));
    expect(serialized).not.toMatch(/\/me\/feed|timeline|personal/i);
    // Every pageId flows from the env token, never a literal numeric id.
    expect(serialized).not.toMatch(/"pageId":"\d/);
  });
});

// ─── Flows ────────────────────────────────────────────────────────────────────

describe("facebook write batch — flows", () => {
  it("create/update/comment/photo/video PASS and clean up via delete_post", async () => {
    for (const key of ["facebook:create_post", "facebook:update_post", "facebook:comment_on_post", "facebook:upload_photo", "facebook:upload_video"] as const) {
      const deps = depsWith();
      const r = await runWriteSmoke(fixtureFor(key), { ...RUN, envLookup: env }, deps);
      expect({ key, status: r.status }).toEqual({ key, status: "PASS" });
      expect(r.artifact).toBe("cleaned");
      expect(r.ledger.leaked).toBe(0);
      expect(deps.calls.some((c) => c.action === "delete_post")).toBe(true);
    }
  });

  it("delete_post: proves target ABSENT + keeper PRESENT, both cleaned", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("facebook:delete_post"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.leaked).toBe(0);
    // execute deletes the target; cleanup deletes the keeper -> two delete_post calls.
    const deletes = deps.calls.filter((c) => c.action === "delete_post").map((c) => c.config.postId);
    expect(deletes).toContain("POST_TARGET"); // execute (action under test)
    expect(deletes).toContain("POST_KEEPER"); // cleanup (control)
  });

  it("delete_post: a still-present target in the posts list is VERIFY_FAILED", async () => {
    const deps = depsWith({ page_posts: { found: true, postIds: ["POST_KEEPER", "POST_TARGET"] } });
    const r = await runWriteSmoke(fixtureFor("facebook:delete_post"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("delete_post: a missing keeper (broken/empty read) is VERIFY_FAILED (non-vacuous)", async () => {
    const deps = depsWith({ page_posts: { found: true, postIds: [] } });
    const r = await runWriteSmoke(fixtureFor("facebook:delete_post"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("update_post: cannot vacuously pass on the un-updated seed message", async () => {
    const deps = depsWith({ post_state: { found: true, message: `${MARKER}seed post - safe to delete` } });
    const r = await runWriteSmoke(fixtureFor("facebook:update_post"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED"); // marker present but not marker+"updated"
  });

  it("create_post: a read-back missing the marker is VERIFY_FAILED", async () => {
    const deps = depsWith({ post_state: { found: true, message: "someone elses post" } });
    const r = await runWriteSmoke(fixtureFor("facebook:create_post"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("upload_photo: verifies the photo name marker, deletes the photo node", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("facebook:upload_photo"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    const verify = deps.calls.find((c) => c.action === "photo_state");
    expect(verify?.config.photoId).toBe("PHOTO_1");
    const del = deps.calls.find((c) => c.action === "delete_post");
    expect(del?.config.postId).toBe("PHOTO_1"); // DELETE /{photoId}
  });
});

// ─── Gating ───────────────────────────────────────────────────────────────────

describe("facebook write batch — gating", () => {
  it("all fixtures are BLOCKED_ENV without the discovered page (no mutation)", async () => {
    const noPage = (n: string): string | undefined => (n === "SMOKE_FACEBOOK_PAGE_ID" ? undefined : env(n));
    for (const key of KEYS) {
      const deps = depsWith();
      const r = await runWriteSmoke(fixtureFor(key), { ...RUN, envLookup: noPage }, deps);
      expect({ key, status: r.status }).toEqual({ key, status: "BLOCKED_ENV" });
      expect(deps.calls).toHaveLength(0);
    }
  });

  it("media fixtures are BLOCKED_ENV without their staged file path", async () => {
    const noPhoto = (n: string): string | undefined => (n === "SMOKE_FACEBOOK_PHOTO_STORAGE_PATH" ? undefined : env(n));
    expect((await runWriteSmoke(fixtureFor("facebook:upload_photo"), { ...RUN, envLookup: noPhoto }, depsWith())).status).toBe("BLOCKED_ENV");
    const noVideo = (n: string): string | undefined => (n === "SMOKE_FACEBOOK_VIDEO_STORAGE_PATH" ? undefined : env(n));
    expect((await runWriteSmoke(fixtureFor("facebook:upload_video"), { ...RUN, envLookup: noVideo }, depsWith())).status).toBe("BLOCKED_ENV");
  });

  it("write fixtures SKIP without the write opt-in; delete_post needs destructive", async () => {
    expect((await runWriteSmoke(fixtureFor("facebook:create_post"), { runToken: "T1", envLookup: env }, depsWith())).status).toBe("SKIP");
    // delete_post is destructiveSafe: allowWrite alone is not enough.
    expect((await runWriteSmoke(fixtureFor("facebook:delete_post"), { runToken: "T1", allowWrite: true, envLookup: env }, depsWith())).status).toBe("SKIP");
  });
});
