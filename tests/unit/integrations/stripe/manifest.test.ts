/**
 * @jest-environment node
 *
 * Tests for the Stripe provider manifest. Validation against
 * ProviderManifestSchema happens at module load (it would throw on
 * import if malformed); these tests assert the specific manifest values
 * that downstream code depends on.
 */
import { stripeManifest } from "@/integrations/stripe/manifest";
import {
  getProvider,
  providerSupports,
} from "@/integrations/_registry";
import { ProviderManifestSchema } from "@/contracts/integration";

describe("stripe manifest", () => {
  it("validates against ProviderManifestSchema", () => {
    expect(() => ProviderManifestSchema.parse(stripeManifest)).not.toThrow();
  });

  it("is registered in the provider registry under id 'stripe'", () => {
    expect(getProvider("stripe")).toBe(stripeManifest);
  });

  it("declares scopes.required: ['read_write'] (Slice 11 Batch 1 — single Stripe Connect scope)", () => {
    // Slice 11 confirmed scope decision #6: Stripe Connect's scope
    // model is binary (`read_only` vs `read_write`); all 10 actions
    // in Batch 1 require `read_write`. `read_only` deferred.
    expect(stripeManifest.scopes.required).toEqual(["read_write"]);
    expect(stripeManifest.scopes.optional).toEqual([]);
    expect(stripeManifest.scopes.deprecated).toEqual([]);
  });

  it("does NOT include 'read_only' (deferred per Slice 11 Batch 1)", () => {
    // Explicit anti-test. Read-only workflows are a future batch; the
    // 10 Batch 1 actions all do POST/PATCH/DELETE.
    expect(stripeManifest.scopes.required).not.toContain("read_only");
  });

  it("is refreshable: true (Stripe Connect issues refresh tokens; NOT rotated by default)", () => {
    // Slice 11's load-bearing distinction: V2's first
    // refresh-token-stable provider. Airtable rotates on every
    // refresh; Stripe does not. V2's per-provider refreshToken()
    // PRESERVES the original refresh_token when the response omits a
    // new one — this is the contract `refreshable: true` promises.
    expect(stripeManifest.refreshable).toBe(true);
  });

  it("uses tokenScope: 'user' with accountIdField: 'stripeUserId'", () => {
    // Single Stripe integration per (user, stripe_user_id). The
    // stripe_user_id (acct_xxx) returned by the token exchange is the
    // stable connected-merchant-account discriminator.
    expect(stripeManifest.tokenScope).toBe("user");
    expect(stripeManifest.accountIdField).toBe("stripeUserId");
  });

  it("declares honest capabilities for Slice 11 Commit 2 (oauth-only; actions + webhookTrigger DEFERRED)", () => {
    // Slice 11 Commit 2 (this commit) lands manifest + OAuth +
    // dispatcher registration. Commit 3 will flip `actions: true`;
    // Commit 4 will flip `webhookTrigger: true`. Honest-state
    // convention: flags flip in lockstep with the registrations they
    // describe.
    expect(stripeManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: false,
      pollingTrigger: false,
      actions: false,
    });
    expect(providerSupports("stripe", "oauth")).toBe(true);
    expect(providerSupports("stripe", "actions")).toBe(false);
    expect(providerSupports("stripe", "webhookTrigger")).toBe(false);
    expect(providerSupports("stripe", "pollingTrigger")).toBe(false);
  });

  it("declares apiVersion '2025-05-28.basil' (matches V1's lib/stripe/client.ts pin for cutover wire-format parity)", () => {
    // V1 pins this version in its platform Stripe SDK config; V2
    // sends the same value via `Stripe-Version` header on REST calls
    // (Slice 11 Commit 3) so the wire-format surface area is
    // identical between V1 and V2 during the cutover.
    expect(stripeManifest.apiVersion).toBe("2025-05-28.basil");
  });

  it("declares 12h health-check interval (matches V2's 'other providers' tier — Notion/Slack/Discord/Airtable)", () => {
    expect(stripeManifest.healthCheckIntervalMs).toBe(12 * 60 * 60 * 1000);
  });

  it("declares oauthFlows: ['v2'] (Stripe Connect's current OAuth 2.0 flow)", () => {
    expect(stripeManifest.oauthFlows).toEqual(["v2"]);
  });

  it("isEnabled: true (no experimental flag)", () => {
    expect(stripeManifest.isEnabled).toBe(true);
    expect(stripeManifest.isExperimental).toBe(false);
  });

  it("uses provider id 'stripe'", () => {
    expect(stripeManifest.id).toBe("stripe");
    expect(stripeManifest.displayName).toBe("Stripe");
  });
});
