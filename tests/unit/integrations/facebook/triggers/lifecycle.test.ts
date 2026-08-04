/**
 * @jest-environment node
 *
 * facebook/triggers trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockGetPageAccessToken = jest.fn();
const mockSubscribe = jest.fn();
const mockUnsubscribe = jest.fn();
const mockListByConfigContains = jest.fn();
const mockDispatchTriggerEvent = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

jest.mock("@/integrations/_shared/facebook/api/getPageAccessToken", () => ({
  getPageAccessToken: (...args: unknown[]) => mockGetPageAccessToken(...args),
}));

jest.mock("@/integrations/_shared/facebook/api/subscribedApps", () => ({
  subscribePageToApp: (...args: unknown[]) => mockSubscribe(...args),
  unsubscribePageFromApp: (...args: unknown[]) => mockUnsubscribe(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  listByConfigContains: (...args: unknown[]) => mockListByConfigContains(...args),
}));

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...a: unknown[]) => mockDispatchTriggerEvent(...a),
}));

import { facebookSharedActivate } from "@/integrations/facebook/triggers/_shared/activate";
import type { IntegrationRecord } from "@/repositories/integrations";
import { facebookSharedDeactivate } from "@/integrations/facebook/triggers/_shared/deactivate";
import { NotFoundError } from "@/integrations/_shared/facebook/errors";
import { dispatchFacebookPagePayload } from "@/integrations/facebook/triggers/_shared/dispatch";
import { facebookNewPostFilter } from "@/integrations/facebook/triggers/newPost/filter";
import { facebookNewCommentFilter } from "@/integrations/facebook/triggers/newComment/filter";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import { classifyFeedChange, normalizeNewComment, normalizeNewPost, type FacebookFeedChange } from "@/integrations/facebook/triggers/_shared/normalize";
import { createHmac } from "node:crypto";
import { MissingSecretError, receiveFacebookWebhook } from "@/integrations/facebook/triggers/_shared/receive";
import { InvalidSignatureError } from "@/core/triggers/errors";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// Tests for the shared Facebook trigger activation hook
// (`triggers/_shared/activate.ts`) — Slice 3.FACEBOOK-5. Derives the Page
// token, subscribes the Page to the app (subscribed_apps), returns the
// config patch.
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "facebook",
  providerAccountId: "fb-user-1",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["pages_manage_metadata"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-25T00:00:00Z",
  updatedAt: "2026-05-25T00:00:00Z",
};

function node(config: Record<string, unknown>) {
  return {
    id: "node-1",
    kind: "trigger" as const,
    provider: "facebook",
    type: "new_post",
    config,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGetPageAccessToken.mockReset();
  mockSubscribe.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("user-tok"),
  );
  mockGetPageAccessToken.mockResolvedValue("page-tok");
  mockSubscribe.mockResolvedValue({ success: true });
});

describe("facebookSharedActivate", () => {
  it("derives the Page token then subscribes the Page via subscribed_apps(feed)", async () => {
    const patch = await facebookSharedActivate({
      node: node({ pageId: "page-1" }) as unknown as Parameters<typeof facebookSharedActivate>[0]["node"],
      integration,
      workflowId: "wf-1",
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "facebook",
      providerAccountId: "fb-user-1",
      });
    expect(mockGetPageAccessToken).toHaveBeenCalledWith({
      accessToken: "user-tok",
      pageId: "page-1",
    });
    expect(mockSubscribe.mock.calls[0]![0]).toMatchObject({
      pageAccessToken: "page-tok",
      pageId: "page-1",
      fields: ["feed"],
    });
    // Config patch stored on the trigger row.
    expect(patch).toMatchObject({ pageId: "page-1", subscribedFields: ["feed"] });
    expect(typeof patch.subscribedAt).toBe("string");
  });

  it("throws (aborts activation) when pageId is missing", async () => {
    await expect(
      facebookSharedActivate({
        node: node({}) as unknown as Parameters<typeof facebookSharedActivate>[0]["node"],
        integration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/pageId is required/);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former deactivate.test.ts
// Tests for the shared Facebook trigger deactivation hook
// (`triggers/_shared/deactivate.ts`) — Slice 3.FACEBOOK-5.
// The shared-subscription safety contract: `subscribed_apps` is page-level,
// so unsubscribe ONLY when no OTHER workflow still watches the Page.
// ---------------------------------------------------------------------------
describe("deactivate (lifecycle)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "facebook",
  providerAccountId: "fb-user-1",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

function trigger(config: Record<string, unknown>, workflowId = "wf-1") {
  return {
    id: "tr-1",
    workflowId,
    workflowAccountId: "acct-user-1",
    userId: "user-1",
    provider: "facebook",
    eventType: "new_post",
    nodeId: "node-1",
    config,
    providerAccountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

function row(workflowId: string, provider = "facebook", pageId = "page-1") {
  return { ...trigger({ pageId }, workflowId), provider };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGetPageAccessToken.mockReset();
  mockUnsubscribe.mockReset();
  mockListByConfigContains.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("user-tok"),
  );
  mockGetPageAccessToken.mockResolvedValue("page-tok");
  mockUnsubscribe.mockResolvedValue({ success: true });
});

describe("facebookSharedDeactivate — reference-count safety", () => {
  it("UNSUBSCRIBES when this is the last workflow watching the Page", async () => {
    // listByConfigContains returns only this workflow's own row.
    mockListByConfigContains.mockResolvedValueOnce([row("wf-1")]);
    await facebookSharedDeactivate({ trigger: trigger({ pageId: "page-1" }), integration });
    expect(mockGetPageAccessToken).toHaveBeenCalledWith({
      accessToken: "user-tok",
      pageId: "page-1",
    });
    expect(mockUnsubscribe.mock.calls[0]![0]).toMatchObject({
      pageAccessToken: "page-tok",
      pageId: "page-1",
    });
  });

  it("SKIPS unsubscribe when ANOTHER workflow still watches the same Page", async () => {
    mockListByConfigContains.mockResolvedValueOnce([row("wf-1"), row("wf-2")]);
    await facebookSharedDeactivate({ trigger: trigger({ pageId: "page-1" }), integration });
    expect(mockUnsubscribe).not.toHaveBeenCalled();
  });

  it("ignores rows from other providers that happen to carry the same pageId value", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      row("wf-1"),
      row("wf-9", "monday"), // different provider — not a Facebook page subscription.
    ]);
    await facebookSharedDeactivate({ trigger: trigger({ pageId: "page-1" }), integration });
    // No OTHER facebook workflow → still unsubscribe.
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("treats the same workflow's other trigger nodes as NOT blocking (whole workflow is going away)", async () => {
    // Same workflow, second fb trigger node on the same page.
    mockListByConfigContains.mockResolvedValueOnce([
      row("wf-1"),
      { ...row("wf-1"), nodeId: "node-2", eventType: "new_comment" },
    ]);
    await facebookSharedDeactivate({ trigger: trigger({ pageId: "page-1" }), integration });
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("no-op when the trigger row carries no pageId", async () => {
    await facebookSharedDeactivate({ trigger: trigger({}), integration });
    expect(mockListByConfigContains).not.toHaveBeenCalled();
    expect(mockUnsubscribe).not.toHaveBeenCalled();
  });
});

describe("facebookSharedDeactivate — best-effort remote call", () => {
  it("swallows NotFoundError (page already unsubscribed / gone)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([row("wf-1")]);
    mockUnsubscribe.mockRejectedValueOnce(new NotFoundError("page/page-1"));
    await expect(
      facebookSharedDeactivate({ trigger: trigger({ pageId: "page-1" }), integration }),
    ).resolves.toBeUndefined();
  });

  it("swallows Unauthorized401Error (token revoked — re-auth won't help)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([row("wf-1")]);
    const err = new Error("401");
    err.name = "Unauthorized401Error";
    mockUnsubscribe.mockRejectedValueOnce(err);
    await expect(
      facebookSharedDeactivate({ trigger: trigger({ pageId: "page-1" }), integration }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors (lifecycle orchestrator catches + still deletes the row)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([row("wf-1")]);
    mockUnsubscribe.mockRejectedValueOnce(new Error("graph 500"));
    await expect(
      facebookSharedDeactivate({ trigger: trigger({ pageId: "page-1" }), integration }),
    ).rejects.toThrow("graph 500");
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former dispatch.test.ts
// Tests for `integrations/facebook/triggers/_shared/dispatch.ts` —
// Slice 3.FACEBOOK-5. Page-payload fan-out into the provider-agnostic
// dispatcher; non-page ignored; edits/likes skipped.
// ---------------------------------------------------------------------------
describe("dispatch (lifecycle)", () => {

beforeEach(() => {
  mockDispatchTriggerEvent.mockReset();
  mockDispatchTriggerEvent.mockResolvedValue({
    matched: 1,
    enqueued: 1,
    duplicate: false,
    dedupOutage: false,
  });
});

describe("dispatchFacebookPagePayload", () => {
  it("ignores a non-page object (quiet ack, no dispatch)", async () => {
    const summary = await dispatchFacebookPagePayload({ object: "user", entry: [] });
    expect(summary.ignored).toBe(true);
    expect(mockDispatchTriggerEvent).not.toHaveBeenCalled();
  });

  it("dispatches one event per qualifying feed change (post + comment)", async () => {
    const summary = await dispatchFacebookPagePayload({
      object: "page",
      entry: [
        {
          id: "page-1",
          time: 1700000000,
          changes: [
            { field: "feed", value: { item: "status", verb: "add", post_id: "p_1", message: "hi" } },
            { field: "feed", value: { item: "comment", verb: "add", comment_id: "c_1", post_id: "p_1" } },
          ],
        },
      ],
    });
    expect(summary.ignored).toBe(false);
    expect(summary.changes).toBe(2);
    expect(mockDispatchTriggerEvent).toHaveBeenCalledTimes(2);
    const types = mockDispatchTriggerEvent.mock.calls.map((c) => (c[0] as { eventType: string }).eventType);
    expect(types.sort()).toEqual(["new_comment", "new_post"]);
    expect(summary.enqueued).toBe(2);
  });

  it("skips edits / removes / likes (verb !== add, or non-post/comment items)", async () => {
    const summary = await dispatchFacebookPagePayload({
      object: "page",
      entry: [
        {
          id: "page-1",
          changes: [
            { field: "feed", value: { item: "status", verb: "edited", post_id: "p_1" } },
            { field: "feed", value: { item: "status", verb: "remove", post_id: "p_1" } },
            { field: "feed", value: { item: "like", verb: "add" } },
            { field: "mention", value: { item: "status", verb: "add", post_id: "p_2" } },
          ],
        },
      ],
    });
    expect(summary.changes).toBe(0);
    expect(mockDispatchTriggerEvent).not.toHaveBeenCalled();
  });

  it("handles multiple page entries", async () => {
    const summary = await dispatchFacebookPagePayload({
      object: "page",
      entry: [
        { id: "page-1", changes: [{ field: "feed", value: { item: "photo", verb: "add", post_id: "p_1" } }] },
        { id: "page-2", changes: [{ field: "feed", value: { item: "video", verb: "add", post_id: "p_2" } }] },
      ],
    });
    expect(summary.entries).toBe(2);
    expect(summary.changes).toBe(2);
    expect(mockDispatchTriggerEvent).toHaveBeenCalledTimes(2);
  });

  it("skips entries with no usable pageId", async () => {
    const summary = await dispatchFacebookPagePayload({
      object: "page",
      entry: [{ id: "", changes: [{ field: "feed", value: { item: "status", verb: "add", post_id: "p_1" } }] }],
    });
    expect(summary.changes).toBe(0);
    expect(mockDispatchTriggerEvent).not.toHaveBeenCalled();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former filter.test.ts
// Tests for the Facebook trigger filters (`newPost/filter.ts`,
// `newComment/filter.ts`) — Slice 3.FACEBOOK-5. pageId match + optional
// local postId narrowing.
// ---------------------------------------------------------------------------
describe("filter (lifecycle)", () => {

function postEvent(pageId: string): TriggerEvent {
  return {
    provider: "facebook",
    eventType: "new_post",
    eventId: `new_post:${pageId}:p1`,
    occurredAt: "2026-05-25T00:00:00Z",
    providerAccountId: pageId,
    payload: { changeKind: "new_post", pageId, postId: "p1" },
  };
}

function commentEvent(pageId: string, postId: string): TriggerEvent {
  return {
    provider: "facebook",
    eventType: "new_comment",
    eventId: `new_comment:${pageId}:c1`,
    occurredAt: "2026-05-25T00:00:00Z",
    providerAccountId: pageId,
    payload: { changeKind: "new_comment", pageId, postId, commentId: "c1" },
  };
}

describe("facebookNewPostFilter", () => {
  it("matches when the event pageId equals the configured pageId", () => {
    const cfg = facebookNewPostFilter.parseConfig({ pageId: "page-1" });
    expect(facebookNewPostFilter.evaluate(postEvent("page-1"), cfg).kind).toBe("match");
  });

  it("no-match for a different page", () => {
    const cfg = facebookNewPostFilter.parseConfig({ pageId: "page-1" });
    expect(facebookNewPostFilter.evaluate(postEvent("page-2"), cfg).kind).toBe("no-match");
  });

  it("parseConfig throws (dispatcher fails closed) when pageId is missing", () => {
    expect(() => facebookNewPostFilter.parseConfig({})).toThrow();
  });
});

describe("facebookNewCommentFilter", () => {
  it("matches on pageId when no postId filter is configured (any post)", () => {
    const cfg = facebookNewCommentFilter.parseConfig({ pageId: "page-1" });
    expect(facebookNewCommentFilter.evaluate(commentEvent("page-1", "post-9"), cfg).kind).toBe(
      "match",
    );
  });

  it("no-match for a different page", () => {
    const cfg = facebookNewCommentFilter.parseConfig({ pageId: "page-1" });
    expect(facebookNewCommentFilter.evaluate(commentEvent("page-2", "post-9"), cfg).kind).toBe(
      "no-match",
    );
  });

  it("applies the optional postId local filter — matches the configured post", () => {
    const cfg = facebookNewCommentFilter.parseConfig({ pageId: "page-1", postId: "post-9" });
    expect(facebookNewCommentFilter.evaluate(commentEvent("page-1", "post-9"), cfg).kind).toBe(
      "match",
    );
  });

  it("applies the optional postId local filter — drops comments on other posts", () => {
    const cfg = facebookNewCommentFilter.parseConfig({ pageId: "page-1", postId: "post-9" });
    expect(facebookNewCommentFilter.evaluate(commentEvent("page-1", "post-other"), cfg).kind).toBe(
      "no-match",
    );
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// Tests for `integrations/facebook/triggers/_shared/normalize.ts` —
// Slice 3.FACEBOOK-5. Classification (add-only), new_post / new_comment
// normalization, edit/remove ignored, no raw payload exposed.
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

describe("classifyFeedChange", () => {
  it("post-like item + verb add → new_post", () => {
    for (const item of ["status", "photo", "video", "share", "post", "album", "link"]) {
      expect(
        classifyFeedChange({ field: "feed", value: { item, verb: "add" } }),
      ).toBe("new_post");
    }
  });

  it("comment item + verb add → new_comment", () => {
    expect(
      classifyFeedChange({ field: "feed", value: { item: "comment", verb: "add" } }),
    ).toBe("new_comment");
  });

  it("ignores edits / removes / hides (verb !== add)", () => {
    for (const verb of ["edited", "edit", "remove", "hide", "unhide", "delete"]) {
      expect(
        classifyFeedChange({ field: "feed", value: { item: "status", verb } }),
      ).toBeNull();
      expect(
        classifyFeedChange({ field: "feed", value: { item: "comment", verb } }),
      ).toBeNull();
    }
  });

  it("ignores likes / reactions and non-feed fields", () => {
    expect(
      classifyFeedChange({ field: "feed", value: { item: "like", verb: "add" } }),
    ).toBeNull();
    expect(
      classifyFeedChange({ field: "feed", value: { item: "reaction", verb: "add" } }),
    ).toBeNull();
    expect(
      classifyFeedChange({ field: "mention", value: { item: "status", verb: "add" } }),
    ).toBeNull();
  });
});

describe("normalizeNewPost", () => {
  it("maps a feed post change to the canonical TriggerEvent", () => {
    const event = normalizeNewPost({
      pageId: "page-1",
      value: {
        item: "photo",
        verb: "add",
        post_id: "page-1_99",
        created_time: 1700000000,
        message: "Hello world",
        permalink_url: "https://facebook.com/page-1/posts/99",
        from: { id: "actor-7", name: "Alice" },
      },
      entryTime: 1700000001,
    });
    expect(event.provider).toBe("facebook");
    expect(event.eventType).toBe("new_post");
    expect(event.eventId).toBe("new_post:page-1:page-1_99");
    expect(event.providerAccountId).toBe("page-1");
    expect(event.payload).toEqual({
      changeKind: "new_post",
      pageId: "page-1",
      postId: "page-1_99",
      message: "Hello world",
      permalinkUrl: "https://facebook.com/page-1/posts/99",
      createdTime: new Date(1700000000 * 1000).toISOString(),
      fromId: "actor-7",
      mediaType: "photo",
    });
  });

  it("nulls optional fields and never exposes raw payload keys", () => {
    const event = normalizeNewPost({
      pageId: "page-1",
      value: { item: "status", verb: "add", post_id: "p_1" },
    });
    expect(event.payload.message).toBeNull();
    expect(event.payload.permalinkUrl).toBeNull();
    expect(event.payload.fromId).toBeNull();
    // Only the documented canonical keys — no `verb`, no `from` object.
    expect(Object.keys(event.payload).sort()).toEqual([
      "changeKind",
      "createdTime",
      "fromId",
      "mediaType",
      "message",
      "pageId",
      "permalinkUrl",
      "postId",
    ]);
  });
});

describe("normalizeNewComment", () => {
  it("maps a feed comment change to the canonical TriggerEvent", () => {
    const event = normalizeNewComment({
      pageId: "page-1",
      value: {
        item: "comment",
        verb: "add",
        comment_id: "p_1_c_5",
        post_id: "page-1_1",
        created_time: 1700000500,
        message: "Nice post",
        parent_id: "page-1_1",
        from: { id: "commenter-3", name: "Bob" },
      },
    });
    expect(event.eventType).toBe("new_comment");
    expect(event.eventId).toBe("new_comment:page-1:p_1_c_5");
    expect(event.payload).toEqual({
      changeKind: "new_comment",
      pageId: "page-1",
      postId: "page-1_1",
      commentId: "p_1_c_5",
      message: "Nice post",
      createdTime: new Date(1700000500 * 1000).toISOString(),
      fromId: "commenter-3",
      parentId: "page-1_1",
    });
  });

  it("only canonical keys — no raw payload exposed", () => {
    const event = normalizeNewComment({
      pageId: "page-1",
      value: { item: "comment", verb: "add", comment_id: "c_1" },
    });
    expect(Object.keys(event.payload).sort()).toEqual([
      "changeKind",
      "commentId",
      "createdTime",
      "fromId",
      "message",
      "pageId",
      "parentId",
      "postId",
    ]);
  });
});

// A tiny compile-time / shape sanity that the change type is exported.
const _typecheck: FacebookFeedChange = { field: "feed", value: { item: "status", verb: "add" } };
void _typecheck;

});

// ---------------------------------------------------------------------------
// Merged from the former receive.test.ts
// Tests for `integrations/facebook/triggers/_shared/receive.ts` —
// Slice 3.FACEBOOK-5. Signature verify (fail-closed) + parse. No leaks.
// ---------------------------------------------------------------------------
describe("receive (lifecycle)", () => {

const SECRET = "fb-app-secret";

function sign(body: string, secret = SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://app.test/api/webhooks/facebook", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  process.env.FACEBOOK_CLIENT_SECRET = SECRET;
});

describe("receiveFacebookWebhook", () => {
  const body = JSON.stringify({ object: "page", entry: [{ id: "p1", changes: [] }] });

  it("valid signature → returns the parsed body", () => {
    const result = receiveFacebookWebhook({
      request: req({ "X-Hub-Signature-256": sign(body) }),
      rawBody: body,
    });
    expect(result.body).toMatchObject({ object: "page" });
  });

  it("missing secret → MissingSecretError (route maps to 503)", () => {
    delete process.env.FACEBOOK_CLIENT_SECRET;
    expect(() =>
      receiveFacebookWebhook({
        request: req({ "X-Hub-Signature-256": sign(body) }),
        rawBody: body,
      }),
    ).toThrow(MissingSecretError);
  });

  it("missing signature header → InvalidSignatureError", () => {
    expect(() =>
      receiveFacebookWebhook({ request: req(), rawBody: body }),
    ).toThrow(InvalidSignatureError);
  });

  it("wrong signature → InvalidSignatureError", () => {
    expect(() =>
      receiveFacebookWebhook({
        request: req({ "X-Hub-Signature-256": sign("other") }),
        rawBody: body,
      }),
    ).toThrow(InvalidSignatureError);
  });

  it("verified-but-non-JSON body → InvalidSignatureError (malformed)", () => {
    const raw = "not json";
    expect(() =>
      receiveFacebookWebhook({
        request: req({ "X-Hub-Signature-256": sign(raw) }),
        rawBody: raw,
      }),
    ).toThrow(InvalidSignatureError);
  });

  it("never leaks the secret in the error message", () => {
    try {
      receiveFacebookWebhook({
        request: req({ "X-Hub-Signature-256": sign("other") }),
        rawBody: body,
      });
    } catch (err) {
      expect((err as Error).message).not.toContain(SECRET);
    }
  });
});

});
