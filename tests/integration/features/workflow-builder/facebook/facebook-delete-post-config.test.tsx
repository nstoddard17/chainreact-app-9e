/**
 * @jest-environment node
 *
 * Slice 3.FACEBOOK-4 builder-shape test — Facebook `delete_post` (destructive).
 * Pins the page → post cascade, the high/destructive/confirmation trio, the
 * structural-only output, and that persisted config parses.
 */
import { facebookDeletePostMeta } from "@/integrations/facebook/actions/deletePost.meta";
import { DeletePostConfigSchema } from "@/integrations/facebook/actions/deletePost.schema";

describe("facebook delete_post meta — Builder shape (destructive)", () => {
  it("declares pageId + postId", () => {
    expect(facebookDeletePostMeta.fields.map((f) => f.name)).toEqual([
      "pageId",
      "postId",
    ]);
  });

  it("post picker wires facebook:posts dependsOn pageId", () => {
    const post = facebookDeletePostMeta.fields.find((x) => x.name === "postId")!;
    expect(post.optionsSource).toBe("facebook:posts");
    expect(post.dependsOn).toBe("pageId");
    expect(post.required).toBe(true);
  });

  it("declares the destructive trio + high risk (no-restore copy)", () => {
    expect(facebookDeletePostMeta.isDestructive).toBe(true);
    expect(facebookDeletePostMeta.requiresConfirmation).toBe(true);
    expect(facebookDeletePostMeta.riskLevel).toBe("high");
    expect(facebookDeletePostMeta.riskDescription).toMatch(/restore/i);
  });

  it("structural-only output (no deleted content echoed)", () => {
    expect(facebookDeletePostMeta.outputs.map((o) => o.name).sort()).toEqual([
      "deletedAt",
      "deletedPostId",
      "success",
    ]);
    expect(facebookDeletePostMeta.producesFileRef).toBe(false);
    expect(facebookDeletePostMeta.consumesFileRef).toBe(false);
  });

  it("persisted config parses against the runtime schema", () => {
    expect(() =>
      DeletePostConfigSchema.parse({ pageId: "123", postId: "123_456" }),
    ).not.toThrow();
  });
});
