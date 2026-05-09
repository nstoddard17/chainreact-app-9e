import { notionManifest } from "@/integrations/notion/manifest";
import { ProviderManifestSchema } from "@/contracts/integration";

describe("Notion manifest", () => {
  it("validates against ProviderManifestSchema", () => {
    expect(() => ProviderManifestSchema.parse(notionManifest)).not.toThrow();
  });

  it("declares Slice 9 Commit 2 capabilities (oauth only; actions deferred to Commit 3, webhookTrigger / pollingTrigger deferred indefinitely)", () => {
    expect(notionManifest.capabilities.oauth).toBe(true);
    // Honest-state — actions flip to true in Commit 3.
    expect(notionManifest.capabilities.actions).toBe(false);
    // webhookTrigger is INTENTIONALLY DEFERRED — Notion does not expose
    // a programmatic webhook subscription API; manual setup only.
    // See docs/slices/slice-9-notion.md §"Critical constraint".
    expect(notionManifest.capabilities.webhookTrigger).toBe(false);
    expect(notionManifest.capabilities.pollingTrigger).toBe(false);
  });

  it("is non-refreshable (Slice 9 scope: Notion treated as long-lived-token)", () => {
    expect(notionManifest.refreshable).toBe(false);
  });

  it("uses bot_id as the multi-account discriminator with workspace tokenScope", () => {
    expect(notionManifest.tokenScope).toBe("workspace");
    expect(notionManifest.accountIdField).toBe("bot_id");
  });

  it("pins the 2022-06-28 Notion API version", () => {
    expect(notionManifest.apiVersion).toBe("2022-06-28");
  });

  it("declares 12h health-check interval (matches V2's 'other providers' tier)", () => {
    expect(notionManifest.healthCheckIntervalMs).toBe(12 * 60 * 60 * 1000);
  });

  it("declares documentary capability scopes (read/update/insert content)", () => {
    // Notion's authorize URL does not take a scope param; these are
    // documentary metadata for V2's UI / health surfaces.
    expect(notionManifest.scopes.required).toEqual(
      expect.arrayContaining([
        "read_content",
        "update_content",
        "insert_content",
      ]),
    );
    expect(notionManifest.scopes.optional).toEqual([]);
    expect(notionManifest.scopes.deprecated).toEqual([]);
  });

  it("declares oauth flow 'v2'", () => {
    expect(notionManifest.oauthFlows).toEqual(["v2"]);
  });
});
