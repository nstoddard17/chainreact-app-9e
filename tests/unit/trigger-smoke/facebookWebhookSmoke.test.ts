/**
 * @jest-environment node
 *
 * Unit tests for the Facebook Page webhook trigger-smoke specs
 * (tests/trigger-smoke/facebookWebhookSmoke.ts) on the generic direct-seed
 * orchestrator, with injected fakes — PLUS cross-checks of every synthetic
 * body against the provider's REAL signature verifier, REAL feed-change
 * classifier, REAL normalizers, and REAL per-trigger filters (the same
 * production modules the live route runs). No DB, no routes.
 */
import { createHmac } from "node:crypto";
import { verifyFacebookSignature } from "@/integrations/_shared/facebook/webhooks/signature";
import {
  classifyFeedChange,
  normalizeNewComment,
  normalizeNewPost,
  type FacebookWebhookBody,
} from "@/integrations/facebook/triggers/_shared/normalize";
import { facebookNewPostFilter } from "@/integrations/facebook/triggers/newPost/filter";
import { facebookNewCommentFilter } from "@/integrations/facebook/triggers/newComment/filter";
import {
  runDirectSeedWebhookSmoke,
  type DirectSeedSmokeRun,
  type DirectSeedWebhookSmokeDeps,
} from "@/tests/trigger-smoke/directSeedWebhookSmoke";
import {
  buildFacebookFeedChangeBody,
  ALL_FACEBOOK_WEBHOOK_SPECS,
  FACEBOOK_NEW_POST_SPEC,
  FACEBOOK_NEW_COMMENT_SPEC,
  type FacebookSpec,
  type FacebookSmokeIdentity,
} from "@/tests/trigger-smoke/facebookWebhookSmoke";

const FAST = { afterDeliverAttempts: 1, afterDeliverSleepMs: 0, dedupSettleMs: 0 } as const;
const CREATED_AT = 1_780_000_000;

const IDENTITY: FacebookSmokeIdentity = {
  eventId: "new_post:crsmokepage1:crsmokepage1_post1",
  pageId: "crsmokepage1",
  postId: "crsmokepage1_post1",
  commentId: "crsmokepage1_comment1",
  marker: "crsmoke-testmarker",
};

const COMMENT_IDENTITY: FacebookSmokeIdentity = {
  ...IDENTITY,
  eventId: "new_comment:crsmokepage1:crsmokepage1_comment1",
};

function identityFor(spec: FacebookSpec): FacebookSmokeIdentity {
  return spec.expectedEventType === "new_post" ? IDENTITY : COMMENT_IDENTITY;
}

/** Run the synthetic body through the REAL classify + normalize pipeline. */
function normalizeSynthetic(
  spec: FacebookSpec,
  identity: FacebookSmokeIdentity,
): DirectSeedSmokeRun {
  const body = JSON.parse(
    buildFacebookFeedChangeBody(
      identity,
      spec.expectedEventType as "new_post" | "new_comment",
      CREATED_AT,
    ),
  ) as FacebookWebhookBody;
  const entry = body.entry![0]!;
  const change = entry.changes![0]!;
  const kind = classifyFeedChange(change);
  if (kind === null) throw new Error("synthetic change did not classify");
  const event =
    kind === "new_post"
      ? normalizeNewPost({ pageId: entry.id!, value: change.value!, entryTime: entry.time })
      : normalizeNewComment({ pageId: entry.id!, value: change.value!, entryTime: entry.time });
  return {
    runId: "run-1",
    status: "queued",
    triggerPayload: event.payload as Record<string, unknown>,
    eventId: event.eventId,
    eventType: event.eventType,
  };
}

function makeFakeDeps(
  spec: FacebookSpec,
): DirectSeedWebhookSmokeDeps<FacebookSmokeIdentity> {
  const runs: DirectSeedSmokeRun[] = [];
  const seen = new Set<string>();
  return {
    mintIdentity: () => identityFor(spec),
    async createActiveSmokeWorkflow() {
      return { workflowId: "wf-test" };
    },
    async seedRegistration() {
      return { seededEventType: spec.expectedEventType };
    },
    async deliverSyntheticEvent({ identity }) {
      // Fake delivery still exercises the REAL classify+normalize pipeline so
      // the fired run is exactly what the production route would persist.
      const fired = normalizeSynthetic(spec, identity);
      if (!seen.has(fired.eventId!)) {
        seen.add(fired.eventId!);
        runs.push({ ...fired, runId: `run-${runs.length + 1}` });
      }
      return { httpStatus: 200 };
    },
    async listRuns() {
      return runs.map((r) => ({ ...r }));
    },
    async drainRun(runId) {
      const run = runs.find((r) => r.runId === runId);
      if (run) (run as { status: DirectSeedSmokeRun["status"] }).status = "succeeded";
    },
    async readRun(runId) {
      return runs.find((r) => r.runId === runId) ?? null;
    },
    async cleanupRegistration() {},
    async cleanupDedup() {},
    async sleep() {},
  };
}

describe("Facebook specs — fake happy path via the REAL classify+normalize pipeline", () => {
  it.each(ALL_FACEBOOK_WEBHOOK_SPECS.map((s) => [s.label, s] as const))(
    "%s passes: seed canonical → baseline 0 → deliver → 1 run identified → succeeded → dedup holds",
    async (_label, spec) => {
      const r = await runDirectSeedWebhookSmoke(makeFakeDeps(spec), spec, FAST);
      expect(r.outcome).toBe("pass");
      expect(r.seededEventType).toBe(spec.expectedEventType);
      expect(r.identityMatched).toBe(true);
      expect(r.terminalStatus).toBe("succeeded");
      expect(r.dedupProven).toBe(true);
      expect(r.cleaned).toBe(true);
    },
  );
});

describe("synthetic body ↔ REAL production modules", () => {
  it("the signed body verifies via the REAL verifyFacebookSignature (and tampering fails)", () => {
    const rawBody = buildFacebookFeedChangeBody(IDENTITY, "new_post", CREATED_AT);
    const secret = "crsmoke-unit-secret";
    const header = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
    expect(verifyFacebookSignature(rawBody, header, secret)).toEqual({ valid: true });
    expect(
      verifyFacebookSignature(`${rawBody} `, header, secret).valid,
    ).toBe(false);
    expect(verifyFacebookSignature(rawBody, header, "other-secret").valid).toBe(false);
  });

  it("new_post: REAL classify → new_post; REAL normalize output satisfies identityMatches", () => {
    const run = normalizeSynthetic(FACEBOOK_NEW_POST_SPEC, IDENTITY);
    expect(run.eventType).toBe("new_post");
    expect(run.eventId).toBe(IDENTITY.eventId);
    expect(FACEBOOK_NEW_POST_SPEC.identityMatches(run, IDENTITY)).toBe(true);
  });

  it("new_comment: REAL classify → new_comment; REAL normalize output satisfies identityMatches", () => {
    const run = normalizeSynthetic(FACEBOOK_NEW_COMMENT_SPEC, COMMENT_IDENTITY);
    expect(run.eventType).toBe("new_comment");
    expect(run.eventId).toBe(COMMENT_IDENTITY.eventId);
    expect(run.triggerPayload?.parentId).toBe(COMMENT_IDENTITY.postId);
    expect(FACEBOOK_NEW_COMMENT_SPEC.identityMatches(run, COMMENT_IDENTITY)).toBe(true);
  });

  it("REAL new_post filter: positive match on the seeded pageId, no-match on a foreign page", () => {
    const run = normalizeSynthetic(FACEBOOK_NEW_POST_SPEC, IDENTITY);
    const event = {
      provider: "facebook",
      eventType: "new_post",
      eventId: run.eventId!,
      occurredAt: new Date(CREATED_AT * 1000).toISOString(),
      providerAccountId: IDENTITY.pageId,
      payload: run.triggerPayload!,
    };
    const config = facebookNewPostFilter.parseConfig({ pageId: IDENTITY.pageId });
    expect(facebookNewPostFilter.evaluate(event, config).kind).toBe("match");
    const foreign = facebookNewPostFilter.parseConfig({ pageId: "someoneelsepage" });
    expect(facebookNewPostFilter.evaluate(event, foreign).kind).toBe("no-match");
  });

  it("REAL new_comment filter: page match; optional postId narrows correctly", () => {
    const run = normalizeSynthetic(FACEBOOK_NEW_COMMENT_SPEC, COMMENT_IDENTITY);
    const event = {
      provider: "facebook",
      eventType: "new_comment",
      eventId: run.eventId!,
      occurredAt: new Date(CREATED_AT * 1000).toISOString(),
      providerAccountId: COMMENT_IDENTITY.pageId,
      payload: run.triggerPayload!,
    };
    const pageOnly = facebookNewCommentFilter.parseConfig({
      pageId: COMMENT_IDENTITY.pageId,
    });
    expect(facebookNewCommentFilter.evaluate(event, pageOnly).kind).toBe("match");
    const pinnedPost = facebookNewCommentFilter.parseConfig({
      pageId: COMMENT_IDENTITY.pageId,
      postId: COMMENT_IDENTITY.postId,
    });
    expect(facebookNewCommentFilter.evaluate(event, pinnedPost).kind).toBe("match");
    const wrongPost = facebookNewCommentFilter.parseConfig({
      pageId: COMMENT_IDENTITY.pageId,
      postId: "otherpost",
    });
    expect(facebookNewCommentFilter.evaluate(event, wrongPost).kind).toBe("no-match");
  });

  it("non-add verbs and non-feed fields never classify (edits/likes stay out of scope)", () => {
    expect(
      classifyFeedChange({ field: "feed", value: { item: "status", verb: "edited" } }),
    ).toBeNull();
    expect(
      classifyFeedChange({ field: "mention", value: { item: "status", verb: "add" } }),
    ).toBeNull();
  });
});

describe("Facebook specs — pure parts", () => {
  it("spec inventory covers exactly the two registered Facebook triggers", () => {
    expect(ALL_FACEBOOK_WEBHOOK_SPECS.map((s) => `${s.provider}:${s.expectedEventType}`)).toEqual([
      "facebook:new_post",
      "facebook:new_comment",
    ]);
  });

  it("workflow configs carry the meta-required pageId", () => {
    for (const spec of ALL_FACEBOOK_WEBHOOK_SPECS) {
      const wf = spec.buildWorkflow();
      expect(
        wf.definition.nodes.find((n) => n.id === wf.triggerNodeId)!.config,
      ).toHaveProperty("pageId");
    }
  });

  it("new_post identity rejects a lost marker, a foreign eventId, and a wrong page", () => {
    const good = normalizeSynthetic(FACEBOOK_NEW_POST_SPEC, IDENTITY);
    expect(
      FACEBOOK_NEW_POST_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, message: "unrelated" } },
        IDENTITY,
      ),
    ).toBe(false);
    expect(
      FACEBOOK_NEW_POST_SPEC.identityMatches(
        { ...good, eventId: "new_post:otherpage:otherpost" },
        IDENTITY,
      ),
    ).toBe(false);
    expect(
      FACEBOOK_NEW_POST_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, pageId: "otherpage" } },
        IDENTITY,
      ),
    ).toBe(false);
  });
});
