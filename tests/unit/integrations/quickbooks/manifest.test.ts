/**
 * @jest-environment node
 *
 * QUICKBOOKS-1 — manifest registration + catalog metadata + credential
 * class. Registry presence (not file presence) defines what ships.
 */
import { getProvider } from "@/integrations/_registry";
import { quickbooksManifest } from "@/integrations/quickbooks/manifest";
import {
  credentialSharingForProvider,
  hasExplicitCredentialSharing,
} from "@/core/integrations/credentialSharing";
import { categoryFor, descriptionFor } from "@/lib/apps/providerCategories";

describe("quickbooks manifest", () => {
  it("is registered in the provider registry under 'quickbooks'", () => {
    const provider = getProvider("quickbooks");
    expect(provider).toBeDefined();
    expect(provider?.id).toBe("quickbooks");
    expect(provider?.displayName).toBe("QuickBooks Online");
    expect(provider?.isEnabled).toBe(true);
  });

  it("declares the single accounting scope and nothing else", () => {
    expect(quickbooksManifest.scopes.required).toEqual([
      "com.intuit.quickbooks.accounting",
    ]);
    expect(quickbooksManifest.scopes.optional).toEqual([]);
  });

  it("declares honest capabilities (actions + webhook triggers ship this slice; no polling)", () => {
    expect(quickbooksManifest.capabilities).toMatchObject({
      oauth: true,
      actions: true,
      webhookTrigger: true,
      pollingTrigger: false,
    });
  });

  it("is refreshable with realmId as the account discriminator", () => {
    expect(quickbooksManifest.refreshable).toBe(true);
    expect(quickbooksManifest.accountIdField).toBe("realmId");
  });

  it("is EXPLICITLY classified as an ACCOUNT credential (company books, Stripe/Shopify posture)", () => {
    expect(hasExplicitCredentialSharing("quickbooks")).toBe(true);
    expect(credentialSharingForProvider("quickbooks")).toBe("account");
  });

  it("has Apps-catalog category + description (never 'Other' with blank copy)", () => {
    expect(categoryFor("quickbooks")).toBe("Accounting");
    expect(descriptionFor("quickbooks").length).toBeGreaterThan(0);
  });
});
