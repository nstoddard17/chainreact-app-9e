/**
 * @jest-environment node
 *
 * Slice 3.DROPBOX-5 builder-shape test — Dropbox `new_file` trigger config
 * as it flows into the WorkflowBuilder. Pins the folder picker wiring +
 * runtime-schema parity of the persisted config (including the
 * activation-merged snapshot).
 */
import { dropboxNewFileTriggerMeta } from "@/integrations/dropbox/triggers/newFile/newFile.meta";
import { DropboxNewFileConfigSchema } from "@/integrations/dropbox/triggers/newFile/schema";

describe("dropbox new_file trigger meta — Builder shape", () => {
  it("is a webhook trigger requiring the Dropbox integration", () => {
    expect(dropboxNewFileTriggerMeta.activation).toBe("webhook");
    expect(dropboxNewFileTriggerMeta.requiresIntegration).toBe(true);
    expect(dropboxNewFileTriggerMeta.key).toBe("dropbox:new_file");
    expect(dropboxNewFileTriggerMeta.category).toBe("files");
  });

  it("exposes a folder picker wired to dropbox:folders (no deps, optional → root)", () => {
    const path = dropboxNewFileTriggerMeta.fields.find((f) => f.name === "path")!;
    expect(path.type).toBe("combobox");
    expect(path.optionsSource).toBe("dropbox:folders");
    expect(path.dependsOn).toBeUndefined();
    expect(path.required).toBe(false);
  });

  it("persisted config (path + recursive) parses against the runtime schema", () => {
    expect(() =>
      DropboxNewFileConfigSchema.parse({ path: "/Reports", recursive: true }),
    ).not.toThrow();
  });

  it("root config (empty path) is valid", () => {
    const parsed = DropboxNewFileConfigSchema.parse({});
    expect(parsed.path).toBe("");
    expect(parsed.recursive).toBe(false);
  });

  it("rejects a non-root path that doesn't start with '/'", () => {
    expect(() => DropboxNewFileConfigSchema.parse({ path: "Reports" })).toThrow();
  });

  it("post-activation merged config (snapshot cursor/accountId) still parses", () => {
    const merged = {
      path: "/Reports",
      recursive: false,
      snapshot: {
        cursor: "CURSOR_SEED",
        accountId: "dbid:abc",
        capturedAt: "2026-05-24T00:00:00Z",
      },
    };
    expect(() => DropboxNewFileConfigSchema.parse(merged)).not.toThrow();
  });

  it("emits the canonical payload including the sensitive name/path/pathLower", () => {
    const names = dropboxNewFileTriggerMeta.payloadShape.map((o) => o.name);
    expect(names).toEqual([
      "changeKind",
      "id",
      "name",
      "path",
      "pathLower",
      "rev",
      "sizeBytes",
      "clientModified",
      "serverModified",
      "accountId",
      "isDownloadable",
    ]);
    const byName = new Map(
      dropboxNewFileTriggerMeta.payloadShape.map((p) => [p.name, p]),
    );
    expect(byName.get("name")!.sensitive).toBe(true);
    expect(byName.get("path")!.sensitive).toBe(true);
    expect(byName.get("pathLower")!.sensitive).toBe(true);
    expect(byName.get("accountId")!.sensitive).not.toBe(true);
  });
});
