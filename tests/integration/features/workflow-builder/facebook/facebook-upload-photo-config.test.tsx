/**
 * @jest-environment node
 *
 * Slice 3.FACEBOOK-4 builder-shape test — Facebook `upload_photo` (FileRef
 * consumer). Pins the page picker, the `photo` FileRef input, consumesFileRef,
 * the absence of an album field, and that persisted config parses.
 */
import { facebookUploadPhotoMeta } from "@/integrations/facebook/actions/uploadPhoto.meta";
import { UploadPhotoConfigSchema } from "@/integrations/facebook/actions/uploadPhoto.schema";
import type { FileRef } from "@/contracts/file";

describe("facebook upload_photo meta — Builder shape (FileRef consumer)", () => {
  it("declares pageId + photo + caption + published", () => {
    expect(facebookUploadPhotoMeta.fields.map((f) => f.name)).toEqual([
      "pageId",
      "photo",
      "caption",
      "published",
    ]);
  });

  it("photo field is type 'file'; consumesFileRef=true, producesFileRef=false", () => {
    const f = facebookUploadPhotoMeta.fields.find((x) => x.name === "photo")!;
    expect(f.type).toBe("file");
    expect(f.required).toBe(true);
    expect(facebookUploadPhotoMeta.consumesFileRef).toBe(true);
    expect(facebookUploadPhotoMeta.producesFileRef).toBe(false);
  });

  it("page picker uses facebook:pages (no dep, required)", () => {
    const f = facebookUploadPhotoMeta.fields.find((x) => x.name === "pageId")!;
    expect(f.optionsSource).toBe("facebook:pages");
    expect(f.dependsOn).toBeUndefined();
    expect(f.required).toBe(true);
  });

  it("does NOT declare an album field (runtime schema has no albumId)", () => {
    expect(facebookUploadPhotoMeta.fields.find((f) => f.name === "albumId")).toBeUndefined();
    expect(facebookUploadPhotoMeta.fields.find((f) => f.name === "album")).toBeUndefined();
  });

  it("description explains provider_url FileRef is unsupported", () => {
    expect(facebookUploadPhotoMeta.description).toMatch(/provider_url/);
  });

  it("persisted config (with a FileRef) parses against the runtime schema", () => {
    const photo: FileRef = {
      kind: "v2_storage",
      name: "image.png",
      mimeType: "image/png",
      storagePath: "u/wf/run/node/image.png",
    };
    expect(() =>
      UploadPhotoConfigSchema.parse({ pageId: "123", photo, caption: "Hi" }),
    ).not.toThrow();
  });

  it("risk: medium (recoverable media upload)", () => {
    expect(facebookUploadPhotoMeta.riskLevel).toBe("medium");
    expect(facebookUploadPhotoMeta.isDestructive).toBe(false);
  });
});
