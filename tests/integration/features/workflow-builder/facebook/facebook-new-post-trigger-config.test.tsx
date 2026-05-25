/**
 * @jest-environment node
 *
 * Slice 3.FACEBOOK-5 builder-shape test — Facebook `new_post` trigger. Pins
 * the page picker, webhook activation, and that persisted config parses
 * against the trigger config schema + the dispatcher filter config.
 */
import { facebookNewPostTriggerMeta } from "@/integrations/facebook/triggers/newPost/newPost.meta";
import { FacebookNewPostConfigSchema } from "@/integrations/facebook/triggers/newPost/schema";
import { facebookNewPostFilter } from "@/integrations/facebook/triggers/newPost/filter";

describe("facebook new_post trigger meta — Builder shape", () => {
  it("declares a single pageId field", () => {
    expect(facebookNewPostTriggerMeta.fields.map((f) => f.name)).toEqual(["pageId"]);
  });

  it("page picker uses facebook:pages (no dep, required)", () => {
    const f = facebookNewPostTriggerMeta.fields.find((x) => x.name === "pageId")!;
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("facebook:pages");
    expect(f.dependsOn).toBeUndefined();
    expect(f.required).toBe(true);
  });

  it("is webhook-activated + requires integration", () => {
    expect(facebookNewPostTriggerMeta.activation).toBe("webhook");
    expect(facebookNewPostTriggerMeta.requiresIntegration).toBe(true);
  });

  it("persisted config parses against the runtime schema (+ activation fields)", () => {
    expect(() => FacebookNewPostConfigSchema.parse({ pageId: "page-1" })).not.toThrow();
    expect(() =>
      FacebookNewPostConfigSchema.parse({
        pageId: "page-1",
        subscribedFields: ["feed"],
        subscribedAt: "2026-05-25T00:00:00Z",
      }),
    ).not.toThrow();
  });

  it("persisted config also parses against the dispatcher filter config", () => {
    expect(() => facebookNewPostFilter.parseConfig({ pageId: "page-1" })).not.toThrow();
  });
});
