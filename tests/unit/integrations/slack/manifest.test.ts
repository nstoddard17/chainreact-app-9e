import { slackManifest } from "@/integrations/slack/manifest";
import { ProviderManifestSchema } from "@/contracts/integration";

describe("Slack manifest", () => {
  it("validates against ProviderManifestSchema", () => {
    expect(() => ProviderManifestSchema.parse(slackManifest)).not.toThrow();
  });

  it("declares Slice 1 capabilities (oauth + webhookTrigger + actions)", () => {
    expect(slackManifest.capabilities.oauth).toBe(true);
    expect(slackManifest.capabilities.webhookTrigger).toBe(true);
    expect(slackManifest.capabilities.actions).toBe(true);
    expect(slackManifest.capabilities.pollingTrigger).toBe(false);
  });

  it("is non-refreshable (Slack default v2 has no refresh tokens)", () => {
    expect(slackManifest.refreshable).toBe(false);
  });

  it("uses team_id as the multi-account discriminator", () => {
    expect(slackManifest.tokenScope).toBe("workspace");
    expect(slackManifest.accountIdField).toBe("team_id");
  });

  it("required scopes cover trigger + action paths for slice 1", () => {
    expect(slackManifest.scopes.required).toEqual(
      expect.arrayContaining(["channels:history", "channels:read", "chat:write"]),
    );
  });

  it("includes im:write in required scopes (Slack 2.1 Commit 4 — send_direct_message)", () => {
    expect(slackManifest.scopes.required).toEqual(
      expect.arrayContaining(["im:write"]),
    );
  });

  it("does NOT yet add Slack 2.1 scopes deferred to later commits (im:history, mpim:history, reactions:*, pins:write, chat:write.public)", () => {
    // These land in Commit 6 (reactions/pins) and Commit 8 (trigger filters
    // + chat:write.public optional). Keeping the manifest narrow per-commit
    // makes regressions in scope creep obvious.
    expect(slackManifest.scopes.required).not.toEqual(
      expect.arrayContaining(["im:history"]),
    );
    expect(slackManifest.scopes.required).not.toEqual(
      expect.arrayContaining(["mpim:history"]),
    );
    expect(slackManifest.scopes.required).not.toEqual(
      expect.arrayContaining(["reactions:read"]),
    );
    expect(slackManifest.scopes.required).not.toEqual(
      expect.arrayContaining(["reactions:write"]),
    );
    expect(slackManifest.scopes.required).not.toEqual(
      expect.arrayContaining(["pins:write"]),
    );
    expect(slackManifest.scopes.optional).not.toEqual(
      expect.arrayContaining(["chat:write.public"]),
    );
  });
});
