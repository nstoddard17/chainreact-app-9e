/**
 * @jest-environment node
 *
 * Slice 3.DROPBOX-4 builder-shape test — Dropbox `create_shared_link`.
 * Pins the folderPath → path cascade, the shared-link sensitivity/risk
 * shape (sharedUrl + path sensitive; link-reuse described), and that
 * persisted config parses.
 */
import { dropboxCreateSharedLinkMeta } from "@/integrations/dropbox/actions/createSharedLink.meta";
import { CreateSharedLinkConfigSchema } from "@/integrations/dropbox/actions/createSharedLink.schema";

describe("dropbox create_shared_link meta — Builder shape", () => {
  it("declares folderPath (UI-scope) + path", () => {
    expect(dropboxCreateSharedLinkMeta.fields.map((f) => f.name)).toEqual([
      "folderPath",
      "path",
    ]);
  });

  it("file picker wires dropbox:files dependsOn folderPath", () => {
    const f = dropboxCreateSharedLinkMeta.fields.find((x) => x.name === "path")!;
    expect(f.optionsSource).toBe("dropbox:files");
    expect(f.dependsOn).toBe("folderPath");
  });

  it("sharedUrl + path outputs are sensitive; linkExisted is not", () => {
    const out = new Map(
      dropboxCreateSharedLinkMeta.outputs.map((o) => [o.name, o]),
    );
    expect(out.get("sharedUrl")!.sensitive).toBe(true);
    expect(out.get("path")!.sensitive).toBe(true);
    expect(out.get("linkExisted")!.sensitive).not.toBe(true);
  });

  it("description notes existing-link reuse + access exposure", () => {
    expect(dropboxCreateSharedLinkMeta.description).toMatch(/reused/i);
    expect(dropboxCreateSharedLinkMeta.description).toMatch(/expose/i);
  });

  it("risk: medium, not destructive (no confirmation trio)", () => {
    expect(dropboxCreateSharedLinkMeta.riskLevel).toBe("medium");
    expect(dropboxCreateSharedLinkMeta.isDestructive).toBe(false);
    expect(dropboxCreateSharedLinkMeta.requiresConfirmation).toBe(false);
  });

  it("persisted config (path + UI-scope folderPath) parses against the runtime schema", () => {
    expect(() =>
      CreateSharedLinkConfigSchema.parse({
        path: "/Reports/q1.pdf",
        folderPath: "/Reports",
      }),
    ).not.toThrow();
  });
});
