/**
 * @jest-environment node
 *
 * Slice 3.DROPBOX-5 — Dropbox trigger discovery-registry coverage.
 *
 * Pins the single `dropbox:new_file` webhook trigger: registered + keyed,
 * activation=webhook, the folder picker wired to dropbox:folders, camelCase
 * payload names, sensitive markings, and that the actions surface is
 * unchanged (still 11).
 */
import {
  getTriggerMeta,
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

describe("dropbox trigger discovery — surface", () => {
  it("registers exactly 1 webhook trigger (new_file); actions still 11", () => {
    const triggers = listTriggerMetasForProvider("dropbox");
    expect(triggers.map((t) => t.key)).toEqual(["dropbox:new_file"]);
    expect(listActionMetasForProvider("dropbox")).toHaveLength(11);
  });

  it("new_file is a webhook trigger requiring the integration; key===provider:type", () => {
    const t = getTriggerMeta("dropbox:new_file")!;
    expect(t.provider).toBe("dropbox");
    expect(t.type).toBe("new_file");
    expect(t.key).toBe("dropbox:new_file");
    expect(t.activation).toBe("webhook");
    expect(t.requiresIntegration).toBe(true);
    expect(t.category).toBe("files");
  });

  it("exposes a folder picker (dropbox:folders, no dep, optional) + a recursive toggle", () => {
    const t = getTriggerMeta("dropbox:new_file")!;
    expect(t.fields.map((f) => f.name)).toEqual(["path", "recursive"]);
    const path = t.fields.find((f) => f.name === "path")!;
    expect(path.type).toBe("combobox");
    expect(path.optionsSource).toBe("dropbox:folders");
    expect(path.dependsOn).toBeUndefined();
    expect(path.required).toBe(false);
    expect(t.fields.find((f) => f.name === "recursive")!.type).toBe("boolean");
  });

  it("payload names are camelCase; no secret-shaped names", () => {
    const t = getTriggerMeta("dropbox:new_file")!;
    const BANNED = ["token", "accessToken", "refreshToken", "secret", "bytes", "base64", "url"];
    for (const p of t.payloadShape) {
      expect(p.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      expect(BANNED).not.toContain(p.name);
    }
  });

  it("marks name/path/pathLower sensitive; opaque ids + accountId non-sensitive", () => {
    const t = getTriggerMeta("dropbox:new_file")!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    for (const s of ["name", "path", "pathLower"]) {
      expect(byName.get(s)!.sensitive).toBe(true);
    }
    for (const n of ["id", "rev", "accountId", "sizeBytes", "changeKind"]) {
      expect(byName.get(n)!.sensitive).not.toBe(true);
    }
  });

  it("payload carries no bytes / content / link fields", () => {
    const names = getTriggerMeta("dropbox:new_file")!.payloadShape.map((p) => p.name);
    for (const banned of ["content", "bytes", "base64", "sharedUrl", "temporaryLink", "downloadUrl"]) {
      expect(names).not.toContain(banned);
    }
  });
});
