/**
 * @jest-environment node
 *
 * Tests for the Facebook trigger filters (`newPost/filter.ts`,
 * `newComment/filter.ts`) — Slice 3.FACEBOOK-5. pageId match + optional
 * local postId narrowing.
 */
import { facebookNewPostFilter } from "@/integrations/facebook/triggers/newPost/filter";
import { facebookNewCommentFilter } from "@/integrations/facebook/triggers/newComment/filter";
import type { TriggerEvent } from "@/contracts/triggerEvent";

function postEvent(pageId: string): TriggerEvent {
  return {
    provider: "facebook",
    eventType: "new_post",
    eventId: `new_post:${pageId}:p1`,
    occurredAt: "2026-05-25T00:00:00Z",
    accountId: pageId,
    payload: { changeKind: "new_post", pageId, postId: "p1" },
  };
}

function commentEvent(pageId: string, postId: string): TriggerEvent {
  return {
    provider: "facebook",
    eventType: "new_comment",
    eventId: `new_comment:${pageId}:c1`,
    occurredAt: "2026-05-25T00:00:00Z",
    accountId: pageId,
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
