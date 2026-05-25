/**
 * @jest-environment node
 *
 * Slice 3.DROPBOX-4 builder-shape test — Dropbox `upload_file` (FileRef
 * consumer). Pins the `file` FileRef input, the destination-folder picker
 * (dropbox:folders), the `mode` enum, consumesFileRef, and that persisted
 * config parses against the runtime schema.
 */
import { dropboxUploadFileMeta } from "@/integrations/dropbox/actions/uploadFile.meta";
import { UploadFileConfigSchema } from "@/integrations/dropbox/actions/uploadFile.schema";
import type { FileRef } from "@/contracts/file";

describe("dropbox upload_file meta — Builder shape (FileRef consumer)", () => {
  it("declares file + path + filename + mode + autorename", () => {
    expect(dropboxUploadFileMeta.fields.map((f) => f.name)).toEqual([
      "file",
      "path",
      "filename",
      "mode",
      "autorename",
    ]);
  });

  it("file field is type 'file'; consumesFileRef=true, producesFileRef=false", () => {
    const f = dropboxUploadFileMeta.fields.find((x) => x.name === "file")!;
    expect(f.type).toBe("file");
    expect(dropboxUploadFileMeta.consumesFileRef).toBe(true);
    expect(dropboxUploadFileMeta.producesFileRef).toBe(false);
  });

  it("destination folder uses dropbox:folders (no dep, optional → Root)", () => {
    const f = dropboxUploadFileMeta.fields.find((x) => x.name === "path")!;
    expect(f.optionsSource).toBe("dropbox:folders");
    expect(f.dependsOn).toBeUndefined();
    expect(f.required).toBe(false);
  });

  it("mode is a static enum select (add / overwrite), no defaultValue", () => {
    const f = dropboxUploadFileMeta.fields.find((x) => x.name === "mode")!;
    expect(f.type).toBe("select");
    expect(f.options?.map((o) => o.value).sort()).toEqual(["add", "overwrite"]);
    expect(f.defaultValue).toBeUndefined();
  });

  it("description explains provider_url FileRef is unsupported", () => {
    expect(dropboxUploadFileMeta.description).toMatch(/provider_url/);
  });

  it("persisted config (with a FileRef + destination folder) parses against the runtime schema", () => {
    const file: FileRef = {
      kind: "v2_storage",
      name: "report.pdf",
      mimeType: "application/pdf",
      storagePath: "u/wf/run/node/report.pdf",
    };
    expect(() =>
      UploadFileConfigSchema.parse({ file, path: "/Reports", mode: "add" }),
    ).not.toThrow();
  });

  it("risk: medium (recoverable write)", () => {
    expect(dropboxUploadFileMeta.riskLevel).toBe("medium");
    expect(dropboxUploadFileMeta.isDestructive).toBe(false);
  });
});
