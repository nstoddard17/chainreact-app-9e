/**
 * Tests for the shared non-OAuth/system pseudo-provider set + helper
 * (`core/integrations/nonOauthProviders.ts`) — the single source of truth that
 * `preconditions.ts`, `workflowContext.ts`, and `integrationConnection.ts`
 * consume so a system provider (`native`) is never treated as a required OAuth
 * connection.
 */
import {
  NON_OAUTH_PROVIDERS,
  isNonOauthProvider,
} from "@/core/integrations/nonOauthProviders";

import { CONNECTIONLESS_PROVIDERS } from "@/core/integrations/connectionlessProviders";

describe("nonOauthProviders", () => {
  it("includes the native system provider", () => {
    expect(NON_OAUTH_PROVIDERS.has("native")).toBe(true);
    expect(isNonOauthProvider("native")).toBe(true);
  });

  // AI-PROVIDER-ROLLOUT-1 — the live-activation regression: this set predated
  // the `ai` provider and still said ["native"], so activating the first AI
  // workflow failed with `Connect ai before activating this workflow.` The set
  // now DERIVES from CONNECTIONLESS_PROVIDERS; these pin both the ai entry and
  // the derivation so the two lists can never drift again.
  it("includes the ai connectionless provider (live-activation regression)", () => {
    expect(NON_OAUTH_PROVIDERS.has("ai")).toBe(true);
    expect(isNonOauthProvider("ai")).toBe(true);
  });

  it("derives exactly from CONNECTIONLESS_PROVIDERS (no drift possible)", () => {
    expect([...NON_OAUTH_PROVIDERS].sort()).toEqual(
      [...CONNECTIONLESS_PROVIDERS].sort(),
    );
  });

  it("is NARROW — real external providers are NOT non-OAuth", () => {
    for (const p of ["slack", "gmail", "notion", "stripe", "acme", "bogus"]) {
      expect(isNonOauthProvider(p)).toBe(false);
    }
  });

  it("treats null / undefined / empty as not-a-non-OAuth-provider", () => {
    expect(isNonOauthProvider(null)).toBe(false);
    expect(isNonOauthProvider(undefined)).toBe(false);
    expect(isNonOauthProvider("")).toBe(false);
  });
});
