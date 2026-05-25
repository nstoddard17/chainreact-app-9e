/**
 * @jest-environment node
 *
 * Slice 3.FACEBOOK-4 builder-shape test — Facebook `update_post`. Pins the
 * page → post cascade, the message textarea, and that persisted config
 * parses against the runtime schema.
 */
import { facebookUpdatePostMeta } from "@/integrations/facebook/actions/updatePost.meta";
import { UpdatePostConfigSchema } from "@/integrations/facebook/actions/updatePost.schema";

describe("facebook update_post meta — Builder shape (page → post cascade)", () => {
  it("declares pageId + postId + message + isPublished", () => {
    expect(facebookUpdatePostMeta.fields.map((f) => f.name)).toEqual([
      "pageId",
      "postId",
      "message",
      "isPublished",
    ]);
  });

  it("post picker wires facebook:posts dependsOn pageId", () => {
    const page = facebookUpdatePostMeta.fields.find((f) => f.name === "pageId")!;
    const post = facebookUpdatePostMeta.fields.find((f) => f.name === "postId")!;
    expect(page.optionsSource).toBe("facebook:pages");
    expect(page.dependsOn).toBeUndefined();
    expect(post.optionsSource).toBe("facebook:posts");
    expect(post.dependsOn).toBe("pageId");
    expect(post.required).toBe(true);
  });

  it("risk: medium (mutates existing public content)", () => {
    expect(facebookUpdatePostMeta.riskLevel).toBe("medium");
    expect(facebookUpdatePostMeta.isDestructive).toBe(false);
  });

  it("persisted config parses against the runtime schema", () => {
    expect(() =>
      UpdatePostConfigSchema.parse({
        pageId: "123",
        postId: "123_456",
        message: "Edited text",
      }),
    ).not.toThrow();
  });
});
