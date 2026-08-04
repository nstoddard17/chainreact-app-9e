/**
 * @jest-environment node
 *
 * Tests for the Microsoft Teams provider manifest. Validation against
 * ProviderManifestSchema happens at module load (it would throw on
 * import if malformed); these tests assert the specific manifest values
 * that downstream code depends on.
 */
import { microsoftTeamsManifest } from "@/integrations/microsoft-teams/manifest";
import { getProvider, providerSupports } from "@/integrations/_registry";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

describe("microsoft-teams manifest", () => {
  it("is registered in the provider registry under id 'microsoft-teams'", () => {
    expect(getProvider("microsoft-teams")).toBe(microsoftTeamsManifest);
  });

  it("declares EXACTLY the Batch 1 delegated-user scope set (8 required)", () => {
    // Slice 16 confirmed scope decision: narrow delegated-user set.
    // V1 ships 19 scopes including admin-consent ones; V2 ships only
    // the scopes required by the 5 Batch 1 actions + 1 trigger.
    expect(microsoftTeamsManifest.scopes.required).toEqual([
      "offline_access",
      "User.Read",
      "ChannelMessage.Send",
      "ChannelMessage.Read.All",
      "Channel.ReadBasic.All",
      "Team.ReadBasic.All",
      "TeamMember.Read.All",
      "Chat.ReadWrite",
    ]);
    expect(microsoftTeamsManifest.scopes.optional).toEqual([]);
    expect(microsoftTeamsManifest.scopes.deprecated).toEqual([]);
  });

  it("does NOT include tenant-admin-consent scopes (anti-test)", () => {
    // Slice 16 Batch 1 is 100% delegated-user; admin-consent scopes
    // come back ONLY when the corresponding deferred Batch 2 actions
    // ship. Each entry here would force a tenant admin consent UX
    // that the Batch 1 surface doesn't need.
    for (const adminScope of [
      "Channel.Delete.All",
      "TeamMember.ReadWrite.All",
      "Team.Create",
      "User.Invite.All",
      "Chat.Create",
      "OnlineMeetings.ReadWrite",
      "Calendars.ReadWrite",
    ]) {
      expect(microsoftTeamsManifest.scopes.required).not.toContain(adminScope);
    }
  });

  it("does NOT include Channel.Create — create_channel is deferred to Batch 2", () => {
    // Explicit anti-test. The plan doc keeps create_channel deferred
    // because exercising it in e2e without team-owner permissions risks
    // 403s that mask other regressions. Scope returns with the action.
    expect(microsoftTeamsManifest.scopes.required).not.toContain(
      "Channel.Create",
    );
  });

  it("does NOT include other Microsoft providers' scopes (no scope bloat)", () => {
    // Anti-test. Each Microsoft provider declares only the scopes its
    // own actions/triggers need. These are owned by Outlook Mail
    // (Mail.*), Outlook Calendar (Calendars.*), or OneDrive/Excel
    // (Files.*).
    for (const wrongScope of [
      "Mail.Send",
      "Mail.Read",
      "Mail.ReadWrite",
      "Calendars.Read",
      "Files.ReadWrite",
      "Files.ReadWrite.All",
    ]) {
      expect(microsoftTeamsManifest.scopes.required).not.toContain(wrongScope);
    }
  });

  it("is refreshable: true (Microsoft v2 + offline_access issues refresh tokens)", () => {
    expect(microsoftTeamsManifest.refreshable).toBe(true);
  });

  it("uses tokenScope: user with accountIdField: email (matches sibling Microsoft providers)", () => {
    expect(microsoftTeamsManifest.tokenScope).toBe("user");
    expect(microsoftTeamsManifest.accountIdField).toBe("email");
  });

  it("declares honest capabilities for Slice 16 Commit 4 (oauth + actions + webhookTrigger)", () => {
    // Slice 16 Commit 2 landed manifest + OAuth + dispatcher (oauth only).
    // Commit 3 landed 5 delegated-user actions + flipped actions: true.
    // Commit 4 (this) lands the new_channel_message Graph subscription
    // trigger + flips webhookTrigger: true. pollingTrigger stays false
    // — Teams uses Graph subscriptions, not polling. Honest-state
    // convention.
    expect(microsoftTeamsManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: true,
      pollingTrigger: false,
      actions: true,
    });
    expect(providerSupports("microsoft-teams", "oauth")).toBe(true);
    expect(providerSupports("microsoft-teams", "actions")).toBe(true);
    expect(providerSupports("microsoft-teams", "webhookTrigger")).toBe(true);
    expect(providerSupports("microsoft-teams", "pollingTrigger")).toBe(false);
  });

  it("declares actions: true and the action-handler registry contains all 8 Teams actions", () => {
    // Fail-closed: assert the capability itself — a regression that flips
    // it to false must FAIL here, not silently skip the registry pin.
    expect(microsoftTeamsManifest.capabilities.actions).toBe(true);
    const registered = listRegisteredHandlers().filter(
      (h) => h.provider === "microsoft-teams",
    );
    expect(registered.map((r) => r.type).sort()).toEqual([
      "get_channel_details",
      "get_team_members",
      "list_channel_messages",
      "list_channels",
      "list_teams",
      "reply_to_channel_message",
      "send_channel_message",
      "send_chat_message",
    ]);
  });

  it("uses 6h health-check interval matching Microsoft cadence (CLAUDE.md)", () => {
    expect(microsoftTeamsManifest.healthCheckIntervalMs).toBe(
      6 * 60 * 60 * 1000,
    );
  });

  it("declares apiVersion v1.0 (Graph API stable, same as sibling providers)", () => {
    expect(microsoftTeamsManifest.apiVersion).toBe("v1.0");
  });

  it("declares oauthFlows: ['v2'] (Microsoft identity platform v2.0)", () => {
    expect(microsoftTeamsManifest.oauthFlows).toEqual(["v2"]);
  });

  it("isEnabled: true (no experimental flag)", () => {
    expect(microsoftTeamsManifest.isEnabled).toBe(true);
    expect(microsoftTeamsManifest.isExperimental).toBe(false);
  });

  it("uses a distinct provider id from sibling Microsoft providers", () => {
    // Slice 16 deliberately renames V1's `teams` provider id to
    // `microsoft-teams` to match the family naming convention. If this
    // assertion drifts, the _registry duplicate-id check throws at
    // module load anyway — belt-and-suspenders.
    expect(microsoftTeamsManifest.id).toBe("microsoft-teams");
    expect(getProvider("microsoft-outlook")).not.toBe(microsoftTeamsManifest);
    expect(getProvider("microsoft-outlook-calendar")).not.toBe(
      microsoftTeamsManifest,
    );
    expect(getProvider("microsoft-onedrive")).not.toBe(microsoftTeamsManifest);
    expect(getProvider("microsoft-excel")).not.toBe(microsoftTeamsManifest);
  });

  it("displayName is 'Microsoft Teams' (matches connect UX copy)", () => {
    expect(microsoftTeamsManifest.displayName).toBe("Microsoft Teams");
  });
});
