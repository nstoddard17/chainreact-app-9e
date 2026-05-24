/**
 * @jest-environment node
 *
 * Slice 3.MONDAY-6 builder-shape test — Monday `download_file` (FileRef
 * producer). Pins the board → item → fileId cascade, the
 * monday:item_files wiring on fileId, and producesFileRef.
 */
import { mondayDownloadFileMeta } from "@/integrations/monday/actions/files/downloadFile.meta";
import { DownloadFileConfigSchema } from "@/integrations/monday/actions/files/downloadFile.schema";

describe("monday download_file meta — Builder shape (FileRef producer)", () => {
  it("declares boardId + itemId + columnId + fileId (camelCase)", () => {
    expect(mondayDownloadFileMeta.fields.map((f) => f.name)).toEqual([
      "boardId",
      "itemId",
      "columnId",
      "fileId",
    ]);
  });

  it("item picker wires monday:items dependsOn boardId", () => {
    const f = mondayDownloadFileMeta.fields.find((x) => x.name === "itemId")!;
    expect(f.optionsSource).toBe("monday:items");
    expect(f.dependsOn).toBe("boardId");
  });

  it("file-column picker wires monday:file_columns dependsOn boardId", () => {
    const f = mondayDownloadFileMeta.fields.find((x) => x.name === "columnId")!;
    expect(f.optionsSource).toBe("monday:file_columns");
    expect(f.dependsOn).toBe("boardId");
  });

  it("fileId picker wires monday:item_files dependsOn columnId (optional)", () => {
    const f = mondayDownloadFileMeta.fields.find((x) => x.name === "fileId")!;
    expect(f.optionsSource).toBe("monday:item_files");
    expect(f.dependsOn).toBe("columnId");
    expect(f.required).toBe(false);
  });

  it("producesFileRef=true with a fileRef output; consumesFileRef=false", () => {
    expect(mondayDownloadFileMeta.producesFileRef).toBe(true);
    expect(mondayDownloadFileMeta.consumesFileRef).toBe(false);
    const out = mondayDownloadFileMeta.outputs.find((o) => o.name === "file")!;
    expect(out.type).toBe("fileRef");
    expect(out.sensitive).toBe(true);
  });

  it("persisted config (with fileId + UI-scope boardId) parses against the runtime schema", () => {
    expect(() =>
      DownloadFileConfigSchema.parse({
        boardId: "b-1",
        itemId: "i-1",
        columnId: "__item_files__",
        fileId: "a-1",
      }),
    ).not.toThrow();
  });

  it("risk: medium (data export)", () => {
    expect(mondayDownloadFileMeta.riskLevel).toBe("medium");
    expect(mondayDownloadFileMeta.isDestructive).toBe(false);
  });
});
