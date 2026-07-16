/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-4 — Google Docs discovery registry assertions.
 *
 * Pins:
 *   - 5 Google Docs action metas registered (no more, no less).
 *   - 0 trigger metas — triggers ship in GDOCS-5.
 *   - No duplicate keys.
 *   - Per-meta field-name preservation (camelCase, mirrors runtime
 *     schemas verbatim).
 *   - Per-meta resolver wiring matches Slice 3.GDOCS-3 resolver keys
 *     (`google-docs:documents`, `google-drive:folders`).
 *   - Per-meta sensitive-output flags match the GDOCS-1 audit + slice
 *     spec.
 *   - Risk + destructive-trio classification matches the slice spec
 *     (share_document is high + destructive trio; others medium / low).
 *   - Q11 — share_document's `sendNotification` field is required with
 *     no default.
 *   - export_document declares `producesFileRef: true` for the
 *     variable picker.
 *   - No secret-shaped output names anywhere.
 */
import {
  getActionMeta,
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

describe("Google Docs action metas — registration", () => {
  const EXPECTED_KEYS = [
    "google-docs:create_document",
    "google-docs:update_document",
    "google-docs:share_document",
    "google-docs:get_document",
    "google-docs:export_document",
  ];

  it("registers exactly 5 Google Docs action metas", () => {
    const metas = listActionMetasForProvider("google-docs");
    expect(metas).toHaveLength(5);
  });

  it.each(EXPECTED_KEYS)("registers %s", (key) => {
    expect(getActionMeta(key)).toBeDefined();
  });

  it("registers exactly 2 Google Docs trigger metas (GDOCS-5 — new_document + document_updated)", () => {
    const triggers = listTriggerMetasForProvider("google-docs");
    expect(triggers).toHaveLength(2);
    // Sorted by displayOrder (10 / 20).
    expect(triggers.map((t) => t.key)).toEqual([
      "google-docs:new_document",
      "google-docs:document_updated",
    ]);
    expect(triggers.every((t) => t.activation === "webhook")).toBe(true);
    expect(triggers.every((t) => t.requiresIntegration)).toBe(true);
  });

  it("sorts Google Docs actions by displayOrder (10..50)", () => {
    const metas = listActionMetasForProvider("google-docs");
    expect(metas.map((m) => m.key)).toEqual(EXPECTED_KEYS);
    const orders = metas.map((m) => m.displayOrder);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]).toBeGreaterThan(orders[i - 1]!);
    }
  });

  it("all 5 actions are category=files + requiresIntegration=true", () => {
    const metas = listActionMetasForProvider("google-docs");
    expect(metas.every((m) => m.category === "files")).toBe(true);
    expect(metas.every((m) => m.requiresIntegration === true)).toBe(true);
  });
});

describe("Google Docs create_document meta", () => {
  const meta = getActionMeta("google-docs:create_document")!;

  it("preserves runtime field names verbatim: title / content / folderId", () => {
    expect(meta.fields.map((f) => f.name)).toEqual([
      "title",
      "content",
      "folderId",
    ]);
  });

  it("title is text + required", () => {
    const field = meta.fields.find((f) => f.name === "title")!;
    expect(field.type).toBe("text");
    expect(field.required).toBe(true);
  });

  it("content is textarea + optional", () => {
    const field = meta.fields.find((f) => f.name === "content")!;
    expect(field.type).toBe("textarea");
    expect(field.required).toBe(false);
  });

  it("folderId wires google-drive:folders (cross-product) with no deps", () => {
    const field = meta.fields.find((f) => f.name === "folderId")!;
    expect(field.type).toBe("combobox");
    expect(field.optionsSource).toBe("google-drive:folders");
    expect(field.dependsOn).toBeUndefined();
    expect(field.required).toBe(false);
  });

  it("risk: medium, not destructive, no confirmation", () => {
    expect(meta.riskLevel).toBe("medium");
    expect(meta.isDestructive).toBe(false);
    expect(meta.requiresConfirmation).toBe(false);
    expect(meta.riskDescription).toBeDefined();
  });

  it("description notes file-upload deferral", () => {
    expect(meta.description).toMatch(/file-upload.*deferred/i);
  });

  it("documentUrl + title marked sensitive; documentId / folderId / createdAt NOT sensitive", () => {
    const out = new Map(meta.outputs.map((o) => [o.name, o]));
    expect(out.get("documentUrl")?.sensitive).toBe(true);
    expect(out.get("title")?.sensitive).toBe(true);
    expect(out.get("documentId")?.sensitive).toBeUndefined();
    expect(out.get("folderId")?.sensitive).toBeUndefined();
    expect(out.get("createdAt")?.sensitive).toBeUndefined();
  });
});

describe("Google Docs update_document meta", () => {
  const meta = getActionMeta("google-docs:update_document")!;

  it("preserves runtime field names verbatim: documentId / content / insertLocation / searchText", () => {
    expect(meta.fields.map((f) => f.name)).toEqual([
      "documentId",
      "content",
      "insertLocation",
      "searchText",
    ]);
  });

  it("documentId wires google-docs:documents with no deps", () => {
    const field = meta.fields.find((f) => f.name === "documentId")!;
    expect(field.type).toBe("combobox");
    expect(field.optionsSource).toBe("google-docs:documents");
    expect(field.dependsOn).toBeUndefined();
    expect(field.required).toBe(true);
  });

  it("insertLocation is select + required + NO defaultValue (Q11 honest-state)", () => {
    const field = meta.fields.find((f) => f.name === "insertLocation")!;
    expect(field.type).toBe("select");
    expect(field.required).toBe(true);
    expect(field.defaultValue).toBeUndefined();
    expect(field.options?.map((o) => o.value).sort()).toEqual([
      "after_text",
      "before_text",
      "beginning",
      "end",
      "replace",
    ]);
  });

  it("searchText is required-when-visible text gated on after_text/before_text (CONFIG-UX sweep — mirrors the schema's superRefine)", () => {
    const field = meta.fields.find((f) => f.name === "searchText")!;
    expect(field.type).toBe("text");
    expect(field.required).toBe(true);
    expect(field.visibleWhen).toEqual({
      field: "insertLocation",
      valueIn: ["after_text", "before_text"],
    });
  });

  it("risk: medium, not destructive, no confirmation (D-GD4)", () => {
    expect(meta.riskLevel).toBe("medium");
    expect(meta.isDestructive).toBe(false);
    expect(meta.requiresConfirmation).toBe(false);
  });

  it("description warns about replace mode wiping body + Version-history recovery", () => {
    expect(meta.description).toMatch(/replace.*wipes/i);
    expect(meta.description).toMatch(/version history/i);
  });

  it("description mentions wildcard `*` semantics", () => {
    expect(meta.description).toMatch(/wildcard/i);
  });

  it("documentUrl + title marked sensitive; documentId / revisionId / contentLength / updatedAt / insertionLocation NOT sensitive", () => {
    const out = new Map(meta.outputs.map((o) => [o.name, o]));
    expect(out.get("documentUrl")?.sensitive).toBe(true);
    expect(out.get("title")?.sensitive).toBe(true);
    expect(out.get("documentId")?.sensitive).toBeUndefined();
    expect(out.get("revisionId")?.sensitive).toBeUndefined();
    expect(out.get("contentLength")?.sensitive).toBeUndefined();
    expect(out.get("updatedAt")?.sensitive).toBeUndefined();
    expect(out.get("insertionLocation")?.sensitive).toBeUndefined();
  });
});

describe("Google Docs share_document meta — destructive trio + Q11", () => {
  const meta = getActionMeta("google-docs:share_document")!;

  it("preserves runtime field names verbatim (8 fields)", () => {
    expect(meta.fields.map((f) => f.name)).toEqual([
      "documentId",
      "shareWith",
      "permission",
      "sendNotification",
      "message",
      "makePublic",
      "publicPermission",
      "allowDiscovery",
      "transferOwnership",
    ]);
  });

  it("isDestructive: true + requiresConfirmation: true + riskLevel: high", () => {
    expect(meta.isDestructive).toBe(true);
    expect(meta.requiresConfirmation).toBe(true);
    expect(meta.riskLevel).toBe("high");
  });

  it("riskDescription mentions public sharing + ownership transfer", () => {
    expect(meta.riskDescription).toMatch(/public sharing/i);
    expect(meta.riskDescription).toMatch(/ownership transfer/i);
  });

  it("Q11 — sendNotification is boolean + required + NO defaultValue", () => {
    const field = meta.fields.find((f) => f.name === "sendNotification")!;
    expect(field.type).toBe("boolean");
    expect(field.required).toBe(true);
    expect(field.defaultValue).toBeUndefined();
  });

  it("description calls out Q11 sendNotification semantics", () => {
    expect(meta.description).toMatch(/sendnotification.*required/i);
  });

  it("documentId wires google-docs:documents", () => {
    const field = meta.fields.find((f) => f.name === "documentId")!;
    expect(field.optionsSource).toBe("google-docs:documents");
    expect(field.required).toBe(true);
  });

  it("shareWith is string-array (no autocomplete — deferred)", () => {
    const field = meta.fields.find((f) => f.name === "shareWith")!;
    expect(field.type).toBe("string-array");
    expect(field.optionsSource).toBeUndefined();
  });

  it("permission + publicPermission enums use Drive canonical names (reader / commenter / writer / owner)", () => {
    const perm = meta.fields.find((f) => f.name === "permission")!;
    expect(perm.type).toBe("select");
    expect(perm.options?.map((o) => o.value).sort()).toEqual([
      "commenter",
      "owner",
      "reader",
      "writer",
    ]);
    const pubPerm = meta.fields.find((f) => f.name === "publicPermission")!;
    expect(pubPerm.options?.map((o) => o.value).sort()).toEqual([
      "commenter",
      "owner",
      "reader",
      "writer",
    ]);
  });

  it("makePublic / allowDiscovery / transferOwnership are boolean + optional", () => {
    for (const name of [
      "makePublic",
      "allowDiscovery",
      "transferOwnership",
    ]) {
      const field = meta.fields.find((f) => f.name === name)!;
      expect(field.type).toBe("boolean");
      expect(field.required).toBe(false);
    }
  });

  it("sharedWith + documentUrl marked sensitive; isPublic / permissionIds / errors / documentId NOT sensitive", () => {
    const out = new Map(meta.outputs.map((o) => [o.name, o]));
    expect(out.get("sharedWith")?.sensitive).toBe(true);
    expect(out.get("documentUrl")?.sensitive).toBe(true);
    expect(out.get("isPublic")?.sensitive).toBeUndefined();
    expect(out.get("permissionIds")?.sensitive).toBeUndefined();
    expect(out.get("errors")?.sensitive).toBeUndefined();
    expect(out.get("documentId")?.sensitive).toBeUndefined();
  });
});

describe("Google Docs get_document meta — pure read", () => {
  const meta = getActionMeta("google-docs:get_document")!;

  it("preserves runtime field name verbatim: documentId", () => {
    expect(meta.fields.map((f) => f.name)).toEqual(["documentId"]);
  });

  it("documentId wires google-docs:documents + required", () => {
    const field = meta.fields.find((f) => f.name === "documentId")!;
    expect(field.optionsSource).toBe("google-docs:documents");
    expect(field.required).toBe(true);
  });

  it("risk: low, not destructive, no confirmation", () => {
    expect(meta.riskLevel).toBe("low");
    expect(meta.isDestructive).toBe(false);
    expect(meta.requiresConfirmation).toBe(false);
  });

  it("content + title + documentUrl marked sensitive; documentId + revisionId NOT sensitive", () => {
    const out = new Map(meta.outputs.map((o) => [o.name, o]));
    expect(out.get("content")?.sensitive).toBe(true);
    expect(out.get("title")?.sensitive).toBe(true);
    expect(out.get("documentUrl")?.sensitive).toBe(true);
    expect(out.get("documentId")?.sensitive).toBeUndefined();
    expect(out.get("revisionId")?.sensitive).toBeUndefined();
  });
});

describe("Google Docs export_document meta — FileRef-producing", () => {
  const meta = getActionMeta("google-docs:export_document")!;

  it("preserves runtime field names verbatim: documentId / exportFormat / fileName", () => {
    expect(meta.fields.map((f) => f.name)).toEqual([
      "documentId",
      "exportFormat",
      "fileName",
    ]);
  });

  it("does NOT declare a folder/destination field (V1 destinations rejected per D-GD3)", () => {
    expect(meta.fields.find((f) => f.name === "folderId")).toBeUndefined();
    expect(meta.fields.find((f) => f.name === "driveFolder")).toBeUndefined();
    expect(meta.fields.find((f) => f.name === "destination")).toBeUndefined();
  });

  it("exportFormat enum is the V1 7-value set", () => {
    const field = meta.fields.find((f) => f.name === "exportFormat")!;
    expect(field.type).toBe("select");
    expect(field.required).toBe(true);
    expect(field.options?.map((o) => o.value).sort()).toEqual([
      "docx",
      "epub",
      "html",
      "odt",
      "pdf",
      "rtf",
      "txt",
    ]);
  });

  it("fileName is optional text", () => {
    const field = meta.fields.find((f) => f.name === "fileName")!;
    expect(field.type).toBe("text");
    expect(field.required).toBe(false);
  });

  it("producesFileRef: true so the variable picker renders a file icon", () => {
    expect(meta.producesFileRef).toBe(true);
    expect(meta.consumesFileRef).toBe(false);
  });

  it("the `file` output is fileRef-typed", () => {
    const out = meta.outputs.find((o) => o.name === "file")!;
    expect(out.type).toBe("fileRef");
  });

  it("risk: low, not destructive (export = read + file-generation)", () => {
    expect(meta.riskLevel).toBe("low");
    expect(meta.isDestructive).toBe(false);
    expect(meta.requiresConfirmation).toBe(false);
  });

  it("description mentions Drive's 10MB export cap", () => {
    expect(meta.description).toMatch(/10mb/i);
  });

  it("description mentions destination rejection (compose via downstream actions)", () => {
    expect(meta.description).toMatch(
      /destination|compose|downstream/i,
    );
  });

  it("fileName marked sensitive; fileSize / format / mimeType / fileId NOT sensitive", () => {
    const out = new Map(meta.outputs.map((o) => [o.name, o]));
    expect(out.get("fileName")?.sensitive).toBe(true);
    expect(out.get("fileSize")?.sensitive).toBeUndefined();
    expect(out.get("format")?.sensitive).toBeUndefined();
    expect(out.get("mimeType")?.sensitive).toBeUndefined();
    expect(out.get("fileId")?.sensitive).toBeUndefined();
  });
});

describe("Google Docs meta secret-shape guards (defense-in-depth)", () => {
  it("no meta output uses a secret-shaped name (token / secret / api_key / etc.)", () => {
    const FORBIDDEN = new Set([
      "token",
      "secret",
      "clientSecret",
      "client_secret",
      "apiKey",
      "accessToken",
      "refreshToken",
      "webhookSecret",
    ]);
    const metas = listActionMetasForProvider("google-docs");
    for (const meta of metas) {
      for (const out of meta.outputs) {
        expect(FORBIDDEN.has(out.name)).toBe(false);
      }
    }
  });

  it("no meta field has both `options` and `optionsSource` (contract guard, defensive)", () => {
    const metas = listActionMetasForProvider("google-docs");
    for (const meta of metas) {
      for (const f of meta.fields) {
        if (f.options && f.optionsSource) {
          throw new Error(
            `${meta.key}.${f.name} declares both options and optionsSource`,
          );
        }
      }
    }
  });
});
