/** @jest-environment node */
import {
  ProviderManifestSchema,
  isMachineCredentialAuthFlow,
} from "@/contracts/integration";

/**
 * Manifest validation for the `machine_credentials` auth flow (client_credentials
 * + mTLS): tokens are minted server-to-server, so such providers must NOT be
 * refreshable and must NOT declare the OAuth capability (they use the machine
 * connect path, not the redirect dispatcher).
 */

function baseManifest(over: Record<string, unknown> = {}) {
  return {
    id: "adp",
    displayName: "ADP",
    isEnabled: false,
    tokenScope: "workspace" as const,
    accountIdField: "organizationOID",
    authFlow: "machine_credentials" as const,
    scopes: { required: [], optional: [] },
    capabilities: { oauth: false, actions: true, webhookTrigger: false, pollingTrigger: false },
    healthCheckIntervalMs: 3_600_000,
    refreshable: false,
    ...over,
  };
}

describe("machine_credentials manifest rules", () => {
  it("accepts a valid machine-credential manifest (oauth:false, refreshable:false)", () => {
    const parsed = ProviderManifestSchema.safeParse(baseManifest());
    expect(parsed.success).toBe(true);
  });

  it("rejects a refreshable machine-credential provider", () => {
    const parsed = ProviderManifestSchema.safeParse(baseManifest({ refreshable: true }));
    expect(parsed.success).toBe(false);
  });

  it("rejects a machine-credential provider that declares the oauth capability", () => {
    const parsed = ProviderManifestSchema.safeParse(
      baseManifest({
        capabilities: { oauth: true, actions: true, webhookTrigger: false, pollingTrigger: false },
        scopes: { required: ["dummy"], optional: [] },
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("isMachineCredentialAuthFlow classifies the flow", () => {
    expect(isMachineCredentialAuthFlow("machine_credentials")).toBe(true);
    expect(isMachineCredentialAuthFlow("code_callback")).toBe(false);
    expect(isMachineCredentialAuthFlow("token_paste")).toBe(false);
  });
});
