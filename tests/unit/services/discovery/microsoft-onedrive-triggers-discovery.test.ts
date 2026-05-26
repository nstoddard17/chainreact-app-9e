/**
 * @jest-environment node
 *
 * Slice 4.ONEDRIVE-META-3 — Microsoft OneDrive trigger discovery coverage.
 *
 * Pins the single `file_changed` whole-drive webhook trigger: key, webhook
 * activation, EMPTY fields (no per-trigger config), and the sensitive
 * downloadUrl payload field. The activation-registry side is pinned by
 * tests/structure/trigger-meta-activation-invariant.test.ts.
 */
import {
  getTriggerMeta,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

describe("microsoft-onedrive trigger discovery — file_changed", () => {
  it("registers exactly 1 trigger meta (file_changed)", () => {
    const metas = listTriggerMetasForProvider("microsoft-onedrive");
    expect(metas.map((m) => m.key)).toEqual(["microsoft-onedrive:file_changed"]);
  });

  it("is a webhook trigger requiring an integration, category files", () => {
    const t = getTriggerMeta("microsoft-onedrive:file_changed")!;
    expect(t.provider).toBe("microsoft-onedrive");
    expect(t.key).toBe("microsoft-onedrive:file_changed");
    expect(t.activation).toBe("webhook");
    expect(t.requiresIntegration).toBe(true);
    expect(t.category).toBe("files");
  });

  it("has NO config fields (whole-drive watch)", () => {
    const t = getTriggerMeta("microsoft-onedrive:file_changed")!;
    expect(t.fields).toEqual([]);
  });

  it("downloadUrl payload field is sensitive; ids / kind / dates are not", () => {
    const t = getTriggerMeta("microsoft-onedrive:file_changed")!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    expect(byName.get("downloadUrl")!.sensitive).toBe(true);
    for (const name of [
      "itemId",
      "kind",
      "changeType",
      "source",
      "name",
      "webUrl",
      "lastModifiedDateTime",
      "deleted",
    ]) {
      expect(byName.get(name)!.sensitive).not.toBe(true);
    }
  });

  it("payload includes the documented shape", () => {
    const t = getTriggerMeta("microsoft-onedrive:file_changed")!;
    const names = t.payloadShape.map((p) => p.name);
    for (const expected of [
      "itemId",
      "kind",
      "changeType",
      "source",
      "name",
      "size",
      "mimeType",
      "parentReference",
      "webUrl",
      "downloadUrl",
      "createdDateTime",
      "lastModifiedDateTime",
      "deleted",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("no secret-shaped payload names", () => {
    const BANNED = ["token", "accessToken", "refreshToken", "apiKey", "secret", "webhookSecret", "password"];
    const t = getTriggerMeta("microsoft-onedrive:file_changed")!;
    const names = t.payloadShape.map((p) => p.name);
    for (const b of BANNED) expect(names).not.toContain(b);
  });
});
