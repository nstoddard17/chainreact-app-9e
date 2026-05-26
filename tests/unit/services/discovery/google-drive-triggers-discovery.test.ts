/**
 * @jest-environment node
 *
 * Slice 4.GDRIVE-META-2 — Google Drive trigger discovery coverage.
 *
 * Pins the single `file_changed` watch-based webhook trigger: key, webhook
 * activation, the two folder-shaped config fields (fileId WATCH TARGET +
 * folderId POST-FETCH FILTER, both wired to the existing
 * `google-drive:folders` resolver with distinct help text), the 10-field
 * payload, and the deliberate v1 sensitivity decision (no payload field
 * marked sensitive — name treated as title-like, mirroring Teams `subject`
 * / GCal `summary`). The activation-registry side is pinned by
 * tests/structure/trigger-meta-activation-invariant.test.ts.
 */
import {
  getTriggerMeta,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

describe("google-drive trigger discovery — file_changed", () => {
  it("registers exactly 1 trigger meta (file_changed)", () => {
    const metas = listTriggerMetasForProvider("google-drive");
    expect(metas.map((m) => m.key)).toEqual(["google-drive:file_changed"]);
  });

  it("is a webhook trigger requiring an integration, category files", () => {
    const t = getTriggerMeta("google-drive:file_changed")!;
    expect(t.provider).toBe("google-drive");
    expect(t.key).toBe("google-drive:file_changed");
    expect(t.activation).toBe("webhook");
    expect(t.requiresIntegration).toBe(true);
    expect(t.category).toBe("files");
  });

  it("exposes exactly TWO folder-shaped fields (fileId watch target + folderId post-fetch filter), both wired to google-drive:folders", () => {
    const t = getTriggerMeta("google-drive:file_changed")!;
    expect(t.fields.map((f) => f.name)).toEqual(["fileId", "folderId"]);

    const fileId = t.fields.find((f) => f.name === "fileId")!;
    expect(fileId.type).toBe("combobox");
    expect(fileId.optionsSource).toBe("google-drive:folders");
    expect(fileId.defaultValue).toBe("root");
    expect(fileId.required).toBe(false);

    const folderId = t.fields.find((f) => f.name === "folderId")!;
    expect(folderId.type).toBe("combobox");
    expect(folderId.optionsSource).toBe("google-drive:folders");
    expect(folderId.required).toBe(false);
    // The two fields must carry DISTINCT descriptions — they have different
    // runtime meanings (watch target vs post-fetch filter).
    expect(fileId.description).not.toEqual(folderId.description);
  });

  it("payload includes the documented 10-field shape", () => {
    const t = getTriggerMeta("google-drive:file_changed")!;
    const names = t.payloadShape.map((p) => p.name);
    for (const expected of [
      "changeKind",
      "objectKind",
      "fileId",
      "name",
      "mimeType",
      "parents",
      "webViewLink",
      "modifiedTime",
      "trashed",
      "removed",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("no payload field is marked sensitive in v1 (Marcus decision — file name treated as title-like)", () => {
    const t = getTriggerMeta("google-drive:file_changed")!;
    for (const p of t.payloadShape) {
      expect(p.sensitive).not.toBe(true);
    }
  });

  it("no trigger field references the deferred/rejected Drive resolvers", () => {
    const t = getTriggerMeta("google-drive:file_changed")!;
    for (const f of t.fields) {
      for (const resolver of [
        "google-drive:files",
        "google-drive:items",
        "google-drive:shared_drives",
      ]) {
        expect(f.optionsSource).not.toBe(resolver);
      }
    }
  });

  it("no secret-shaped payload names", () => {
    const BANNED = [
      "token",
      "accessToken",
      "refreshToken",
      "apiKey",
      "secret",
      "webhookSecret",
      "password",
      "downloadUrl",
    ];
    const t = getTriggerMeta("google-drive:file_changed")!;
    const names = t.payloadShape.map((p) => p.name);
    for (const b of BANNED) expect(names).not.toContain(b);
  });
});
