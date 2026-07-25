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

  it("is refreshable (SLACK-TOKEN-ROTATION-1 — rotation-enabled apps get a real refreshToken())", () => {
    expect(slackManifest.refreshable).toBe(true);
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

  it("includes files:read in required scopes (Slack 2.4 Commit 2 — files.info + url_private GET; file_shared event delivery)", () => {
    expect(slackManifest.scopes.required).toEqual(
      expect.arrayContaining(["files:read"]),
    );
  });

  it("includes files:write in required scopes (Slack 2.4 Commit 2 — files.getUploadURLExternal + files.completeUploadExternal)", () => {
    expect(slackManifest.scopes.required).toEqual(
      expect.arrayContaining(["files:write"]),
    );
  });

  it("does NOT add user-token (xoxp-…) variants of file scopes (Slack 2.4 plan §6 — bot-token only)", () => {
    for (const scope of ["files:read.user", "files:write.user"]) {
      expect(slackManifest.scopes.required).not.toEqual(
        expect.arrayContaining([scope]),
      );
      expect(slackManifest.scopes.optional).not.toEqual(
        expect.arrayContaining([scope]),
      );
    }
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
