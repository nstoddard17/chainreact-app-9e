/**
 * @jest-environment node
 *
 * Slice 3.DROPBOX-4 builder-shape test — Dropbox `delete_file`. Pins the
 * folderPath → path cascade, the high/destructive/confirmation trio, the
 * structural-only output, and that persisted config parses.
 */
import { dropboxDeleteFileMeta } from "@/integrations/dropbox/actions/deleteFile.meta";
import { DeleteFileConfigSchema } from "@/integrations/dropbox/actions/deleteFile.schema";

describe("dropbox delete_file meta — Builder shape (destructive)", () => {
  it("declares folderPath (UI-scope) + path", () => {
    expect(dropboxDeleteFileMeta.fields.map((f) => f.name)).toEqual([
      "folderPath",
      "path",
    ]);
  });

  it("file picker wires dropbox:files dependsOn folderPath", () => {
    const f = dropboxDeleteFileMeta.fields.find((x) => x.name === "path")!;
    expect(f.optionsSource).toBe("dropbox:files");
    expect(f.dependsOn).toBe("folderPath");
  });

  it("declares the destructive trio + high risk", () => {
    expect(dropboxDeleteFileMeta.isDestructive).toBe(true);
    expect(dropboxDeleteFileMeta.requiresConfirmation).toBe(true);
    expect(dropboxDeleteFileMeta.riskLevel).toBe("high");
    expect(dropboxDeleteFileMeta.riskDescription).toMatch(/restore/i);
  });

  it("structural-only output (no deleted name / content echoed); path echo is sensitive", () => {
    expect(dropboxDeleteFileMeta.outputs.map((o) => o.name).sort()).toEqual([
      "deletedAt",
      "path",
      "success",
    ]);
    expect(
      dropboxDeleteFileMeta.outputs.find((o) => o.name === "path")!.sensitive,
    ).toBe(true);
    expect(dropboxDeleteFileMeta.producesFileRef).toBe(false);
    expect(dropboxDeleteFileMeta.consumesFileRef).toBe(false);
  });

  it("persisted config (path + UI-scope folderPath) parses against the runtime schema", () => {
    expect(() =>
      DeleteFileConfigSchema.parse({
        path: "/Reports/old.pdf",
        folderPath: "/Reports",
      }),
    ).not.toThrow();
  });
});
