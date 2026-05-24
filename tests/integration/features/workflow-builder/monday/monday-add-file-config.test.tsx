/**
 * @jest-environment node
 *
 * Slice 3.MONDAY-6 builder-shape test — Monday `add_file` (FileRef
 * consumer). Pins the board → item AND board → file-column cascades, the
 * `file` FileRef input, consumesFileRef, and the __item_files__-capable
 * file-column resolver wiring.
 */
import { mondayAddFileMeta } from "@/integrations/monday/actions/files/addFile.meta";
import { AddFileConfigSchema } from "@/integrations/monday/actions/files/addFile.schema";
import type { FileRef } from "@/contracts/file";

describe("monday add_file meta — Builder shape (FileRef consumer)", () => {
  it("declares the UI-scope boardId + itemId + columnId + file + filename", () => {
    expect(mondayAddFileMeta.fields.map((f) => f.name)).toEqual([
      "boardId",
      "itemId",
      "columnId",
      "file",
      "filename",
    ]);
  });

  it("boardId is a cascade-root combobox (UI-scope narrower)", () => {
    const f = mondayAddFileMeta.fields.find((x) => x.name === "boardId")!;
    expect(f.optionsSource).toBe("monday:boards");
    expect(f.dependsOn).toBeUndefined();
  });

  it("item picker wires monday:items dependsOn boardId", () => {
    const f = mondayAddFileMeta.fields.find((x) => x.name === "itemId")!;
    expect(f.optionsSource).toBe("monday:items");
    expect(f.dependsOn).toBe("boardId");
  });

  it("file-column picker wires monday:file_columns dependsOn boardId (sentinel-capable resolver)", () => {
    const f = mondayAddFileMeta.fields.find((x) => x.name === "columnId")!;
    expect(f.optionsSource).toBe("monday:file_columns");
    expect(f.dependsOn).toBe("boardId");
  });

  it("file field is type 'file'; consumesFileRef=true, producesFileRef=false", () => {
    const f = mondayAddFileMeta.fields.find((x) => x.name === "file")!;
    expect(f.type).toBe("file");
    expect(mondayAddFileMeta.consumesFileRef).toBe(true);
    expect(mondayAddFileMeta.producesFileRef).toBe(false);
  });

  it("description explains provider_url FileRef is unsupported", () => {
    expect(mondayAddFileMeta.description).toMatch(/provider_url/);
  });

  it("persisted config (with a FileRef + UI-scope boardId) parses against the runtime schema", () => {
    const file: FileRef = {
      kind: "v2_storage",
      name: "report.pdf",
      mimeType: "application/pdf",
      storagePath: "u/wf/run/node/report.pdf",
    };
    expect(() =>
      AddFileConfigSchema.parse({
        boardId: "b-1",
        itemId: "i-1",
        columnId: "files",
        file,
      }),
    ).not.toThrow();
  });

  it("risk: medium", () => {
    expect(mondayAddFileMeta.riskLevel).toBe("medium");
  });
});
