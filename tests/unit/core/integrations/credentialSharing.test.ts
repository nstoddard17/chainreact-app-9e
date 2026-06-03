/**
 * @jest-environment node
 *
 * Tests for the provider credential-sharing policy (Slice 4.ACCOUNT-MODEL-22A).
 *
 * Pure classification — proves the policy values, that EVERY registered provider
 * is explicitly classified (no silent default for a known provider), and that
 * unknown providers fail safe to `personal`. No runtime behavior is exercised.
 */
import {
  credentialSharingForProvider,
  isPersonalCredentialProvider,
  isAccountCredentialProvider,
  hasExplicitCredentialSharing,
  DEFAULT_CREDENTIAL_SHARING,
} from "@/core/integrations/credentialSharing";
import { listProviders } from "@/integrations/_registry";

const ACCOUNT_PROVIDERS = ["slack", "notion", "stripe", "shopify", "hubspot", "mailchimp"];
const SAMPLE_PERSONAL = [
  "gmail",
  "microsoft-outlook",
  "google-drive",
  "discord",
  "dropbox",
  // "needs decision" providers default personal for launch safety:
  "github",
  "facebook",
  "airtable",
  "trello",
  "monday",
];

describe("credentialSharing — classification values", () => {
  it.each(ACCOUNT_PROVIDERS)("classifies %s as account", (p) => {
    expect(credentialSharingForProvider(p)).toBe("account");
    expect(isAccountCredentialProvider(p)).toBe(true);
    expect(isPersonalCredentialProvider(p)).toBe(false);
  });

  it.each(SAMPLE_PERSONAL)("classifies %s as personal", (p) => {
    expect(credentialSharingForProvider(p)).toBe("personal");
    expect(isPersonalCredentialProvider(p)).toBe(true);
    expect(isAccountCredentialProvider(p)).toBe(false);
  });
});

describe("credentialSharing — registry coverage", () => {
  it("explicitly classifies EVERY registered provider (no silent default)", () => {
    const unclassified = listProviders()
      .map((m) => m.id)
      .filter((id) => !hasExplicitCredentialSharing(id));
    expect(unclassified).toEqual([]);
  });

  it("returns a valid class for every registered provider", () => {
    for (const m of listProviders()) {
      expect(["personal", "account"]).toContain(credentialSharingForProvider(m.id));
    }
  });
});

describe("credentialSharing — fail-safe default", () => {
  it("defaults unknown providers to personal", () => {
    expect(DEFAULT_CREDENTIAL_SHARING).toBe("personal");
    expect(credentialSharingForProvider("totally-unknown-provider")).toBe("personal");
    expect(isPersonalCredentialProvider("totally-unknown-provider")).toBe(true);
    expect(hasExplicitCredentialSharing("totally-unknown-provider")).toBe(false);
  });

  it("predicates stay consistent with credentialSharingForProvider", () => {
    for (const p of [...ACCOUNT_PROVIDERS, ...SAMPLE_PERSONAL, "unknown"]) {
      const cls = credentialSharingForProvider(p);
      expect(isPersonalCredentialProvider(p)).toBe(cls === "personal");
      expect(isAccountCredentialProvider(p)).toBe(cls === "account");
    }
  });
});
