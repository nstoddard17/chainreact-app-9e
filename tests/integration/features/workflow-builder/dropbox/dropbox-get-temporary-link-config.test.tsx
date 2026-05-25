/**
 * @jest-environment node
 *
 * Slice 3.DROPBOX-4 builder-shape test — Dropbox `get_temporary_link`
 * (FileRef producer, signed_url arm). Pins the folderPath → path cascade,
 * producesFileRef + sensitive fileRef output, the ~4h-expiry / signed-URL
 * description, and that persisted config parses.
 */
import { dropboxGetTemporaryLinkMeta } from "@/integrations/dropbox/actions/getTemporaryLink.meta";
import { GetTemporaryLinkConfigSchema } from "@/integrations/dropbox/actions/getTemporaryLink.schema";

describe("dropbox get_temporary_link meta — Builder shape (signed_url FileRef producer)", () => {
  it("declares folderPath (UI-scope) + path", () => {
    expect(dropboxGetTemporaryLinkMeta.fields.map((f) => f.name)).toEqual([
      "folderPath",
      "path",
    ]);
  });

  it("file picker wires dropbox:files dependsOn folderPath", () => {
    const f = dropboxGetTemporaryLinkMeta.fields.find((x) => x.name === "path")!;
    expect(f.optionsSource).toBe("dropbox:files");
    expect(f.dependsOn).toBe("folderPath");
  });

  it("producesFileRef=true with a sensitive fileRef output (signed link inside the ref)", () => {
    expect(dropboxGetTemporaryLinkMeta.producesFileRef).toBe(true);
    expect(dropboxGetTemporaryLinkMeta.consumesFileRef).toBe(false);
    const out = dropboxGetTemporaryLinkMeta.outputs.find((o) => o.name === "file")!;
    expect(out.type).toBe("fileRef");
    expect(out.sensitive).toBe(true);
    // The link is NOT surfaced as a plain string URL output.
    expect(
      dropboxGetTemporaryLinkMeta.outputs.some((o) => o.name === "sharedUrl"),
    ).toBe(false);
  });

  it("description notes ~4h expiry + sensitive access material", () => {
    expect(dropboxGetTemporaryLinkMeta.description).toMatch(/4 hours/i);
    expect(dropboxGetTemporaryLinkMeta.description).toMatch(/sensitive/i);
  });

  it("risk: medium (auth-free temporary access link)", () => {
    expect(dropboxGetTemporaryLinkMeta.riskLevel).toBe("medium");
    expect(dropboxGetTemporaryLinkMeta.isDestructive).toBe(false);
  });

  it("persisted config (path + UI-scope folderPath) parses against the runtime schema", () => {
    expect(() =>
      GetTemporaryLinkConfigSchema.parse({
        path: "/Reports/q1.pdf",
        folderPath: "/Reports",
      }),
    ).not.toThrow();
  });
});
