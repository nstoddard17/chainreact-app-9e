/** @jest-environment node */
import { ProviderManifestSchema } from "@/contracts/integration";
import { trelloManifest } from "@/integrations/trello/manifest";

describe("trelloManifest", () => {
  it("parses cleanly against ProviderManifestSchema", () => {
    expect(() => ProviderManifestSchema.parse(trelloManifest)).not.toThrow();
  });

  it("declares the token-ingest auth flow", () => {
    expect(trelloManifest.authFlow).toBe("token_ingest");
  });

  it("is non-refreshable (Trello tokens don't refresh)", () => {
    expect(trelloManifest.refreshable).toBe(false);
  });

  it("uses user token scope", () => {
    expect(trelloManifest.tokenScope).toBe("user");
  });

  it("requires the three coarse Trello scopes", () => {
    expect(trelloManifest.scopes.required).toEqual([
      "read",
      "write",
      "account",
    ]);
  });

  it("flips capabilities.oauth: true (token-ingest is the connect path)", () => {
    expect(trelloManifest.capabilities.oauth).toBe(true);
  });

  it("declares actions capability after Commit 4 (8 handlers registered)", () => {
    expect(trelloManifest.capabilities.actions).toBe(true);
  });

  it("declares webhookTrigger capability after Commit 5 (6 triggers registered)", () => {
    expect(trelloManifest.capabilities.webhookTrigger).toBe(true);
  });

  it("does not declare polling capability (Trello is webhook-only)", () => {
    expect(trelloManifest.capabilities.pollingTrigger).toBe(false);
  });

  it("uses the 4h developer-tier health check interval", () => {
    expect(trelloManifest.healthCheckIntervalMs).toBe(4 * 60 * 60 * 1000);
  });

  it("refuses a refreshable Trello mutation (invariant check)", () => {
    const r = ProviderManifestSchema.safeParse({
      ...trelloManifest,
      refreshable: true,
    });
    expect(r.success).toBe(false);
  });
});
