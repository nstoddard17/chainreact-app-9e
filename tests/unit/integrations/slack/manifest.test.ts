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

  it("includes reactions:write in required scopes (Slack 2.1 Commit 6 — add/remove_reaction)", () => {
    expect(slackManifest.scopes.required).toEqual(
      expect.arrayContaining(["reactions:write"]),
    );
  });

  it("includes pins:write in required scopes (Slack 2.1 Commit 6 — pin/unpin_message)", () => {
    expect(slackManifest.scopes.required).toEqual(
      expect.arrayContaining(["pins:write"]),
    );
  });

  it("does NOT yet add reactions:read — deferred to trigger filters (Commit 8)", () => {
    // reactions:read is needed for the reaction_added / reaction_removed
    // triggers, not for the write actions. Keeping it deferred until the
    // trigger filter commit makes scope creep obvious if regressed.
    expect(slackManifest.scopes.required).not.toEqual(
      expect.arrayContaining(["reactions:read"]),
    );
    expect(slackManifest.scopes.optional).not.toEqual(
      expect.arrayContaining(["reactions:read"]),
    );
  });

  it("does NOT yet add Slack 2.1 scopes deferred to later commits (im:history, mpim:history, chat:write.public)", () => {
    // These land in Commit 8 (trigger filters + chat:write.public optional).
    expect(slackManifest.scopes.required).not.toEqual(
      expect.arrayContaining(["im:history"]),
    );
    expect(slackManifest.scopes.required).not.toEqual(
      expect.arrayContaining(["mpim:history"]),
    );
    expect(slackManifest.scopes.optional).not.toEqual(
      expect.arrayContaining(["chat:write.public"]),
    );
  });
});
