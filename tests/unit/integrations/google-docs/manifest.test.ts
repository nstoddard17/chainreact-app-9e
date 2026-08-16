/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-2 — Google Docs provider manifest invariants.
 */
import { googleDocsManifest } from "@/integrations/google-docs/manifest";
import { ProviderManifestSchema } from "@/contracts/integration";

import { getProvider } from "@/integrations/_registry";
import { getActionHandler } from "@/services/execution/handlers/_registry";
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

  it("enables webhookTrigger (Slice 3.GDOCS-5 — new_document + document_updated via Drive files.watch)", () => {
    expect(googleDocsManifest.capabilities.webhookTrigger).toBe(true);
  });

  it("DOES NOT enable pollingTrigger — both triggers go through Drive watch", () => {
    expect(googleDocsManifest.capabilities.pollingTrigger).toBe(false);
  });
});

describe("google-docs manifest — scopes", () => {
  it("requires drive + userinfo.email (documents retired — drive authorizes the whole Docs surface)", () => {
    expect(googleDocsManifest.scopes.required).toEqual([
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/userinfo.email",
    ]);
  });

  it("DOES NOT include documents or documents.readonly (GOOGLE-OAUTH-SCOPE-DISCREPANCY-CLOSEOUT-1: every Docs API method we call accepts drive, so documents granted nothing)", () => {
    expect(googleDocsManifest.scopes.required).not.toContain(
      "https://www.googleapis.com/auth/documents",
    );
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

// ---------------------------------------------------------------------------
// Merged from the former sibling _registry.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// Slice 3.GDOCS-2 — Google Docs registry sanity.
// Pins:
// - Provider manifest registered at id "google-docs".
// - All 5 action handlers registered against canonical
// (provider, type) keys.
// - googleDocsOAuth wired in the OAuth dispatcher's map.
// ---------------------------------------------------------------------------

describe("google-docs registry — manifest", () => {
  it("registers the google-docs provider manifest at id 'google-docs'", () => {
    const manifest = getProvider("google-docs");
    expect(manifest).toBeDefined();
    expect(manifest?.id).toBe("google-docs");
  });
});

describe("google-docs registry — action handlers", () => {
  const EXPECTED_HANDLERS: ReadonlyArray<string> = [
    "create_document",
    "update_document",
    "share_document",
    "get_document",
    "export_document",
  ];

  it.each(EXPECTED_HANDLERS)(
    "registers google-docs:%s handler",
    (type) => {
      expect(getActionHandler("google-docs", type)).toBeDefined();
    },
  );

  it("does NOT register any unsupported google-docs action types", () => {
    // Defense-in-depth — a future careless registration that adds
    // e.g. "delete_document" without going through the audit / metas
    // split would surface here.
    expect(getActionHandler("google-docs", "delete_document")).toBeUndefined();
    expect(getActionHandler("google-docs", "rename_document")).toBeUndefined();
  });
});

describe("google-docs registry — OAuth dispatcher wiring", () => {
  it("googleDocsOAuth is exported and exposes the ProviderOAuth contract", async () => {
    const { googleDocsOAuth } = await import(
      "@/integrations/google-docs/oauth"
    );
    expect(typeof googleDocsOAuth.buildAuthUrl).toBe("function");
    expect(typeof googleDocsOAuth.handleCallback).toBe("function");
    expect(typeof googleDocsOAuth.refreshToken).toBe("function");
  });
});
