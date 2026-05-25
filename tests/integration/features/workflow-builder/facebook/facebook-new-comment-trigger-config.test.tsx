/**
 * @jest-environment node
 *
 * Slice 3.FACEBOOK-5 builder-shape test — Facebook `new_comment` trigger.
 * Pins the page picker, the optional page → post cascade (local postId
 * filter), webhook activation, and that persisted config parses.
 */
import { facebookNewCommentTriggerMeta } from "@/integrations/facebook/triggers/newComment/newComment.meta";
import { FacebookNewCommentConfigSchema } from "@/integrations/facebook/triggers/newComment/schema";
import { facebookNewCommentFilter } from "@/integrations/facebook/triggers/newComment/filter";

describe("facebook new_comment trigger meta — Builder shape (page → post cascade)", () => {
  it("declares pageId + optional postId", () => {
    expect(facebookNewCommentTriggerMeta.fields.map((f) => f.name)).toEqual([
      "pageId",
      "postId",
    ]);
  });

  it("page picker required; post picker is an OPTIONAL local filter cascading from pageId", () => {
    const page = facebookNewCommentTriggerMeta.fields.find((f) => f.name === "pageId")!;
    const post = facebookNewCommentTriggerMeta.fields.find((f) => f.name === "postId")!;
    expect(page.optionsSource).toBe("facebook:pages");
    expect(page.required).toBe(true);
    expect(post.optionsSource).toBe("facebook:posts");
    expect(post.dependsOn).toBe("pageId");
    expect(post.required).toBe(false);
  });

  it("is webhook-activated + requires integration", () => {
    expect(facebookNewCommentTriggerMeta.activation).toBe("webhook");
    expect(facebookNewCommentTriggerMeta.requiresIntegration).toBe(true);
  });

  it("persisted config parses with and without the optional postId", () => {
    expect(() => FacebookNewCommentConfigSchema.parse({ pageId: "page-1" })).not.toThrow();
    expect(() =>
      FacebookNewCommentConfigSchema.parse({ pageId: "page-1", postId: "page-1_99" }),
    ).not.toThrow();
  });

  it("persisted config parses against the dispatcher filter config (with optional postId)", () => {
    expect(() => facebookNewCommentFilter.parseConfig({ pageId: "page-1" })).not.toThrow();
    expect(() =>
      facebookNewCommentFilter.parseConfig({ pageId: "page-1", postId: "page-1_99" }),
    ).not.toThrow();
  });
});
