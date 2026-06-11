/**
 * Protects the internal MCP server's provider-manifest summarizer.
 *
 * Business rule (task brief): a provider manifest is TEXT-PARSED, never
 * imported/executed — importing it would run provider/app code (the manifest
 * calls ProviderManifestSchema.parse at module load). A regression that
 * switched to dynamic import would execute side effects and could pull a DB /
 * service-role client into the dev tool.
 */
import { summarizeManifestText } from "@/scripts/mcp/lib/manifestSummary";
import { providerTools } from "@/scripts/mcp/tools/providers";

describe("internal MCP provider manifest summary", () => {
  it("summarizes manifest text WITHOUT executing side-effectful code in it", () => {
    // If this text were ever `import()`-ed, the throw / process.exit would fire.
    const hostile = [
      'throw new Error("manifest body executed");',
      "process.exit(1);",
      "export const x = ProviderManifestSchema.parse({",
      '  id: "evilcorp",',
      '  displayName: "Evil Corp",',
      "  isEnabled: true,",
      "  isExperimental: false,",
      '  apiVersion: "v9",',
      '  tokenScope: "user",',
      '  authFlow: "code_callback",',
      "  refreshable: false,",
      "  healthCheckIntervalMs: 1000,",
      "  capabilities: { oauth: true, webhookTrigger: false, pollingTrigger: true, actions: true },",
      "});",
    ].join("\n");

    const summary = summarizeManifestText("evilcorp", hostile);

    expect(summary.declaredId).toBe("evilcorp");
    expect(summary.displayName).toBe("Evil Corp");
    expect(summary.isEnabled).toBe(true);
    expect(summary.apiVersion).toBe("v9");
    expect(summary.capabilities.oauth).toBe(true);
    expect(summary.capabilities.webhookTrigger).toBe(false);
    expect(summary.capabilities.pollingTrigger).toBe(true);
    expect(summary.capabilities.actions).toBe(true);
    expect(summary.refreshable).toBe(false);
  });

  it("reports null for fields it cannot find rather than guessing", () => {
    const summary = summarizeManifestText("unknown", "export const nope = 1;");
    expect(summary.declaredId).toBeNull();
    expect(summary.displayName).toBeNull();
    expect(summary.capabilities.actions).toBeNull();
    expect(summary.notes).toContain("capabilities block not found in text");
  });

  it("summarizes the real Slack manifest through the provider tool", async () => {
    const tool = providerTools.find(
      (t) => t.name === "get_provider_manifest_summary",
    );
    expect(tool).toBeDefined();
    const out = String(await tool!.handler({ provider: "slack" }));
    expect(out).toContain("provider: slack");
    expect(out).toContain("actions=true");
    expect(out).toContain("refreshable: false");
  });

  it("refuses an invalid provider id", async () => {
    const tool = providerTools.find(
      (t) => t.name === "get_provider_manifest_summary",
    )!;
    const out = String(await tool.handler({ provider: "../etc" }));
    expect(out).toContain("invalid provider id");
  });
});
