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

describe("nonOauthProviders", () => {
  it("includes the native system provider", () => {
    expect(NON_OAUTH_PROVIDERS.has("native")).toBe(true);
    expect(isNonOauthProvider("native")).toBe(true);
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
