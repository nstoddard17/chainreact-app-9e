/**
 * @jest-environment node
 *
 * Tests for `integrations/facebook/triggers/_shared/normalize.ts` —
 * Slice 3.FACEBOOK-5. Classification (add-only), new_post / new_comment
 * normalization, edit/remove ignored, no raw payload exposed.
 */
import {
  classifyFeedChange,
  normalizeNewComment,
  normalizeNewPost,
  type FacebookFeedChange,
} from "@/integrations/facebook/triggers/_shared/normalize";

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
