/**
 * @jest-environment node
 *
 * Tests for the Mailchimp provider manifest. Validation against
 * ProviderManifestSchema happens at module load (would throw on
 * import if malformed); these tests assert the specific manifest
 * values that downstream code depends on.
 *
 * Slice 14 Commit 2 — `oauth: true`, all other capabilities `false`.
 * Subsequent commits flip `actions` (Commit 3), `webhookTrigger`
 * (Commit 4), and `pollingTrigger` (Commit 5) — those tests live in
 * their respective commits.
 */
import { ProviderManifestSchema } from "@/contracts/integration";
import { getProvider, providerSupports } from "@/integrations/_registry";
import { mailchimpManifest } from "@/integrations/mailchimp/manifest";

describe("mailchimp manifest", () => {
  it("validates against ProviderManifestSchema", () => {
    expect(() => ProviderManifestSchema.parse(mailchimpManifest)).not.toThrow();
  });

  it("is registered in the provider registry under id 'mailchimp'", () => {
    expect(getProvider("mailchimp")).toBe(mailchimpManifest);
  });

  it("uses provider id 'mailchimp' and displayName 'Mailchimp'", () => {
    expect(mailchimpManifest.id).toBe("mailchimp");
    expect(mailchimpManifest.displayName).toBe("Mailchimp");
  });

  it("declares scopes.required: ['account_access'] (synthetic — Mailchimp does NOT enforce scopes)", () => {
    // Mailchimp's OAuth2 flow grants account-wide access and does
    // not enforce scope parameters. The contract requires ≥1 scope
    // for OAuth providers; "account_access" is a synthetic
    // documentation-only declaration that satisfies the contract
    // while accurately reflecting the access model. The string is
    // NEVER sent to Mailchimp in the authorize URL (see oauth.ts
    // buildAuthUrl).
    expect(mailchimpManifest.scopes.required).toEqual(["account_access"]);
    expect(mailchimpManifest.scopes.optional).toEqual([]);
    expect(mailchimpManifest.scopes.deprecated).toEqual([]);
  });

  it("is refreshable: false (Mailchimp tokens have no refresh grant — fixes V1 misclassification)", () => {
    // V1's `authSchemes.ts:64` declares `'oauth_with_refresh'` but
    // `provider-registry.ts:662` hardcodes `refresh_token: null` —
    // refresh is never attempted. V1's declaration is dead config;
    // V2 corrects with `refreshable: false`. Matches Slack /
    // Notion / Shopify / GitHub non-refreshable contract.
    expect(mailchimpManifest.refreshable).toBe(false);
  });

  it("uses tokenScope: 'user' with accountIdField: 'mailchimpAccountId'", () => {
    // Single Mailchimp integration per (user, accountId). The
    // `account_id` returned by GET https://${dc}.api.mailchimp.com/3.0/
    // (e.g. "8d3a3db4d97663a9074efcc16") is the stable Mailchimp
    // account discriminator.
    expect(mailchimpManifest.tokenScope).toBe("user");
    expect(mailchimpManifest.accountIdField).toBe("mailchimpAccountId");
  });

  it("declares honest capabilities for Slice 14 Commit 5 (all 4 caps true)", () => {
    // Slice 14 Commit 2 landed manifest + OAuth + dispatcher
    // registration + dc-routing foundation. Slice 14 Commit 3 landed
    // 10 action handlers and flipped `actions: true`. Slice 14
    // Commit 4 landed the consolidated `audience_event` webhook
    // trigger and flipped `webhookTrigger: true`. Slice 14 Commit 5
    // (now) lands three polling triggers (campaign_created,
    // email_opened, link_clicked) and flips `pollingTrigger: true`.
    // Slice 14 complete: every capability is honest.
    expect(mailchimpManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: true,
      pollingTrigger: true,
      actions: true,
    });
    expect(providerSupports("mailchimp", "oauth")).toBe(true);
    expect(providerSupports("mailchimp", "actions")).toBe(true);
    expect(providerSupports("mailchimp", "webhookTrigger")).toBe(true);
    expect(providerSupports("mailchimp", "pollingTrigger")).toBe(true);
  });

  it("declares apiVersion '3.0' (matches _shared/mailchimp/api/_base.ts MAILCHIMP_API_VERSION)", () => {
    // Mailchimp's REST API is URL-versioned — `/3.0/...` path
    // prefix. The manifest pin + the `_base.ts` const must stay in
    // lockstep so action handlers and the manifest agree on what
    // wire surface the integration targets.
    expect(mailchimpManifest.apiVersion).toBe("3.0");
  });

  it("declares 12h health-check interval (matches V2's 'other providers' tier)", () => {
    // 12h matches Slack / Notion / Discord / Airtable / Stripe /
    // Shopify. Mailchimp's API is gentle on rate limits; a 12h
    // `GET /3.0/` ping confirms the bearer still works.
    expect(mailchimpManifest.healthCheckIntervalMs).toBe(12 * 60 * 60 * 1000);
  });

  it("declares oauthFlows: ['v2'] (Mailchimp's current OAuth 2.0 flow)", () => {
    expect(mailchimpManifest.oauthFlows).toEqual(["v2"]);
  });

  it("isEnabled: true (no experimental flag)", () => {
    expect(mailchimpManifest.isEnabled).toBe(true);
    expect(mailchimpManifest.isExperimental).toBe(false);
  });
});
