/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-2 — Google Docs provider manifest invariants.
 */
import { googleDocsManifest } from "@/integrations/google-docs/manifest";
import { ProviderManifestSchema } from "@/contracts/integration";

describe("google-docs manifest — structural", () => {
  it("parses against ProviderManifestSchema", () => {
    expect(() => ProviderManifestSchema.parse(googleDocsManifest)).not.toThrow();
  });

  it("uses lowercase id matching the folder name", () => {
    expect(googleDocsManifest.id).toBe("google-docs");
  });

  it("displayName matches V2 convention", () => {
    expect(googleDocsManifest.displayName).toBe("Google Docs");
  });

  it("pins API version v1", () => {
    expect(googleDocsManifest.apiVersion).toBe("v1");
  });

  it("token scope is per-user (one integration per Google identity)", () => {
    expect(googleDocsManifest.tokenScope).toBe("user");
  });

  it("accountIdField is email (mirrors gmail/calendar/drive/sheets)", () => {
    expect(googleDocsManifest.accountIdField).toBe("email");
  });

  it("is refreshable — Google identity OAuth returns refresh tokens", () => {
    expect(googleDocsManifest.refreshable).toBe(true);
  });

  it("oauthFlows includes v2", () => {
    expect(googleDocsManifest.oauthFlows).toEqual(["v2"]);
  });
});

describe("google-docs manifest — capabilities", () => {
  it("enables OAuth", () => {
    expect(googleDocsManifest.capabilities.oauth).toBe(true);
  });

  it("enables actions (5 handlers ship in this slice)", () => {
    expect(googleDocsManifest.capabilities.actions).toBe(true);
  });

  it("DOES NOT enable webhookTrigger yet (flips in GDOCS-5 when Drive watch triggers ship)", () => {
    expect(googleDocsManifest.capabilities.webhookTrigger).toBe(false);
  });

  it("DOES NOT enable pollingTrigger — both triggers go through Drive watch", () => {
    expect(googleDocsManifest.capabilities.pollingTrigger).toBe(false);
  });
});

describe("google-docs manifest — scopes", () => {
  it("requires documents + drive + userinfo.email", () => {
    expect(googleDocsManifest.scopes.required).toEqual([
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/userinfo.email",
    ]);
  });

  it("DOES NOT include documents.readonly (single-scope-per-manifest convention)", () => {
    expect(googleDocsManifest.scopes.required).not.toContain(
      "https://www.googleapis.com/auth/documents.readonly",
    );
  });

  it("has no optional or deprecated scopes", () => {
    expect(googleDocsManifest.scopes.optional).toEqual([]);
    expect(googleDocsManifest.scopes.deprecated).toEqual([]);
  });
});

describe("google-docs manifest — health check", () => {
  it("uses 6h interval (Google product cohort)", () => {
    expect(googleDocsManifest.healthCheckIntervalMs).toBe(6 * 60 * 60 * 1000);
  });
});

describe("google-docs manifest — secret-shape guards", () => {
  it("does NOT expose any token / secret / clientSecret as a manifest field", () => {
    const serialized = JSON.stringify(googleDocsManifest).toLowerCase();
    expect(serialized).not.toMatch(/google_client_secret/);
    expect(serialized).not.toMatch(/client_secret/);
    expect(serialized).not.toMatch(/access_token/);
    expect(serialized).not.toMatch(/refresh_token/);
  });
});
