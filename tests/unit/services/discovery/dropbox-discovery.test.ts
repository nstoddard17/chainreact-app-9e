/**
 * @jest-environment node
 *
 * Slice 3.DROPBOX-4 — Dropbox discovery-registry coverage.
 *
 * Pins the full 11-action Dropbox surface: all keys registered + sorted by
 * displayOrder, key===provider:type, camelCase field/output names, no
 * secret-shaped outputs, resolver wiring (dropbox:folders / dropbox:files
 * folderPath cascade), UI-scope folderPath on the file-targeting actions,
 * risk classifications, sensitive-output markings, and FileRef flags. No
 * Dropbox trigger metas (staged for DROPBOX-5).
 */
import {
  getActionMeta,
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

const EXPECTED_KEYS_IN_ORDER = [
  "dropbox:upload_file",
  "dropbox:download_file",
  "dropbox:list_folder",
  "dropbox:search_files",
  "dropbox:get_file_metadata",
  "dropbox:create_folder",
  "dropbox:move_file",
  "dropbox:copy_file",
  "dropbox:create_shared_link",
  "dropbox:get_temporary_link",
  "dropbox:delete_file",
];

// Actions whose `path`/`fromPath` file picker cascades from an optional
// UI-scope `folderPath` folder picker (dropbox:files dependsOn folderPath).
const FILE_CASCADE_ACTIONS = [
  "dropbox:download_file",
  "dropbox:get_file_metadata",
  "dropbox:create_shared_link",
  "dropbox:get_temporary_link",
  "dropbox:delete_file",
];

describe("dropbox discovery — surface", () => {
  it("registers exactly 11 action metas in displayOrder", () => {
    const metas = listActionMetasForProvider("dropbox");
    expect(metas).toHaveLength(11);
    expect(metas.map((m) => m.key)).toEqual(EXPECTED_KEYS_IN_ORDER);
  });

  it("registers NO Dropbox trigger metas yet (staged for DROPBOX-5)", () => {
    expect(listTriggerMetasForProvider("dropbox")).toEqual([]);
  });

  it("every key equals provider:type and provider is 'dropbox'", () => {
    for (const m of listActionMetasForProvider("dropbox")) {
      expect(m.provider).toBe("dropbox");
      expect(m.key).toBe(`dropbox:${m.type}`);
    }
  });

  it("every action is category 'files' + requiresIntegration", () => {
    for (const m of listActionMetasForProvider("dropbox")) {
      expect(m.category).toBe("files");
      expect(m.requiresIntegration).toBe(true);
    }
  });

  it("displayOrder is strictly ascending (10..110)", () => {
    const orders = listActionMetasForProvider("dropbox").map((m) => m.displayOrder);
    expect(orders[0]).toBe(10);
    expect(orders[orders.length - 1]).toBe(110);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]!).toBeGreaterThan(orders[i - 1]!);
    }
  });
});

describe("dropbox discovery — field + output hygiene", () => {
  it("all field names are camelCase", () => {
    for (const m of listActionMetasForProvider("dropbox")) {
      for (const f of m.fields) {
        expect(f.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });

  it("all output names are camelCase", () => {
    for (const m of listActionMetasForProvider("dropbox")) {
      for (const o of m.outputs) {
        expect(o.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });

  it("no secret-shaped output names anywhere", () => {
    const BANNED = [
      "token",
      "accessToken",
      "refreshToken",
      "apiKey",
      "clientSecret",
      "secret",
      "webhookSecret",
      "bytes",
      "base64",
    ];
    for (const m of listActionMetasForProvider("dropbox")) {
      const names = m.outputs.map((o) => o.name);
      for (const banned of BANNED) expect(names).not.toContain(banned);
    }
  });
});

describe("dropbox discovery — resolver wiring (folders + file cascade)", () => {
  it("folder-selecting fields use dropbox:folders with no dep", () => {
    // upload destination, list_folder, search_files scope.
    const cases: Array<[string, string]> = [
      ["dropbox:upload_file", "path"],
      ["dropbox:list_folder", "path"],
      ["dropbox:search_files", "path"],
    ];
    for (const [key, fieldName] of cases) {
      const f = getActionMeta(key)!.fields.find((x) => x.name === fieldName)!;
      expect(f.optionsSource).toBe("dropbox:folders");
      expect(f.dependsOn).toBeUndefined();
    }
  });

  it("file-targeting actions: path → dropbox:files dependsOn folderPath; folderPath → dropbox:folders (no dep)", () => {
    for (const key of FILE_CASCADE_ACTIONS) {
      const m = getActionMeta(key)!;
      const folder = m.fields.find((f) => f.name === "folderPath")!;
      const file = m.fields.find((f) => f.name === "path")!;
      expect(folder.optionsSource).toBe("dropbox:folders");
      expect(folder.dependsOn).toBeUndefined();
      expect(folder.required).toBe(false);
      expect(file.optionsSource).toBe("dropbox:files");
      expect(file.dependsOn).toBe("folderPath");
      expect(file.required).toBe(true);
    }
  });

  it("move_file / copy_file: fromPath → dropbox:files dependsOn folderPath; toPath is free text", () => {
    for (const key of ["dropbox:move_file", "dropbox:copy_file"]) {
      const m = getActionMeta(key)!;
      const folder = m.fields.find((f) => f.name === "folderPath")!;
      const from = m.fields.find((f) => f.name === "fromPath")!;
      const to = m.fields.find((f) => f.name === "toPath")!;
      expect(folder.optionsSource).toBe("dropbox:folders");
      expect(from.optionsSource).toBe("dropbox:files");
      expect(from.dependsOn).toBe("folderPath");
      expect(to.type).toBe("text");
      expect(to.optionsSource).toBeUndefined();
    }
  });

  it("create_folder.path stays a plain text field (new folder being named — no picker)", () => {
    const f = getActionMeta("dropbox:create_folder")!.fields.find(
      (x) => x.name === "path",
    )!;
    expect(f.type).toBe("text");
    expect(f.optionsSource).toBeUndefined();
  });
});

describe("dropbox discovery — risk classifications", () => {
  it("delete_file is high + destructive + requiresConfirmation (structural-only output)", () => {
    const m = getActionMeta("dropbox:delete_file")!;
    expect(m.riskLevel).toBe("high");
    expect(m.isDestructive).toBe(true);
    expect(m.requiresConfirmation).toBe(true);
    expect(m.riskDescription).toBeDefined();
    expect(m.outputs.map((o) => o.name).sort()).toEqual([
      "deletedAt",
      "path",
      "success",
    ]);
  });

  it("all writes are medium; pure reads are low", () => {
    const medium = [
      "dropbox:upload_file",
      "dropbox:create_folder",
      "dropbox:move_file",
      "dropbox:copy_file",
      "dropbox:create_shared_link",
      "dropbox:get_temporary_link",
      "dropbox:download_file",
    ];
    for (const k of medium) expect(getActionMeta(k)!.riskLevel).toBe("medium");
    const low = [
      "dropbox:list_folder",
      "dropbox:search_files",
      "dropbox:get_file_metadata",
    ];
    for (const k of low) expect(getActionMeta(k)!.riskLevel).toBe("low");
  });

  it("no non-delete action sets isDestructive/requiresConfirmation", () => {
    for (const m of listActionMetasForProvider("dropbox")) {
      if (m.key === "dropbox:delete_file") continue;
      expect(m.isDestructive).toBe(false);
      expect(m.requiresConfirmation).toBe(false);
    }
  });
});

describe("dropbox discovery — sensitive outputs", () => {
  it("file/folder name + path outputs are marked sensitive", () => {
    for (const m of listActionMetasForProvider("dropbox")) {
      for (const o of m.outputs) {
        if (o.name === "name" || o.name === "path") {
          expect(o.sensitive).toBe(true);
        }
      }
    }
  });

  it("shared link URL + FileRef + bulk arrays are sensitive", () => {
    expect(
      getActionMeta("dropbox:create_shared_link")!.outputs.find(
        (o) => o.name === "sharedUrl",
      )!.sensitive,
    ).toBe(true);
    expect(
      getActionMeta("dropbox:download_file")!.outputs.find((o) => o.name === "file")!
        .sensitive,
    ).toBe(true);
    expect(
      getActionMeta("dropbox:get_temporary_link")!.outputs.find(
        (o) => o.name === "file",
      )!.sensitive,
    ).toBe(true);
    expect(
      getActionMeta("dropbox:list_folder")!.outputs.find((o) => o.name === "entries")!
        .sensitive,
    ).toBe(true);
    expect(
      getActionMeta("dropbox:search_files")!.outputs.find((o) => o.name === "matches")!
        .sensitive,
    ).toBe(true);
  });

  it("opaque ids / rev / size / timestamps / counts are NOT sensitive", () => {
    const NON_SENSITIVE = new Set([
      "id",
      "rev",
      "sizeBytes",
      "clientModified",
      "serverModified",
      "contentHash",
      "isFolder",
      "count",
      "cursor",
      "hasMore",
      "linkExisted",
      "success",
      "deletedAt",
    ]);
    for (const m of listActionMetasForProvider("dropbox")) {
      for (const o of m.outputs) {
        if (NON_SENSITIVE.has(o.name)) {
          expect(o.sensitive).not.toBe(true);
        }
      }
    }
  });
});

describe("dropbox discovery — FileRef flags", () => {
  it("upload_file consumes a FileRef (file field type 'file')", () => {
    const m = getActionMeta("dropbox:upload_file")!;
    expect(m.consumesFileRef).toBe(true);
    expect(m.producesFileRef).toBe(false);
    expect(m.fields.find((f) => f.name === "file")!.type).toBe("file");
  });

  it("download_file + get_temporary_link produce a FileRef (fileRef output)", () => {
    for (const key of ["dropbox:download_file", "dropbox:get_temporary_link"]) {
      const m = getActionMeta(key)!;
      expect(m.producesFileRef).toBe(true);
      expect(m.consumesFileRef).toBe(false);
      expect(m.outputs.find((o) => o.name === "file")!.type).toBe("fileRef");
    }
  });

  it("no other Dropbox action declares FileRef flags", () => {
    const fileRefKeys = new Set([
      "dropbox:upload_file",
      "dropbox:download_file",
      "dropbox:get_temporary_link",
    ]);
    for (const m of listActionMetasForProvider("dropbox")) {
      if (fileRefKeys.has(m.key)) continue;
      expect(m.producesFileRef).toBe(false);
      expect(m.consumesFileRef).toBe(false);
    }
  });
});
