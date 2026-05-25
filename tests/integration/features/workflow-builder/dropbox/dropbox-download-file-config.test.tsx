/**
 * @jest-environment node
 *
 * Slice 3.DROPBOX-4 builder-shape test — Dropbox `download_file` (FileRef
 * producer). Pins the folderPath → path cascade (dropbox:folders →
 * dropbox:files), producesFileRef, and that persisted config — including
 * the UI-scope folderPath — parses against the runtime schema.
 */
import { dropboxDownloadFileMeta } from "@/integrations/dropbox/actions/downloadFile.meta";
import { DownloadFileConfigSchema } from "@/integrations/dropbox/actions/downloadFile.schema";

describe("dropbox download_file meta — Builder shape (FileRef producer)", () => {
  it("declares folderPath (UI-scope) + path", () => {
    expect(dropboxDownloadFileMeta.fields.map((f) => f.name)).toEqual([
      "folderPath",
      "path",
    ]);
  });

  it("folderPath uses dropbox:folders (no dep, optional)", () => {
    const f = dropboxDownloadFileMeta.fields.find((x) => x.name === "folderPath")!;
    expect(f.optionsSource).toBe("dropbox:folders");
    expect(f.dependsOn).toBeUndefined();
    expect(f.required).toBe(false);
  });

  it("file picker wires dropbox:files dependsOn folderPath (required)", () => {
    const f = dropboxDownloadFileMeta.fields.find((x) => x.name === "path")!;
    expect(f.optionsSource).toBe("dropbox:files");
    expect(f.dependsOn).toBe("folderPath");
    expect(f.required).toBe(true);
  });

  it("file field description notes root-level paths can be typed manually", () => {
    const f = dropboxDownloadFileMeta.fields.find((x) => x.name === "path")!;
    expect(f.description).toMatch(/manually/i);
  });

  it("producesFileRef=true with a sensitive fileRef output; consumesFileRef=false", () => {
    expect(dropboxDownloadFileMeta.producesFileRef).toBe(true);
    expect(dropboxDownloadFileMeta.consumesFileRef).toBe(false);
    const out = dropboxDownloadFileMeta.outputs.find((o) => o.name === "file")!;
    expect(out.type).toBe("fileRef");
    expect(out.sensitive).toBe(true);
  });

  it("persisted config (path + UI-scope folderPath) parses against the runtime schema", () => {
    expect(() =>
      DownloadFileConfigSchema.parse({
        path: "/Reports/q1.pdf",
        folderPath: "/Reports",
      }),
    ).not.toThrow();
  });

  it("risk: medium (data export)", () => {
    expect(dropboxDownloadFileMeta.riskLevel).toBe("medium");
    expect(dropboxDownloadFileMeta.isDestructive).toBe(false);
  });
});
