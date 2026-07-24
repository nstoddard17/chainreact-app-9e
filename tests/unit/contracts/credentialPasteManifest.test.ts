/**
 * @jest-environment node
 *
 * Contract invariants for the `credential_paste` auth flow (FLEETIO-1).
 *
 * Business rules protected:
 *   - A credential-paste provider MUST declare its user-entered fields
 *     (that is what the shared form renders — no fields ⇒ an unconnectable
 *     provider shipping silently).
 *   - Credential-paste providers can NEVER be refreshable (the pasted
 *     credentials ARE the long-lived secret).
 *   - `credentialFields` / `credentialGuide` outside credential_paste is a
 *     misconfiguration and must fail the build, not render a broken form.
 *   - The scope invariant for OAuth-capable manifests still holds for every
 *     OTHER flow — the credential-paste exemption must not weaken Trello/Eden
 *     (token flows) or classic OAuth manifests.
 */
import { ProviderManifestSchema } from "@/contracts/integration";

const BASE = {
  id: "fixture-paste",
  displayName: "Fixture Paste",
  isEnabled: true,
  isExperimental: false,
  apiVersion: "2026-01-01",
  tokenScope: "user",
  oauthFlows: ["api_key"],
  scopes: { required: [], optional: [], deprecated: [] },
  capabilities: {
    oauth: true,
    webhookTrigger: false,
    pollingTrigger: false,
    actions: false,
  },
  healthCheckIntervalMs: 60_000,
  refreshable: false,
  authFlow: "credential_paste",
  credentialFields: [
    { id: "apiKey", label: "API key" },
    { id: "accountToken", label: "Account token" },
  ],
} as const;

describe("credential_paste manifest invariants", () => {
  it("accepts a valid two-field credential_paste manifest (fields default secret+required)", () => {
    const parsed = ProviderManifestSchema.parse(BASE);
    expect(parsed.authFlow).toBe("credential_paste");
    expect(parsed.credentialFields).toHaveLength(2);
    for (const f of parsed.credentialFields!) {
      expect(f.secret).toBe(true);
      expect(f.required).toBe(true);
    }
  });

  it("allows empty scopes.required for credential_paste even with capabilities.oauth (role-based access, no scope negotiation)", () => {
    expect(() => ProviderManifestSchema.parse(BASE)).not.toThrow();
  });

  it("rejects credential_paste + refreshable:true (nothing to refresh)", () => {
    expect(() =>
      ProviderManifestSchema.parse({ ...BASE, refreshable: true }),
    ).toThrow(/cannot be refreshable/);
  });

  it("rejects credential_paste with no credentialFields", () => {
    const { credentialFields: _omit, ...rest } = BASE;
    expect(() => ProviderManifestSchema.parse(rest)).toThrow(/credentialFields/);
  });

  it("rejects credential_paste with an empty credentialFields array", () => {
    expect(() =>
      ProviderManifestSchema.parse({ ...BASE, credentialFields: [] }),
    ).toThrow(/at least one credentialFields entry/);
  });

  it("rejects duplicate credential field ids", () => {
    expect(() =>
      ProviderManifestSchema.parse({
        ...BASE,
        credentialFields: [
          { id: "apiKey", label: "A" },
          { id: "apiKey", label: "B" },
        ],
      }),
    ).toThrow(/Duplicate credential field id/);
  });

  it("rejects credentialFields on a code_callback manifest", () => {
    expect(() =>
      ProviderManifestSchema.parse({
        ...BASE,
        authFlow: "code_callback",
        scopes: { required: ["read"], optional: [], deprecated: [] },
      }),
    ).toThrow(/only valid for authFlow='credential_paste'/);
  });

  it("rejects credentialGuide on a token_paste manifest", () => {
    expect(() =>
      ProviderManifestSchema.parse({
        ...BASE,
        authFlow: "token_paste",
        scopes: { required: ["read"], optional: [], deprecated: [] },
        credentialFields: undefined,
        credentialGuide: { intro: "x", steps: [] },
      }),
    ).toThrow(/only valid for authFlow='credential_paste'/);
  });

  it("still rejects empty scopes.required for a NON-credential_paste OAuth manifest (exemption does not leak)", () => {
    expect(() =>
      ProviderManifestSchema.parse({
        ...BASE,
        authFlow: "code_callback",
        credentialFields: undefined,
        scopes: { required: [], optional: [], deprecated: [] },
      }),
    ).toThrow(/at least one required scope/);
  });

  it("still rejects token_ingest + refreshable:true (existing invariant untouched)", () => {
    expect(() =>
      ProviderManifestSchema.parse({
        ...BASE,
        authFlow: "token_ingest",
        credentialFields: undefined,
        scopes: { required: ["read"], optional: [], deprecated: [] },
        refreshable: true,
      }),
    ).toThrow(/cannot be refreshable/);
  });
});
