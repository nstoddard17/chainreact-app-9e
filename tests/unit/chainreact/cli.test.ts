/**
 * @jest-environment node
 *
 * Internal ChainReact operator CLI (scripts/chainreact/*). Tests the pure command
 * logic + dispatch with an in-memory filesystem and a fake runner — no disk, no
 * spawned processes, no network. Covers: arg parsing, help, status, app-validate
 * (failure + structural findings), verify planning/execution, mcp-smoke wrapping,
 * and end-to-end dispatch via run().
 */
import { parseArgs, wantsHelp } from "@/scripts/chainreact/args";
import { run } from "@/scripts/chainreact/cli";
import { renderValidation, validateProvider } from "@/scripts/chainreact/commands/appValidate";
import { runMcpSmoke } from "@/scripts/chainreact/commands/mcpSmoke";
import { collectStatus, renderStatus } from "@/scripts/chainreact/commands/status";
import { buildVerifyPlan, executeVerify } from "@/scripts/chainreact/commands/verify";
import { helpText } from "@/scripts/chainreact/help";
import type { FsDeps } from "@/scripts/chainreact/repo";
import type { CommandRunner, RunResult } from "@/scripts/chainreact/runner";

// ── in-memory FsDeps fake ──────────────────────────────────────────────────
function fakeFs(files: Record<string, string>): FsDeps {
  const norm = (p: string): string => p.split("\\").join("/").replace(/\/+$/, "");
  const fileMap = new Map<string, string>();
  const dirSet = new Set<string>();
  for (const [k, v] of Object.entries(files)) {
    const n = norm(k);
    fileMap.set(n, v);
    const parts = n.split("/");
    for (let i = 1; i < parts.length; i += 1) dirSet.add(parts.slice(0, i).join("/"));
  }
  return {
    exists: (p) => fileMap.has(norm(p)) || dirSet.has(norm(p)),
    isDirectory: (p) => dirSet.has(norm(p)),
    listDir: (p) => {
      const n = norm(p);
      const out = new Set<string>();
      for (const f of fileMap.keys()) {
        if (f.startsWith(`${n}/`)) {
          const rest = f.slice(n.length + 1).split("/")[0];
          if (rest) out.add(rest);
        }
      }
      return [...out];
    },
    readText: (p) => fileMap.get(norm(p)) ?? "",
  };
}

// fake runner that records the npm scripts it was asked to run
function fakeRunner(byScript: Record<string, number> = {}): CommandRunner & { calls: string[] } {
  const calls: string[] = [];
  const fn = ((npmScript: string): RunResult => {
    calls.push(npmScript);
    const status = npmScript in byScript ? (byScript[npmScript] as number) : 0;
    return { status, stdout: "", stderr: "" };
  }) as CommandRunner & { calls: string[] };
  fn.calls = calls;
  return fn;
}

const SLACK_MANIFEST = 'ProviderManifestSchema.parse({ id: "slack", displayName: "Slack", isEnabled: true });';

describe("parseArgs", () => {
  it("parses a flat command with flags and --key=value", () => {
    const p = parseArgs(["verify", "--run", "--mode=fast"]);
    expect(p.command).toBe("verify");
    expect(p.subcommand).toBeNull();
    expect(p.flags.run).toBe(true);
    expect(p.flags.mode).toBe("fast");
  });

  it("treats mcp/app second token as a subcommand, others as positionals", () => {
    expect(parseArgs(["mcp", "smoke"]).subcommand).toBe("smoke");
    const app = parseArgs(["app", "validate", "slack"]);
    expect(app.command).toBe("app");
    expect(app.subcommand).toBe("validate");
    expect(app.positionals).toEqual(["slack"]);
  });

  it("detects help and empty command", () => {
    expect(wantsHelp(parseArgs(["--help"]))).toBe(true);
    expect(wantsHelp(parseArgs(["-h"]))).toBe(true);
    expect(wantsHelp(parseArgs([]))).toBe(true);
    expect(wantsHelp(parseArgs(["status"]))).toBe(false);
  });
});

describe("help", () => {
  it("documents the commands and the non-product safety posture", () => {
    const h = helpText();
    expect(h).toMatch(/NOT a customer-facing product/i);
    for (const c of ["status", "verify", "mcp smoke", "app validate"]) expect(h).toContain(c);
    expect(h).toMatch(/no database writes/i);
  });
});

describe("status", () => {
  it("collects a deterministic report over injected deps", () => {
    const fs = fakeFs({
      "package.json": "{}",
      "package-lock.json": "{}",
      "tsconfig.json": "{}",
      "jest.config.mjs": "",
      "CLAUDE.md": "",
      "docs/PROJECT_MEMORY.md": "",
      "docs/rules/provider-registry.md": "",
      "docs/rules/testing-strategy.md": "",
      "integrations/slack/manifest.ts": SLACK_MANIFEST,
      "integrations/gmail/manifest.ts": "x",
      "services/discovery/_registry.ts": "",
      "scripts/mcp/server.ts": "",
    });
    const report = collectStatus(
      { nodeVersion: "v20.0.0", platform: "linux", cwd: "/repo", repoRoot: "/repo" },
      fs,
    );
    expect(report.cwdInsideRepo).toBe(true);
    expect(report.packageManager).toBe("npm");
    expect(report.providerManifestCount).toBe(2);
    expect(report.ruleDocCount).toBe(2);
    const out = renderStatus(report);
    expect(out).toContain("repo root:");
    expect(out).toContain("All key project files present.");
    expect(out).not.toMatch(/token|secret|password/i);
  });

  it("flags missing key files", () => {
    const report = collectStatus(
      { nodeVersion: "v20.0.0", platform: "linux", cwd: "/repo", repoRoot: "/repo" },
      fakeFs({ "package.json": "{}" }),
    );
    expect(renderStatus(report)).toMatch(/Missing \d+ key file/);
  });
});

describe("app validate", () => {
  it("returns an actionable failure for an unknown provider (and lists known ones)", () => {
    const fs = fakeFs({ "integrations/slack/manifest.ts": SLACK_MANIFEST });
    const result = validateProvider("nope", fs);
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.code).toBe("PROVIDER_NOT_FOUND");
    expect(renderValidation(result)).toContain("slack");
  });

  it("errors when manifest.ts is missing", () => {
    const fs = fakeFs({ "integrations/foo/actions/x.ts": "" });
    const result = validateProvider("foo", fs);
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === "MANIFEST_MISSING")).toBe(true);
  });

  it("flags an id mismatch between manifest and folder", () => {
    const fs = fakeFs({ "integrations/slack/manifest.ts": 'parse({ id: "slackk", displayName: "S", isEnabled: true })' });
    const result = validateProvider("slack", fs);
    expect(result.findings.some((f) => f.code === "MANIFEST_ID_MISMATCH")).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("flags orphan meta (meta without handler) as an error", () => {
    const fs = fakeFs({
      "integrations/slack/manifest.ts": SLACK_MANIFEST,
      "integrations/slack/actions/sendMessage.meta.ts": "",
    });
    const result = validateProvider("slack", fs);
    expect(result.findings.some((f) => f.code === "ORPHAN_META")).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("warns when an action unit (handler+schema) lacks a meta", () => {
    const fs = fakeFs({
      "integrations/slack/manifest.ts": SLACK_MANIFEST,
      "integrations/slack/actions/sendMessage.ts": "",
      "integrations/slack/actions/sendMessage.schema.ts": "",
    });
    const result = validateProvider("slack", fs);
    expect(result.ok).toBe(true); // warning, not error
    expect(result.findings.some((f) => f.code === "ACTION_META_GAP")).toBe(true);
    expect(result.counts.actionHandlers).toBe(1);
  });

  it("passes a well-formed provider with the full triad", () => {
    const fs = fakeFs({
      "integrations/slack/manifest.ts": SLACK_MANIFEST,
      "integrations/slack/actions/sendMessage.ts": "",
      "integrations/slack/actions/sendMessage.meta.ts": "",
      "integrations/slack/actions/sendMessage.schema.ts": "",
      "integrations/slack/actions/_helper.ts": "", // helper: no schema/meta → not flagged
    });
    const result = validateProvider("slack", fs);
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(renderValidation(result)).toContain("PASS");
  });
});

describe("verify", () => {
  it("dry-run by default runs nothing", () => {
    const plan = buildVerifyPlan({ run: false, withTests: false });
    expect(plan.mode).toBe("dry-run");
    expect(plan.steps.every((s) => !s.willRun)).toBe(true);
  });

  it("--run executes the safe subset (no heavy test step) via the runner", () => {
    const plan = buildVerifyPlan({ run: true, withTests: false });
    const runner = fakeRunner();
    const outcome = executeVerify(plan, runner, new Set(["lint:structure", "typecheck", "lint", "test"]));
    expect(runner.calls).toEqual(["lint:structure", "typecheck", "lint"]);
    expect(runner.calls).not.toContain("test");
    expect(outcome.allPassed).toBe(true);
  });

  it("--with-tests includes the heavy full-suite step", () => {
    const plan = buildVerifyPlan({ run: true, withTests: true });
    const runner = fakeRunner();
    executeVerify(plan, runner, new Set(["lint:structure", "typecheck", "lint", "test"]));
    expect(runner.calls).toContain("test");
  });

  it("fails fast on the first failing check", () => {
    const plan = buildVerifyPlan({ run: true, withTests: false });
    const runner = fakeRunner({ typecheck: 1 });
    const outcome = executeVerify(plan, runner, new Set(["lint:structure", "typecheck", "lint"]));
    expect(runner.calls).toEqual(["lint:structure", "typecheck"]); // stopped before lint
    expect(outcome.allPassed).toBe(false);
  });

  it("skips (does not run) a planned script missing from package.json", () => {
    const plan = buildVerifyPlan({ run: true, withTests: false });
    const runner = fakeRunner();
    const outcome = executeVerify(plan, runner, new Set(["typecheck"]));
    expect(runner.calls).toEqual(["typecheck"]);
    expect(outcome.skippedMissing).toEqual(expect.arrayContaining(["lint:structure", "lint"]));
  });
});

describe("mcp smoke", () => {
  it("dry-run prints the command without invoking the runner", () => {
    const runner = fakeRunner();
    const r = runMcpSmoke({ dryRun: true }, runner, new Set(["mcp:smoke"]));
    expect(runner.calls).toEqual([]);
    expect(r.message).toContain("npm run mcp:smoke");
  });

  it("runs the existing mcp:smoke script when present", () => {
    const runner = fakeRunner();
    const r = runMcpSmoke({ dryRun: false }, runner, new Set(["mcp:smoke"]));
    expect(runner.calls).toEqual(["mcp:smoke"]);
    expect(r.status).toBe(0);
  });

  it("fails gracefully when the mcp:smoke script is absent", () => {
    const runner = fakeRunner();
    const r = runMcpSmoke({ dryRun: false }, runner, new Set());
    expect(runner.calls).toEqual([]);
    expect(r.ran).toBe(false);
    expect(r.message).toMatch(/no "mcp:smoke" script/);
  });
});

describe("run() dispatch", () => {
  const baseRuntime = { nodeVersion: "v20.0.0", platform: "linux", cwd: "/repo", repoRoot: "/repo" };
  const baseFs = () =>
    fakeFs({
      "package.json": JSON.stringify({ scripts: { "lint:structure": "x", typecheck: "x", lint: "x", test: "x", "mcp:smoke": "x" } }),
      "integrations/slack/manifest.ts": SLACK_MANIFEST,
    });

  it("prints help for no args and returns 0", () => {
    const out: string[] = [];
    const code = run([], { log: (l) => out.push(l) });
    expect(code).toBe(0);
    expect(out.join("\n")).toMatch(/internal operator CLI/i);
  });

  it("status → 0", () => {
    const out: string[] = [];
    const code = run(["status"], { fs: baseFs(), runtime: baseRuntime, log: (l) => out.push(l) });
    expect(code).toBe(0);
    expect(out.join("\n")).toContain("ChainReact — local status");
  });

  it("app validate <missing> → exit 1 with actionable error", () => {
    const out: string[] = [];
    const code = run(["app", "validate", "ghost"], { fs: baseFs(), runtime: baseRuntime, log: (l) => out.push(l) });
    expect(code).toBe(1);
    expect(out.join("\n")).toContain("PROVIDER_NOT_FOUND");
  });

  it("verify --run dispatches to the injected runner (no real shelling)", () => {
    const runner = fakeRunner();
    const code = run(["verify", "--run"], { fs: baseFs(), runtime: baseRuntime, runner, availableScripts: new Set(["lint:structure", "typecheck", "lint"]), log: () => {} });
    expect(code).toBe(0);
    expect(runner.calls).toEqual(["lint:structure", "typecheck", "lint"]);
  });

  it("unknown command → exit 2", () => {
    const code = run(["frobnicate"], { fs: baseFs(), runtime: baseRuntime, log: () => {} });
    expect(code).toBe(2);
  });

  it("mcp with a bad subcommand → exit 2", () => {
    const code = run(["mcp", "explode"], { fs: baseFs(), runtime: baseRuntime, log: () => {} });
    expect(code).toBe(2);
  });
});
