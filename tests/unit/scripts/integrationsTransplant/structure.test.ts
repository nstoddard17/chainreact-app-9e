/** @jest-environment node */
/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — structural invariants:
 *   - the utility can never activate workflows or register/copy trigger
 *     lifecycle state (no such module is even imported);
 *   - the CLI reuses the CANONICAL environment guard (no second
 *     production-detection system);
 *   - trigger/webhook/oauth-state tables are never referenced;
 *   - destination writes go through the canonical repository boundary.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "scripts", "integrations-transplant");
const files = readdirSync(DIR).filter((f) => f.endsWith(".ts"));
const sources = new Map(files.map((f) => [f, readFileSync(path.join(DIR, f), "utf8")]));
const all = [...sources.values()].join("\n");

describe("transplant utility structure", () => {
  it("covers the expected module set", () => {
    for (const expected of [
      "cli.ts",
      "orchestrator.ts",
      "preflight.ts",
      "sourceReader.ts",
      "destination.ts",
      "classification.ts",
      "verificationProbes.ts",
      "config.ts",
      "redact.ts",
      "report.ts",
      "types.ts",
    ]) {
      expect(files).toContain(expected);
    }
  });

  it("never imports workflow-activation or trigger machinery", () => {
    for (const forbidden of [
      /services\/triggers/,
      /services\/workflows/,
      /activationRegistry/,
      /pollingRegistry/,
      /subscriptionRegistry/,
      /repositories\/triggerResources/,
      /repositories\/webhookEventDedup/,
      /repositories\/oauthStates/,
      /services\/oauth\/dispatcher/,
    ]) {
      expect(all).not.toMatch(forbidden);
    }
  });

  it("never references trigger/webhook/oauth-state tables", () => {
    for (const forbidden of [
      /from\(["']trigger_resources["']\)/,
      /from\(["']webhook_event_dedup["']\)/,
      /from\(["']oauth_states["']\)/,
      /from\(["']workflows["']\)/,
      /from\(["']workflow_runs["']\)/,
    ]) {
      expect(all).not.toMatch(forbidden);
    }
  });

  it("the CLI imports the canonical env-target guard (single production-detection system)", () => {
    const cli = sources.get("cli.ts")!;
    expect(cli).toMatch(/from "\.\.\/lib\/env-target\.mjs"/);
    expect(cli).toMatch(/PRODUCTION_PROJECT_REF/);
    expect(cli).toMatch(/resolveDbTarget/);
    // And no module hardcodes any 20-char project ref of its own.
    expect(all).not.toMatch(/qcepijemjlkssfkvzlio|syvnzqzctnywakgyykmz/);
  });

  it("destination writes go through the canonical repository (upsertActive import)", () => {
    const destination = sources.get("destination.ts")!;
    expect(destination).toMatch(/@\/repositories\/integrations/);
    expect(destination).toMatch(/upsertActive/);
    // The only direct table access in destination.ts is the rollback pair.
    const directTableOps = destination.match(/\.from\("integrations"\)\.(\w+)\(/g) ?? [];
    expect(directTableOps.every((op) => op.includes(".delete(") || op.includes(".update("))).toBe(
      true,
    );
  });

  it("the orchestrator never constructs a Supabase client (ports only)", () => {
    const orchestrator = sources.get("orchestrator.ts")!;
    expect(orchestrator).not.toMatch(/createClient|supabase-js/);
  });

  it("no module reads .env.local (production env file)", () => {
    // String-literal usage only — the CLI's comment explaining WHY .env.local
    // is excluded is allowed; code loading it is not.
    expect(all).not.toMatch(/["'`]\.env\.local["'`]/);
    const cli = sources.get("cli.ts")!;
    const loaded = cli.match(/"\.env[^"]*"/g) ?? [];
    expect(loaded.sort()).toEqual(['".env.development.local"', '".env.transplant.local"']);
  });
});
