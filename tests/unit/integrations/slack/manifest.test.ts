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

  it("includes im:history in required scopes (Slack 2.1 Commit 8 — slack.message.im trigger)", () => {
    expect(slackManifest.scopes.required).toEqual(
      expect.arrayContaining(["im:history"]),
    );
  });

  it("includes mpim:history in required scopes (Slack 2.1 Commit 8 — slack.message.mpim trigger)", () => {
    expect(slackManifest.scopes.required).toEqual(
      expect.arrayContaining(["mpim:history"]),
    );
  });

  it("includes reactions:read in required scopes (Slack 2.1 Commit 8 — reaction_added / _removed triggers)", () => {
    expect(slackManifest.scopes.required).toEqual(
      expect.arrayContaining(["reactions:read"]),
    );
  });

  it("includes chat:write.public in optional scopes (Slack 2.1 Commit 8 — post to public channels without join)", () => {
    expect(slackManifest.scopes.optional).toEqual(
      expect.arrayContaining(["chat:write.public"]),
    );
  });

  it("promotes users:read to required (Slack 2.3 Commit 4 — get_user_info + list_users actions)", () => {
    expect(slackManifest.scopes.required).toEqual(
      expect.arrayContaining(["users:read"]),
    );
    expect(slackManifest.scopes.optional).not.toEqual(
      expect.arrayContaining(["users:read"]),
    );
  });

  it("includes groups:history in required scopes (Slack 2.2 Commit 2 — slack.message.group trigger + private-channel reads)", () => {
    expect(slackManifest.scopes.required).toEqual(
      expect.arrayContaining(["groups:history"]),
    );
  });

  it("includes groups:read in required scopes (Slack 2.2 Commit 3 — channel lifecycle triggers for private channels)", () => {
    expect(slackManifest.scopes.required).toEqual(
      expect.arrayContaining(["groups:read"]),
    );
  });

  it("includes channels:manage in required scopes (Slack 2.3 Commit 3 — public channel lifecycle / membership / metadata admin)", () => {
    expect(slackManifest.scopes.required).toEqual(
      expect.arrayContaining(["channels:manage"]),
    );
  });

  it("includes channels:join in required scopes (Slack 2.3 Commit 3 — bot self-join for public channels)", () => {
    expect(slackManifest.scopes.required).toEqual(
      expect.arrayContaining(["channels:join"]),
    );
  });

  it("includes groups:write in required scopes (Slack 2.3 Commit 3 — full admin for private channels)", () => {
    expect(slackManifest.scopes.required).toEqual(
      expect.arrayContaining(["groups:write"]),
    );
  });

  it("still does NOT add users:read.email — deferred indefinitely (PII; Slack 2.3 plan §6 #3)", () => {
    expect(slackManifest.scopes.required).not.toEqual(
      expect.arrayContaining(["users:read.email"]),
    );
    expect(slackManifest.scopes.optional).not.toEqual(
      expect.arrayContaining(["users:read.email"]),
    );
  });

  it("does NOT yet add file scopes (deferred to Slack 2.3)", () => {
    expect(slackManifest.scopes.required).not.toEqual(
      expect.arrayContaining(["files:read"]),
    );
    expect(slackManifest.scopes.required).not.toEqual(
      expect.arrayContaining(["files:write"]),
    );
    expect(slackManifest.scopes.optional).not.toEqual(
      expect.arrayContaining(["files:read"]),
    );
    expect(slackManifest.scopes.optional).not.toEqual(
      expect.arrayContaining(["files:write"]),
    );
  });

  it("does NOT yet add user-token scopes (deferred behind P-S1)", () => {
    // V1 had users:write / users.profile:write for updateUserStatus +
    // setUserPresence. Those land after P-S1 user-token storage.
    expect(slackManifest.scopes.required).not.toEqual(
      expect.arrayContaining(["users:write"]),
    );
    expect(slackManifest.scopes.required).not.toEqual(
      expect.arrayContaining(["users.profile:write"]),
    );
  });
});
