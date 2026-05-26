/**
 * @jest-environment node
 *
 * Slice 4.GDRIVE-META-2 — Google Drive discovery-registry coverage.
 *
 * Pins the full 5-action Drive surface: keys in displayOrder,
 * key===provider:type, category 'files', camelCase fields, folder pickers
 * wired to the REUSED `google-drive:folders` resolver (no new resolver
 * work), fileId fields typeable text (no `google-drive:files` reference),
 * the delete_file destructive trio (both modes), FileRef deferral
 * (producesFileRef/consumesFileRef false on all 5), and the deliberate
 * `list_files.files` sensitive mark. Rejected/deferred resolvers must stay
 * unreferenced. Trigger assertions live in
 * google-drive-triggers-discovery.test.ts.
 */
import {
  getActionMeta,
  listActionMetasForProvider,
  listProvidersWithMetadata,
} from "@/services/discovery/_registry";

const EXPECTED_KEYS_IN_ORDER = [
  "google-drive:upload_file",
  "google-drive:create_folder",
  "google-drive:list_files",
  "google-drive:move_file",
  "google-drive:delete_file",
];

/** Actions whose fileId is typeable text (no resolver). */
const FILE_ID_ACTIONS = [
  "google-drive:move_file",
  "google-drive:delete_file",
];

const DEFERRED_RESOLVERS = [
  "google-drive:files",
  "google-drive:items",
  "google-drive:shared_drives",
];

describe("google-drive discovery — surface", () => {
  it("registers exactly 5 action metas in displayOrder", () => {
    const metas = listActionMetasForProvider("google-drive");
    expect(metas).toHaveLength(5);
    expect(metas.map((m) => m.key)).toEqual(EXPECTED_KEYS_IN_ORDER);
  });

  it("every key equals provider:type and provider is 'google-drive'", () => {
    for (const m of listActionMetasForProvider("google-drive")) {
      expect(m.provider).toBe("google-drive");
      expect(m.key).toBe(`google-drive:${m.type}`);
    }
  });

  it("every action is category 'files' + requiresIntegration; FileRef deferred (consumes/producesFileRef both false)", () => {
    for (const m of listActionMetasForProvider("google-drive")) {
      expect(m.category).toBe("files");
      expect(m.requiresIntegration).toBe(true);
      expect(m.producesFileRef).toBe(false);
      expect(m.consumesFileRef).toBe(false);
    }
  });

  it("displayOrder is strictly ascending (10..50)", () => {
    const orders = listActionMetasForProvider("google-drive").map((m) => m.displayOrder);
    expect(orders[0]).toBe(10);
    expect(orders[orders.length - 1]).toBe(50);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]!).toBeGreaterThan(orders[i - 1]!);
    }
  });

  it("google-drive is reported by listProvidersWithMetadata", () => {
    expect(listProvidersWithMetadata()).toContain("google-drive");
  });
});

describe("google-drive discovery — field hygiene + resolver wiring", () => {
  it("all field names are camelCase (mirror the runtime Zod schemas)", () => {
    for (const m of listActionMetasForProvider("google-drive")) {
      for (const f of m.fields) {
        expect(f.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });

  it("parentFolderId wires to google-drive:folders (no dep) on upload + create", () => {
    for (const key of ["google-drive:upload_file", "google-drive:create_folder"]) {
      const f = getActionMeta(key)!.fields.find((x) => x.name === "parentFolderId")!;
      expect(f.type).toBe("combobox");
      expect(f.optionsSource).toBe("google-drive:folders");
      expect(f.dependsOn).toBeUndefined();
      expect(f.required).toBe(false);
    }
  });

  it("list_files.folderId wires to google-drive:folders (no dep, optional)", () => {
    const f = getActionMeta("google-drive:list_files")!.fields.find(
      (x) => x.name === "folderId",
    )!;
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("google-drive:folders");
    expect(f.dependsOn).toBeUndefined();
    expect(f.required).toBe(false);
  });

  it("move_file.newParentFolderId wires to google-drive:folders (no dep, required)", () => {
    const f = getActionMeta("google-drive:move_file")!.fields.find(
      (x) => x.name === "newParentFolderId",
    )!;
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("google-drive:folders");
    expect(f.dependsOn).toBeUndefined();
    expect(f.required).toBe(true);
  });

  it("fileId is typeable text with no resolver on move/delete (required)", () => {
    for (const key of FILE_ID_ACTIONS) {
      const fld = getActionMeta(key)!.fields.find((x) => x.name === "fileId")!;
      expect(fld.type).toBe("text");
      expect(fld.optionsSource).toBeUndefined();
      expect(fld.required).toBe(true);
    }
  });

  it("no field anywhere references the deferred/rejected Drive resolvers", () => {
    for (const m of listActionMetasForProvider("google-drive")) {
      for (const f of m.fields) {
        for (const resolver of DEFERRED_RESOLVERS) {
          expect(f.optionsSource).not.toBe(resolver);
        }
      }
    }
  });

  it("upload_file.content is a textarea string (FileRef deferred — no file field)", () => {
    const content = getActionMeta("google-drive:upload_file")!.fields.find(
      (x) => x.name === "content",
    )!;
    expect(content.type).toBe("textarea");
    expect(content.required).toBe(true);
  });

  it("upload_file.contentEncoding is a static select (utf8/base64, default utf8)", () => {
    const enc = getActionMeta("google-drive:upload_file")!.fields.find(
      (x) => x.name === "contentEncoding",
    )!;
    expect(enc.type).toBe("select");
    expect(enc.defaultValue).toBe("utf8");
    expect(enc.options!.map((o) => o.value)).toEqual(["utf8", "base64"]);
  });

  it("list_files.pageSize is a number bounded 1..1000 (default 100)", () => {
    const ps = getActionMeta("google-drive:list_files")!.fields.find(
      (x) => x.name === "pageSize",
    )!;
    expect(ps.type).toBe("number");
    expect(ps.defaultValue).toBe(100);
    expect(ps.numeric).toEqual({ min: 1, max: 1000, integer: true });
  });

  it("delete_file.permanent is a required Q11 boolean", () => {
    const perm = getActionMeta("google-drive:delete_file")!.fields.find(
      (x) => x.name === "permanent",
    )!;
    expect(perm.type).toBe("boolean");
    expect(perm.required).toBe(true);
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
      "password",
      "downloadUrl",
    ];
    for (const m of listActionMetasForProvider("google-drive")) {
      const names = m.outputs.map((o) => o.name);
      for (const banned of BANNED) expect(names).not.toContain(banned);
    }
  });
});

describe("google-drive discovery — risk (delete destructive both modes; writes medium; read low)", () => {
  it("delete_file is high + destructive + requiresConfirmation (covers BOTH permanent and trash modes)", () => {
    const del = getActionMeta("google-drive:delete_file")!;
    expect(del.riskLevel).toBe("high");
    expect(del.isDestructive).toBe(true);
    expect(del.requiresConfirmation).toBe(true);
    expect(del.riskDescription).toMatch(/permanent/i);
    expect(del.riskDescription).toMatch(/trash/i);
  });

  it("upload/create/move are medium; list is low; none but delete is destructive", () => {
    for (const key of [
      "google-drive:upload_file",
      "google-drive:create_folder",
      "google-drive:move_file",
    ]) {
      expect(getActionMeta(key)!.riskLevel).toBe("medium");
    }
    expect(getActionMeta("google-drive:list_files")!.riskLevel).toBe("low");
    for (const key of [
      "google-drive:upload_file",
      "google-drive:create_folder",
      "google-drive:list_files",
      "google-drive:move_file",
    ]) {
      expect(getActionMeta(key)!.isDestructive).toBe(false);
      expect(getActionMeta(key)!.requiresConfirmation).toBe(false);
    }
  });
});

describe("google-drive discovery — sensitive outputs", () => {
  it("list_files.files bulk read is sensitive (may carry owner emails)", () => {
    const files = getActionMeta("google-drive:list_files")!.outputs.find(
      (o) => o.name === "files",
    )!;
    expect(files.sensitive).toBe(true);
  });

  it("ids / names / mimeType / webViewLink / dates / counts / cursors are NOT marked sensitive", () => {
    const NON_SENSITIVE = new Set([
      "fileId",
      "folderId",
      "name",
      "mimeType",
      "parents",
      "webViewLink",
      "size",
      "createdTime",
      "modifiedTime",
      "nextPageToken",
      "incompleteSearch",
      "previousParents",
      "mode",
      "alreadyDeleted",
      "trashed",
    ]);
    for (const m of listActionMetasForProvider("google-drive")) {
      for (const o of m.outputs) {
        if (NON_SENSITIVE.has(o.name)) expect(o.sensitive).not.toBe(true);
      }
    }
  });
});
