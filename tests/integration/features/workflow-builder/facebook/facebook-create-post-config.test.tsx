/**
 * @jest-environment node
 *
 * Slice 3.FACEBOOK-4 builder-shape test — Facebook `create_post`. Pins the
 * page picker, the message textarea, the optional link / scheduledPublishTime
 * fields, and that persisted config parses against the runtime schema.
 */
import { facebookCreatePostMeta } from "@/integrations/facebook/actions/createPost.meta";
import { CreatePostConfigSchema } from "@/integrations/facebook/actions/createPost.schema";

describe("facebook create_post meta — Builder shape", () => {
  it("declares pageId + message + link + scheduledPublishTime", () => {
    expect(facebookCreatePostMeta.fields.map((f) => f.name)).toEqual([
      "pageId",
      "message",
      "link",
      "scheduledPublishTime",
    ]);
  });

  it("page picker uses facebook:pages (no dep, required)", () => {
    const f = facebookCreatePostMeta.fields.find((x) => x.name === "pageId")!;
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("facebook:pages");
    expect(f.dependsOn).toBeUndefined();
    expect(f.required).toBe(true);
  });

  it("message is a required textarea", () => {
    const f = facebookCreatePostMeta.fields.find((x) => x.name === "message")!;
    expect(f.type).toBe("textarea");
    expect(f.required).toBe(true);
  });

  it("does NOT declare a media[] / photos field (create_post media is deferred)", () => {
    expect(facebookCreatePostMeta.fields.find((f) => f.name === "media")).toBeUndefined();
    expect(facebookCreatePostMeta.fields.find((f) => f.name === "photos")).toBeUndefined();
    expect(facebookCreatePostMeta.consumesFileRef).toBe(false);
  });

  it("risk: medium (public publish, recoverable)", () => {
    expect(facebookCreatePostMeta.riskLevel).toBe("medium");
    expect(facebookCreatePostMeta.isDestructive).toBe(false);
  });

  it("persisted config (message only) parses against the runtime schema", () => {
    expect(() =>
      CreatePostConfigSchema.parse({ pageId: "123", message: "Hello world" }),
    ).not.toThrow();
  });

  it("persisted config (with link + scheduledPublishTime) parses", () => {
    expect(() =>
      CreatePostConfigSchema.parse({
        pageId: "123",
        message: "Launch!",
        link: "https://example.com",
        scheduledPublishTime: "2026-06-01T09:00:00Z",
      }),
    ).not.toThrow();
  });
});
