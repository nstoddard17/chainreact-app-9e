/** @jest-environment node */
/**
 * Protects the internal MCP server's provider-manifest summarizer.
 *
 * Business rule (task brief): a provider manifest is TEXT-PARSED, never
 * imported/executed — importing it would run provider/app code (the manifest
 * calls ProviderManifestSchema.parse at module load). A regression that
 * switched to dynamic import would execute side effects and could pull a DB /
 * service-role client into the dev tool.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { summarizeManifestText } from "@/scripts/mcp/lib/manifestSummary";
import { providerTools } from "@/scripts/mcp/tools/providers";

const REPO_ROOT = resolve(__dirname, "../../..");
const SLACK_MANIFEST_TEXT = readFileSync(
  resolve(REPO_ROOT, "integrations/slack/manifest.ts"),
  "utf8",
);

/** The exact Slack scope sets declared in integrations/slack/manifest.ts. */
const SLACK_REQUIRED_SCOPES = [
  "channels:history",
  "channels:read",
  "chat:write",
  "im:write",
  "reactions:write",
  "pins:write",
  "im:history",
  "mpim:history",
  // CONFIG-FIELD-UX-SWEEP-4: slack:group_dms picker lists group DMs
  // (conversations.list types=mpim), which requires mpim:read.
  "mpim:read",
  "reactions:read",
  "groups:history",
  "groups:read",
  "channels:manage",
  "channels:join",
  "groups:write",
  "users:read",
  "files:read",
  "files:write",
];
const SLACK_OPTIONAL_SCOPES = ["chat:write.public"];

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
    // SLACK-TOKEN-ROTATION-1 — Slack implements a real refreshToken().
    expect(out).toContain("refreshable: true");
  });

  it("refuses an invalid provider id", async () => {
    const tool = providerTools.find(
      (t) => t.name === "get_provider_manifest_summary",
    )!;
    const out = String(await tool.handler({ provider: "../etc" }));
    expect(out).toContain("invalid provider id");
  });
});

describe("manifest scope extraction strips comments (Stage-2A fix)", () => {
  it("parses the REAL Slack scopes as the exact declared sets — no comment leakage", () => {
    const s = summarizeManifestText("slack", SLACK_MANIFEST_TEXT);

    // Exact required set (order-independent).
    expect([...(s.scopesRequired ?? [])].sort()).toEqual(
      [...SLACK_REQUIRED_SCOPES].sort(),
    );
    expect(s.scopesOptional).toEqual(SLACK_OPTIONAL_SCOPES);

    // No comment fragments / empties / prose / single-word noise leaked in.
    for (const scope of [...(s.scopesRequired ?? []), ...(s.scopesOptional ?? [])]) {
      expect(scope.length).toBeGreaterThan(0); // no empty entries
      expect(scope).not.toMatch(/\s/); // real scopes have no whitespace (prose would)
      expect(scope).not.toBe("group"); // the "group" comment-word from groups:write
      expect(scope.toLowerCase()).not.toContain("xoxp"); // comment-only token text
    }
    // Specific prose fragments that previously leaked are absent.
    const all = [...(s.scopesRequired ?? []), ...(s.scopesOptional ?? [])];
    expect(all).not.toContain("invite the bot first");
    expect(all.some((x) => x.includes("plan §"))).toBe(false);
  });

  it("falls back authFlow → oauthFlows when authFlow is absent (Slack shows 'v2', not null)", () => {
    const s = summarizeManifestText("slack", SLACK_MANIFEST_TEXT);
    expect(s.authFlow).toBe("v2");
    expect(s.authFlow).not.toBeNull();
  });

  it("excludes comment-quoted strings and survives '//' inside a real scope value", () => {
    const hostile = [
      "export const x = ProviderManifestSchema.parse({",
      '  id: "demo",',
      "  scopes: {",
      "    required: [",
      '      "a:read",',
      "      // this comment has 'apostrophes', \"quotes\", and a, comma",
      '      "b:write", // trailing comment, with comma',
      '      /* block "fake:scope" should NOT be captured */',
      '      "x:a//b",', // a real scope value containing // — must survive intact
      "    ],",
      "    optional: [",
      '      // comment-only "not:a:scope" here must be ignored',
      '      "opt:one",',
      "    ],",
      "    deprecated: [],",
      "  },",
      '  oauthFlows: ["v2"],',
      "});",
    ].join("\n");

    const s = summarizeManifestText("demo", hostile);
    expect(s.scopesRequired).toEqual(["a:read", "b:write", "x:a//b"]);
    expect(s.scopesRequired).not.toContain("fake:scope");
    expect(s.scopesOptional).toEqual(["opt:one"]);
    expect(s.scopesOptional).not.toContain("not:a:scope");
    expect(s.authFlow).toBe("v2");
  });
});
