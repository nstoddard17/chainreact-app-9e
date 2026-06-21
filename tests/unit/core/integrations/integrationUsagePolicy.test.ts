import {
  decideIntegrationUsage,
  PRIVATE_CONNECTION_DENY_DETAIL,
} from "@/core/integrations/integrationUsagePolicy";

/**
 * Integration-usage policy tests (Slice 4.PUBLIC-MCP-USAGE-1).
 *
 * Proves the conservative identity rule with NO DB: account/service usable by any
 * member; member-connected identities (Outlook/Gmail/calendar) private to the
 * connector by default; cross-user use honored ONLY when explicit sharing is
 * enabled AND the row is shared_with_account.
 */

const CONNECTOR = "user-connector";
const OTHER = "user-other";

function decide(over: Partial<Parameters<typeof decideIntegrationUsage>[0]> = {}) {
  return decideIntegrationUsage({
    provider: "gmail",
    connectedByUserId: CONNECTOR,
    sharingScope: null,
    actorUserId: OTHER,
    purpose: "configure_workflow",
    connectionSharingEnabled: false,
    ...over,
  });
}

describe("core/integrations/integrationUsagePolicy", () => {
  it("the connector may always use their OWN member-connected identity", () => {
    expect(decide({ provider: "gmail", actorUserId: CONNECTOR })).toEqual({ allowed: true });
    expect(decide({ provider: "microsoft-outlook", actorUserId: CONNECTOR })).toEqual({ allowed: true });
    expect(decide({ provider: "google-calendar", actorUserId: CONNECTOR })).toEqual({ allowed: true });
  });

  it("a co-member CANNOT use another member's Outlook/Gmail/calendar by default", () => {
    for (const provider of ["gmail", "microsoft-outlook", "microsoft-outlook-calendar", "google-calendar"]) {
      const d = decide({ provider, actorUserId: OTHER });
      expect(d.allowed).toBe(false);
      if (!d.allowed) {
        expect(d.reason).toBe("integration_not_allowed_for_actor");
        expect(d.detail).toBe(PRIVATE_CONNECTION_DENY_DETAIL);
      }
    }
  });

  it("account/service integrations are usable by any member (classification, flag-independent)", () => {
    for (const provider of ["slack", "stripe", "notion", "shopify", "hubspot", "mailchimp"]) {
      expect(decide({ provider, actorUserId: OTHER, connectionSharingEnabled: false })).toEqual({
        allowed: true,
      });
    }
  });

  it("cross-user personal use stays denied even when shared_with_account but the flag is OFF", () => {
    const d = decide({
      provider: "gmail",
      actorUserId: OTHER,
      sharingScope: "shared_with_account",
      connectionSharingEnabled: false,
    });
    expect(d.allowed).toBe(false);
  });

  it("cross-user personal use is allowed only when the flag is ON AND the row is shared_with_account", () => {
    expect(
      decide({
        provider: "gmail",
        actorUserId: OTHER,
        sharingScope: "shared_with_account",
        connectionSharingEnabled: true,
      }),
    ).toEqual({ allowed: true });

    // Flag on but NOT shared → still denied.
    expect(
      decide({
        provider: "gmail",
        actorUserId: OTHER,
        sharingScope: null,
        connectionSharingEnabled: true,
      }).allowed,
    ).toBe(false);
  });

  it("unknown providers fail safe to personal (private to connector)", () => {
    expect(decide({ provider: "some-future-provider", actorUserId: OTHER }).allowed).toBe(false);
    expect(decide({ provider: "some-future-provider", actorUserId: CONNECTOR }).allowed).toBe(true);
  });

  it("a null connector with no sharing denies a non-connector (no anonymous self-match)", () => {
    expect(decide({ provider: "gmail", connectedByUserId: null, actorUserId: OTHER }).allowed).toBe(false);
  });
});
