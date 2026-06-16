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
import { listProviders, renderProviderList } from "@/scripts/chainreact/commands/appList";
import { runAppRegister } from "@/scripts/chainreact/commands/appRegister";
import { buildScaffoldPlan, camelCaseId, humanizeId, normalizeProviderId, overlayFs, runAppScaffold } from "@/scripts/chainreact/commands/appScaffold";
import {
  buildRegistryPatch,
  detectRegistration,
  readManifestExportName,
  REGISTRY_PATH,
  registrationStatus,
  registryExportName,
} from "@/scripts/chainreact/registry";
import {
  renderValidation,
  renderValidationSummary,
  summarizeValidation,
  validateAllProviders,
  validateProvider,
  verdictOf,
} from "@/scripts/chainreact/commands/appValidate";
import { inventoryAllProviders, listKnownProviders } from "@/scripts/chainreact/providers";
import { checkManifestContent, checkMetaContent, hasTopLevelKey, parseZodEnum, stripCommentLines } from "@/scripts/chainreact/commands/metaChecks";
import { runMcpSmoke } from "@/scripts/chainreact/commands/mcpSmoke";
import { collectStatus, renderStatus } from "@/scripts/chainreact/commands/status";
import { buildVerifyPlan, executeVerify } from "@/scripts/chainreact/commands/verify";
import { helpText } from "@/scripts/chainreact/help";
import type { FsDeps, FsWriter } from "@/scripts/chainreact/repo";
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

// Complete provider manifest text (all contract-required keys present).
const manifestSrc = (id: string, enabled = true): string =>
  `ProviderManifestSchema.parse({ id: "${id}", displayName: "${id[0]?.toUpperCase()}${id.slice(1)}", isEnabled: ${enabled}, tokenScope: "user", scopes: { required: ["x"] }, capabilities: { oauth: true }, healthCheckIntervalMs: 1000, refreshable: true });`;
// Complete action/trigger meta literal text (all required top-level keys present).
const actionMetaSrc = (provider: string, type: string): string =>
  `import type { ActionMeta } from "@/contracts/actionMeta";\nexport const m: ActionMeta = { key: "${provider}:${type}", provider: "${provider}", type: "${type}", displayName: "X", description: "x", category: "messaging", requiresIntegration: true, fields: [] };`;
const triggerMetaSrc = (provider: string, type: string): string =>
  `import type { TriggerMeta } from "@/contracts/triggerMeta";\nexport const t: TriggerMeta = { key: "${provider}:${type}", provider: "${provider}", type: "${type}", displayName: "X", description: "x", category: "messaging", activation: "webhook", requiresIntegration: true, fields: [] };`;
const SLACK_MANIFEST = manifestSrc("slack");
const baseRuntime = { nodeVersion: "v20.0.0", platform: "linux", cwd: "/repo", repoRoot: "/repo" };

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
      "integrations/slack/actions/sendMessage.meta.ts": actionMetaSrc("slack", "send_message"),
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

// ── provider-wide: app validate --all + app list ────────────────────────────
// alpha = clean PASS; beta = WARN (handler+schema, no meta); gamma = FAIL
// (orphan meta); delta = PASS with the hubspot-style meta/ subfolder layout.
const mf = (id: string, enabled: boolean): string => manifestSrc(id, enabled);
const multiFs = (): FsDeps =>
  fakeFs({
    "integrations/alpha/manifest.ts": mf("alpha", true),
    "integrations/alpha/actions/createThing.ts": "",
    "integrations/alpha/actions/createThing.meta.ts": actionMetaSrc("alpha", "create_thing"),
    "integrations/alpha/actions/createThing.schema.ts": "",
    "integrations/alpha/triggers/onThing/onThing.meta.ts": triggerMetaSrc("alpha", "on_thing"),
    "integrations/beta/manifest.ts": mf("beta", false),
    "integrations/beta/actions/doBeta.ts": "",
    "integrations/beta/actions/doBeta.schema.ts": "", // no meta → ACTION_META_GAP (warning)
    "integrations/gamma/manifest.ts": mf("gamma", true),
    "integrations/gamma/actions/ghost.meta.ts": actionMetaSrc("gamma", "ghost"), // orphan meta → ERROR
    "integrations/delta/manifest.ts": mf("delta", true),
    "integrations/delta/actions/updateDelta.ts": "",
    "integrations/delta/actions/updateDelta.schema.ts": "",
    "integrations/delta/actions/meta/updateDelta.meta.ts": actionMetaSrc("delta", "update_delta"), // meta in subfolder (hubspot-style)
  });

describe("provider discovery", () => {
  it("lists providers deterministically (sorted by id)", () => {
    expect(listKnownProviders(multiFs())).toEqual(["alpha", "beta", "delta", "gamma"]);
    expect(validateAllProviders(multiFs()).map((r) => r.provider)).toEqual(["alpha", "beta", "delta", "gamma"]);
    expect(inventoryAllProviders(multiFs()).map((i) => i.id)).toEqual(["alpha", "beta", "delta", "gamma"]);
  });

  it("matches meta by basename (handler in actions/, meta in actions/meta/) → PASS", () => {
    const delta = validateProvider("delta", multiFs());
    expect(delta.ok).toBe(true);
    expect(delta.findings).toEqual([]);
    expect(verdictOf(delta)).toBe("PASS");
  });
});

describe("app validate --all", () => {
  it("summarizes pass/warn/fail and only errors fail the run", () => {
    const results = validateAllProviders(multiFs());
    const summary = summarizeValidation(results);
    expect(summary).toMatchObject({ total: 4, pass: 2, warn: 1, fail: 1, ok: false });
    expect(verdictOf(results[0]!)).toBe("PASS"); // alpha
    expect(verdictOf(results[1]!)).toBe("WARN"); // beta (warning only)
    expect(verdictOf(results[2]!)).toBe("PASS"); // delta
    expect(verdictOf(results[3]!)).toBe("FAIL"); // gamma
    // warnings must NOT flip a provider to fail
    expect(results[1]!.ok).toBe(true);
  });

  it("all-clean providers → summary ok", () => {
    const results = validateAllProviders(
      fakeFs({
        "integrations/alpha/manifest.ts": mf("alpha", true),
        "integrations/alpha/actions/createThing.ts": "",
        "integrations/alpha/actions/createThing.meta.ts": actionMetaSrc("alpha", "create_thing"),
        "integrations/alpha/actions/createThing.schema.ts": "",
      }),
    );
    expect(summarizeValidation(results).ok).toBe(true);
  });

  it("renders failures inline; hides warnings unless --verbose", () => {
    const results = validateAllProviders(multiFs());
    const concise = renderValidationSummary(results, { verbose: false });
    expect(concise).toContain("providers: 4  pass: 2  warn: 1  fail: 1");
    expect(concise).toContain("[FAIL] gamma");
    expect(concise).toContain("ORPHAN_META"); // failures always shown
    expect(concise).toContain("re-run with --verbose"); // warnings hidden by default
    expect(concise).not.toContain("ACTION_META_GAP");

    const verbose = renderValidationSummary(results, { verbose: true });
    expect(verbose).toContain("ACTION_META_GAP"); // beta's warning now shown
  });

  it("dispatch: `app validate --all` → exit 1 when any provider has errors", () => {
    const out: string[] = [];
    const code = run(["app", "validate", "--all"], { fs: multiFs(), runtime: baseRuntime, log: (l) => out.push(l) });
    expect(code).toBe(1);
    expect(out.join("\n")).toContain("FAILED");
  });

  it("dispatch: `app validate --all` → exit 0 when all pass", () => {
    const fs = fakeFs({
      "integrations/alpha/manifest.ts": mf("alpha", true),
      "integrations/alpha/actions/createThing.ts": "",
      "integrations/alpha/actions/createThing.meta.ts": "",
      "integrations/alpha/actions/createThing.schema.ts": "",
    });
    const code = run(["app", "validate", "--all"], { fs, runtime: baseRuntime, log: () => {} });
    expect(code).toBe(0);
  });
});

describe("app list", () => {
  it("inventories providers with safe text-derived fields", () => {
    const infos = listProviders(multiFs());
    expect(infos.map((i) => i.id)).toEqual(["alpha", "beta", "delta", "gamma"]);
    const beta = infos.find((i) => i.id === "beta")!;
    expect(beta.displayName).toBe("Beta");
    expect(beta.enabled).toBe(false);
    const alpha = infos.find((i) => i.id === "alpha")!;
    expect(alpha.enabled).toBe(true);
    expect(alpha.counts).toMatchObject({ actionHandlers: 1, actionMetas: 1, actionSchemas: 1, triggerMetas: 1 });
  });

  it("renders a deterministic table (no secrets)", () => {
    const out = renderProviderList(listProviders(multiFs()));
    expect(out).toContain("ChainReact — app list (4 provider(s))");
    expect(out).toContain("alpha");
    expect(out).toContain("displayName");
    expect(out).toMatch(/beta\s+Beta\s+no/); // enabled=false → "no"
    expect(out).not.toMatch(/token|secret|password/i);
  });

  it("dispatch: `app list` → exit 0", () => {
    const out: string[] = [];
    const code = run(["app", "list"], { fs: multiFs(), runtime: baseRuntime, log: (l) => out.push(l) });
    expect(code).toBe(0);
    expect(out.join("\n")).toContain("app list");
  });
});

describe("app subcommand usage", () => {
  it("`app validate` with neither provider nor --all → usage, exit 2", () => {
    const out: string[] = [];
    const code = run(["app", "validate"], { fs: multiFs(), runtime: baseRuntime, log: (l) => out.push(l) });
    expect(code).toBe(2);
    expect(out.join("\n")).toMatch(/Usage:.*app validate/);
  });

  it("unknown `app` subcommand → exit 2 and suggests list/validate", () => {
    const out: string[] = [];
    const code = run(["app", "bogus"], { fs: multiFs(), runtime: baseRuntime, log: (l) => out.push(l) });
    expect(code).toBe(2);
    expect(out.join("\n")).toMatch(/app list|app validate/);
  });
});

// ── deeper read-only metadata checks (action/trigger meta + manifest) ────────
// Single-provider fixture: complete manifest + one action triad, with an
// optional override for the action meta content + an optional trigger meta.
const deepFs = (
  actionMeta: string,
  opts: { manifest?: string; triggerMeta?: string } = {},
): FsDeps =>
  fakeFs({
    // Seed the contract files so the value allow-lists (category / tokenScope) load.
    "contracts/actionMeta.ts": 'export const ActionCategorySchema = z.enum(["messaging", "data", "email", "logic"]);',
    "contracts/integration.ts": 'export const TokenScopeSchema = z.enum(["user", "workspace"]);',
    "integrations/acme/manifest.ts": opts.manifest ?? manifestSrc("acme"),
    "integrations/acme/actions/doIt.ts": "",
    "integrations/acme/actions/doIt.schema.ts": "",
    "integrations/acme/actions/doIt.meta.ts": actionMeta,
    ...(opts.triggerMeta ? { "integrations/acme/triggers/onIt/onIt.meta.ts": opts.triggerMeta } : {}),
  });

describe("app validate — action meta completeness", () => {
  it("ERROR when a required top-level key is missing (category)", () => {
    const meta = `import type { ActionMeta } from "@/contracts/actionMeta";\nexport const m: ActionMeta = { key: "acme:do_it", provider: "acme", type: "do_it", displayName: "X", description: "x", requiresIntegration: true, fields: [] };`;
    const r = validateProvider("acme", deepFs(meta));
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.code === "ACTION_META_INCOMPLETE")).toBe(true);
  });

  it("ERROR when the meta declares a provider different from its folder", () => {
    const r = validateProvider("acme", deepFs(actionMetaSrc("wrong", "do_it")));
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.code === "ACTION_META_PROVIDER_MISMATCH")).toBe(true);
  });

  it("ERROR when the meta key is not prefixed with the provider", () => {
    const meta = actionMetaSrc("acme", "do_it").replace('"acme:do_it"', '"other:do_it"');
    const r = validateProvider("acme", deepFs(meta));
    expect(r.findings.some((f) => f.code === "ACTION_META_KEY_MISMATCH")).toBe(true);
  });

  it("WARNING (not error) + no crash for a non-analyzable / dynamic meta", () => {
    const r = validateProvider("acme", deepFs("export const m = buildMeta();"));
    expect(r.ok).toBe(true); // warning only — does not fail
    expect(r.findings.some((f) => f.code === "ACTION_META_NOT_ANALYZABLE")).toBe(true);
  });

  it("PASS for a complete, consistent action meta", () => {
    const r = validateProvider("acme", deepFs(actionMetaSrc("acme", "do_it")));
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
  });
});

describe("app validate — trigger meta completeness", () => {
  it("ERROR when a trigger meta is missing 'activation'", () => {
    const trig = `import type { TriggerMeta } from "@/contracts/triggerMeta";\nexport const t: TriggerMeta = { key: "acme:on_it", provider: "acme", type: "on_it", displayName: "X", description: "x", category: "messaging", requiresIntegration: true, fields: [] };`;
    const r = validateProvider("acme", deepFs(actionMetaSrc("acme", "do_it"), { triggerMeta: trig }));
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.code === "TRIGGER_META_INCOMPLETE")).toBe(true);
  });

  it("ERROR when a trigger meta declares a mismatched provider", () => {
    const r = validateProvider("acme", deepFs(actionMetaSrc("acme", "do_it"), { triggerMeta: triggerMetaSrc("wrong", "on_it") }));
    expect(r.findings.some((f) => f.code === "TRIGGER_META_PROVIDER_MISMATCH")).toBe(true);
  });

  it("PASS for a complete, consistent trigger meta", () => {
    const r = validateProvider("acme", deepFs(actionMetaSrc("acme", "do_it"), { triggerMeta: triggerMetaSrc("acme", "on_it") }));
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
  });
});

describe("app validate — manifest completeness", () => {
  it("ERROR when the manifest omits required fields (tokenScope/scopes/...)", () => {
    const bare = 'ProviderManifestSchema.parse({ id: "acme", displayName: "Acme", isEnabled: true });';
    const r = validateProvider("acme", deepFs(actionMetaSrc("acme", "do_it"), { manifest: bare }));
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.code === "MANIFEST_FIELD_MISSING")).toBe(true);
  });
});

describe("validate --all stays clean with deep checks; one drifted provider fails", () => {
  it("a provider with an incomplete meta flips the summary to fail", () => {
    const fs = fakeFs({
      "integrations/alpha/manifest.ts": manifestSrc("alpha"),
      "integrations/alpha/actions/createThing.ts": "",
      "integrations/alpha/actions/createThing.schema.ts": "",
      "integrations/alpha/actions/createThing.meta.ts": actionMetaSrc("alpha", "create_thing"),
      "integrations/zeta/manifest.ts": manifestSrc("zeta"),
      "integrations/zeta/actions/doZeta.ts": "",
      "integrations/zeta/actions/doZeta.schema.ts": "",
      // drifted: meta declares the wrong provider
      "integrations/zeta/actions/doZeta.meta.ts": actionMetaSrc("nope", "do_zeta"),
    });
    const results = validateAllProviders(fs);
    const summary = summarizeValidation(results);
    expect(summary.total).toBe(2);
    expect(summary.ok).toBe(false); // zeta has an ERROR
    expect(verdictOf(results[0]!)).toBe("PASS"); // alpha
    expect(verdictOf(results[1]!)).toBe("FAIL"); // zeta
  });
});

describe("metaChecks (pure)", () => {
  it("hasTopLevelKey matches a real key, not a substring like keyValueMaxRows", () => {
    expect(hasTopLevelKey("category: 'x'", "category")).toBe(true);
    expect(hasTopLevelKey("keyValueMaxRows: 4", "key")).toBe(false);
    expect(hasTopLevelKey("foo: 1", "category")).toBe(false);
  });

  it("checkMetaContent returns [] for a complete action meta", () => {
    expect(checkMetaContent(actionMetaSrc("acme", "do_it"), "action", "acme", "doIt")).toEqual([]);
  });

  it("checkManifestContent flags every missing required field", () => {
    const findings = checkManifestContent('ProviderManifestSchema.parse({ id: "acme" });', "acme");
    expect(findings.map((f) => f.code)).toEqual(["MANIFEST_FIELD_MISSING", "MANIFEST_FIELD_MISSING", "MANIFEST_FIELD_MISSING", "MANIFEST_FIELD_MISSING"]);
  });

  it("parseZodEnum extracts the enum values; null when not found", () => {
    const text = 'export const ActionCategorySchema = z.enum([\n  "messaging",\n  "data",\n]);';
    expect(parseZodEnum(text, "ActionCategorySchema")).toEqual(["messaging", "data"]);
    expect(parseZodEnum(text, "NopeSchema")).toBeNull();
  });

  it("stripCommentLines drops JSDoc / // lines but keeps code", () => {
    const text = ["/**", " * healthCheckIntervalMs: 12h", " */", "// a note", 'category: "data",'].join("\n");
    const code = stripCommentLines(text);
    expect(code).not.toContain("12h");
    expect(code).toContain('category: "data"');
  });
});

// ── value-level checks (category / tokenScope enums, literalness, shapes) ────
const CATS = new Set(["messaging", "data", "email", "logic"]);
const SCOPES = new Set(["user", "workspace"]);

describe("metaChecks — value checks (pure)", () => {
  it("ERROR when category value is not in the enum", () => {
    const meta = actionMetaSrc("acme", "do_it").replace('"messaging"', '"bogus"');
    const f = checkMetaContent(meta, "action", "acme", "doIt", { allowedCategories: CATS });
    expect(f.some((x) => x.code === "ACTION_META_CATEGORY_INVALID" && x.level === "error")).toBe(true);
  });

  it("PASS (no findings) when category value is valid", () => {
    const f = checkMetaContent(actionMetaSrc("acme", "do_it"), "action", "acme", "doIt", { allowedCategories: CATS });
    expect(f).toEqual([]);
  });

  it("WARNING (not error) + no crash for a non-literal/dynamic category", () => {
    const meta = `import type { ActionMeta } from "@/contracts/actionMeta";\nexport const m: ActionMeta = { key: "acme:do_it", provider: "acme", type: "do_it", displayName: "X", description: "x", category: CATEGORY, requiresIntegration: true, fields: [] };`;
    const f = checkMetaContent(meta, "action", "acme", "doIt", { allowedCategories: CATS });
    expect(f.some((x) => x.code === "ACTION_META_CATEGORY_NOT_LITERAL" && x.level === "warning")).toBe(true);
    expect(f.some((x) => x.level === "error")).toBe(false);
  });

  it("category value is read from CODE, not from a JSDoc comment mention", () => {
    const meta = `/**\n * category: "bogus" (this is prose, must be ignored)\n */\nimport type { ActionMeta } from "@/contracts/actionMeta";\nexport const m: ActionMeta = { key: "acme:do_it", provider: "acme", type: "do_it", displayName: "X", description: "x", category: "data", requiresIntegration: true, fields: [] };`;
    const f = checkMetaContent(meta, "action", "acme", "doIt", { allowedCategories: CATS });
    expect(f).toEqual([]); // the real (code) category "data" is valid; comment "bogus" is ignored
  });

  it("WARNING when requiresIntegration is not a true/false literal", () => {
    const meta = actionMetaSrc("acme", "do_it").replace("requiresIntegration: true", "requiresIntegration: needsAuth");
    const f = checkMetaContent(meta, "action", "acme", "doIt", { allowedCategories: CATS });
    expect(f.some((x) => x.code === "ACTION_META_REQUIRES_INTEGRATION_NOT_BOOLEAN" && x.level === "warning")).toBe(true);
  });

  it("WARNING when fields is not an array literal", () => {
    const meta = actionMetaSrc("acme", "do_it").replace("fields: []", "fields: buildFields()");
    const f = checkMetaContent(meta, "action", "acme", "doIt", { allowedCategories: CATS });
    expect(f.some((x) => x.code === "ACTION_META_FIELDS_NOT_ARRAY" && x.level === "warning")).toBe(true);
  });

  it("manifest: ERROR for an invalid tokenScope value", () => {
    const m = manifestSrc("acme").replace('tokenScope: "user"', 'tokenScope: "galaxy"');
    const f = checkManifestContent(m, "acme", { allowedTokenScopes: SCOPES });
    expect(f.some((x) => x.code === "MANIFEST_TOKENSCOPE_INVALID" && x.level === "error")).toBe(true);
  });

  it("manifest: WARNING when scopes is not an object literal", () => {
    const m = manifestSrc("acme").replace("scopes: { required: [\"x\"] }", "scopes: buildScopes()");
    const f = checkManifestContent(m, "acme", { allowedTokenScopes: SCOPES });
    expect(f.some((x) => x.code === "MANIFEST_SCOPES_NOT_OBJECT" && x.level === "warning")).toBe(true);
  });

  it("manifest: a JSDoc 'healthCheckIntervalMs: 12h' mention does not cause a finding", () => {
    const m = `/**\n * healthCheckIntervalMs: 12h — tier note\n */\n${manifestSrc("acme")}`;
    const f = checkManifestContent(m, "acme", { allowedTokenScopes: SCOPES });
    expect(f).toEqual([]);
  });
});

describe("app validate — value checks end-to-end + --all", () => {
  it("an invalid category fails the provider via validateProvider", () => {
    const meta = actionMetaSrc("acme", "do_it").replace('"messaging"', '"bogus"');
    const r = validateProvider("acme", deepFs(meta));
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.code === "ACTION_META_CATEGORY_INVALID")).toBe(true);
  });

  it("--all flips to fail when one provider has a value-level error", () => {
    const fs = fakeFs({
      "contracts/actionMeta.ts": 'export const ActionCategorySchema = z.enum(["messaging", "data"]);',
      "contracts/integration.ts": 'export const TokenScopeSchema = z.enum(["user", "workspace"]);',
      "integrations/alpha/manifest.ts": manifestSrc("alpha"),
      "integrations/alpha/actions/a.ts": "",
      "integrations/alpha/actions/a.schema.ts": "",
      "integrations/alpha/actions/a.meta.ts": actionMetaSrc("alpha", "a"),
      "integrations/zeta/manifest.ts": manifestSrc("zeta"),
      "integrations/zeta/actions/z.ts": "",
      "integrations/zeta/actions/z.schema.ts": "",
      "integrations/zeta/actions/z.meta.ts": actionMetaSrc("zeta", "z").replace('"messaging"', '"nonsense"'),
    });
    const results = validateAllProviders(fs);
    const summary = summarizeValidation(results);
    expect(summary.total).toBe(2);
    expect(summary.fail).toBe(1);
    expect(verdictOf(results[0]!)).toBe("PASS"); // alpha
    expect(verdictOf(results[1]!)).toBe("FAIL"); // zeta — invalid category
  });
});

// ── app scaffold ────────────────────────────────────────────────────────────
function fakeWriter(): FsWriter & { dirs: string[]; files: Map<string, string> } {
  const dirs: string[] = [];
  const files = new Map<string, string>();
  return { dirs, files, ensureDir: (p) => void dirs.push(p), writeFile: (p, c) => void files.set(p, c) };
}

describe("app scaffold — id normalization (pure)", () => {
  it("normalizes case/whitespace and accepts valid ids", () => {
    expect(normalizeProviderId("  Linear ")).toEqual({ ok: true, id: "linear" });
    expect(normalizeProviderId("test-provider_2").ok).toBe(true);
  });
  it("rejects invalid ids (spaces, leading digit, symbols, empty)", () => {
    expect(normalizeProviderId("Bad Id!").ok).toBe(false);
    expect(normalizeProviderId("123foo").ok).toBe(false);
    expect(normalizeProviderId("").ok).toBe(false);
  });
  it("camelCaseId / humanizeId handle multi-word ids", () => {
    expect(camelCaseId("google-analytics")).toBe("googleAnalytics");
    expect(humanizeId("google-analytics")).toBe("Google Analytics");
  });
});

describe("app scaffold — plan + overlay (pure)", () => {
  it("plans exactly the manifest file, deterministically", () => {
    const a = buildScaffoldPlan("linear");
    const b = buildScaffoldPlan("linear");
    expect(a.files.map((f) => f.path)).toEqual(["integrations/linear/manifest.ts"]);
    expect(a).toEqual(b); // deterministic
    expect(a.files[0]!.content).toContain('id: "linear"');
    expect(a.files[0]!.content).toContain("linearManifest");
  });
  it("overlayFs surfaces planned files over a base fs without writing", () => {
    const plan = buildScaffoldPlan("linear");
    const ov = overlayFs(fakeFs({}), plan.files);
    expect(ov.isDirectory("integrations/linear")).toBe(true);
    expect(ov.exists("integrations/linear/manifest.ts")).toBe(true);
    expect(ov.readText("integrations/linear/manifest.ts")).toContain('id: "linear"');
  });
});

describe("app scaffold — runAppScaffold", () => {
  it("dry-run writes nothing and reports a passing prediction (exit 0)", () => {
    const w = fakeWriter();
    const r = runAppScaffold("linear", { dryRun: true }, fakeFs({}), w);
    expect(r.code).toBe(0);
    expect(w.files.size).toBe(0);
    expect(w.dirs.length).toBe(0);
    expect(r.output).toContain("would write: integrations/linear/manifest.ts");
    expect(r.output).toContain("PASS");
  });

  it("creates exactly the expected files (exit 0)", () => {
    const w = fakeWriter();
    const r = runAppScaffold("linear", { dryRun: false }, fakeFs({}), w);
    expect(r.code).toBe(0);
    expect([...w.files.keys()]).toEqual(["integrations/linear/manifest.ts"]);
    expect(w.files.get("integrations/linear/manifest.ts")).toContain("ProviderManifestSchema.parse");
    expect(r.output).toContain("wrote: integrations/linear/manifest.ts");
  });

  it("refuses to overwrite an existing provider (exit 2, no writes)", () => {
    const w = fakeWriter();
    const r = runAppScaffold("slack", { dryRun: false }, fakeFs({ "integrations/slack/manifest.ts": SLACK_MANIFEST }), w);
    expect(r.code).toBe(2);
    expect(w.files.size).toBe(0);
    expect(r.output).toMatch(/already exists/);
  });

  it("rejects an invalid provider id (exit 2, no writes)", () => {
    const w = fakeWriter();
    const r = runAppScaffold("Bad Id!", { dryRun: false }, fakeFs({}), w);
    expect(r.code).toBe(2);
    expect(w.files.size).toBe(0);
    expect(r.output).toMatch(/Invalid provider id/);
  });

  it("reports the post-scaffold validation result + manual TODOs + next commands", () => {
    const r = runAppScaffold("linear", { dryRun: true }, fakeFs({}), fakeWriter());
    expect(r.output).toContain("Validation (predicted from the generated files):");
    expect(r.output).toContain("Manual TODOs");
    expect(r.output).toContain("npm run chainreact -- app validate linear");
    expect(r.output).toContain("integrations/_registry.ts");
  });
});

describe("app scaffold — dispatch via run()", () => {
  const rt = { nodeVersion: "v20.0.0", platform: "linux", cwd: "/repo", repoRoot: "/repo" };

  it("`app scaffold <id> --dry-run` → exit 0, no writes", () => {
    const w = fakeWriter();
    const out: string[] = [];
    const code = run(["app", "scaffold", "linear", "--dry-run"], { fs: fakeFs({}), writer: w, runtime: rt, log: (l) => out.push(l) });
    expect(code).toBe(0);
    expect(w.files.size).toBe(0);
    expect(out.join("\n")).toContain("dry-run");
  });

  it("`app scaffold <id>` → exit 0 and writes the manifest", () => {
    const w = fakeWriter();
    const code = run(["app", "scaffold", "linear"], { fs: fakeFs({}), writer: w, runtime: rt, log: () => {} });
    expect(code).toBe(0);
    expect([...w.files.keys()]).toEqual(["integrations/linear/manifest.ts"]);
  });

  it("`app scaffold` with no id → usage, exit 2", () => {
    const out: string[] = [];
    const code = run(["app", "scaffold"], { fs: fakeFs({}), writer: fakeWriter(), runtime: rt, log: (l) => out.push(l) });
    expect(code).toBe(2);
    expect(out.join("\n")).toMatch(/Usage:.*app scaffold/);
  });

  it("unknown `app` subcommand mentions scaffold", () => {
    const out: string[] = [];
    run(["app", "bogus"], { fs: fakeFs({}), writer: fakeWriter(), runtime: rt, log: (l) => out.push(l) });
    expect(out.join("\n")).toMatch(/scaffold/);
  });
});

// ── registry awareness ───────────────────────────────────────────────────────
// A realistic registry: two manifest imports (one with id-divergent export
// casing — microsoft-onedrive → microsoftOneDriveManifest), a side-effect import
// block, and the ALL_MANIFESTS array. `gamma` is imported but NOT in the array.
const REGISTRY_SRC = [
  'import { alphaManifest } from "./alpha/manifest";',
  'import { microsoftOneDriveManifest } from "./microsoft-onedrive/manifest";',
  'import { gammaManifest } from "./gamma/manifest";',
  "",
  'import "./alpha/triggers/onThing";',
  "",
  "const ALL_MANIFESTS: readonly ProviderManifest[] = [",
  "  alphaManifest,",
  "  microsoftOneDriveManifest,",
  "];",
  "",
].join("\n");

describe("registry detection (pure)", () => {
  it("registered when imported AND in ALL_MANIFESTS", () => {
    expect(detectRegistration(REGISTRY_SRC, "alpha")).toBe("registered");
  });
  it("anchors on the import PATH, not id-derived export casing", () => {
    // microsoft-onedrive exports microsoftOneDriveManifest (capital D); a
    // dash-split derivation (microsoftOnedriveManifest) would falsely miss it.
    expect(registryExportName("microsoft-onedrive")).toBe("microsoftOnedriveManifest");
    expect(detectRegistration(REGISTRY_SRC, "microsoft-onedrive")).toBe("registered");
  });
  it("unregistered when absent entirely", () => {
    expect(detectRegistration(REGISTRY_SRC, "beta")).toBe("unregistered");
  });
  it("unregistered when imported but NOT in the array (only 1 occurrence)", () => {
    expect(detectRegistration(REGISTRY_SRC, "gamma")).toBe("unregistered");
  });
  it("unknown when the registry can't be read (empty text)", () => {
    expect(detectRegistration("", "alpha")).toBe("unknown");
  });
  it("registrationStatus reads the registry via fs", () => {
    const fs = fakeFs({ [REGISTRY_PATH]: REGISTRY_SRC });
    expect(registrationStatus(fs, "alpha")).toBe("registered");
    expect(registrationStatus(fs, "beta")).toBe("unregistered");
    expect(registrationStatus(fakeFs({}), "alpha")).toBe("unknown"); // no registry file
  });
  it("readManifestExportName extracts the real exported symbol (both forms)", () => {
    expect(readManifestExportName('export const fooManifest: ProviderManifest = ProviderManifestSchema.parse({})')).toBe("fooManifest");
    expect(readManifestExportName('export const microsoftOneDriveManifest = ProviderManifestSchema.parse({})')).toBe("microsoftOneDriveManifest");
    expect(readManifestExportName("// nothing here")).toBeNull();
  });
});

describe("registry patch (pure)", () => {
  it("appends one import + one ALL_MANIFESTS entry, deterministically", () => {
    const a = buildRegistryPatch(REGISTRY_SRC, "beta", "betaManifest");
    const b = buildRegistryPatch(REGISTRY_SRC, "beta", "betaManifest");
    expect(a).toEqual(b); // deterministic
    if (!a.ok) throw new Error("expected ok");
    expect(a.alreadyRegistered).toBe(false);
    expect(a.importLine).toBe('import { betaManifest } from "./beta/manifest";');
    expect(a.arrayEntry).toBe("betaManifest,");
    // import inserted AFTER the last manifest import, BEFORE the side-effect block
    expect(a.newText).toMatch(/from "\.\/gamma\/manifest";\nimport \{ betaManifest \} from "\.\/beta\/manifest";\n\nimport "\.\/alpha\/triggers/);
    // array entry inserted as the LAST element before `];`
    expect(a.newText).toMatch(/microsoftOneDriveManifest,\n {2}betaManifest,\n\];/);
    // the patched text now detects as registered
    expect(detectRegistration(a.newText, "beta")).toBe("registered");
  });

  it("uses the SUPPLIED export name (not id-derived) so divergent casing wires correctly", () => {
    const p = buildRegistryPatch(REGISTRY_SRC, "microsoft-onenote", "microsoftOneNoteManifest");
    if (!p.ok) throw new Error("expected ok");
    expect(p.importLine).toBe('import { microsoftOneNoteManifest } from "./microsoft-onenote/manifest";');
  });

  it("no-op (alreadyRegistered) for a provider already wired in", () => {
    const p = buildRegistryPatch(REGISTRY_SRC, "alpha", "alphaManifest");
    if (!p.ok) throw new Error("expected ok");
    expect(p.alreadyRegistered).toBe(true);
    expect(p.newText).toBe(REGISTRY_SRC); // unchanged
  });

  it("sequential patches append in order (no sorting)", () => {
    const first = buildRegistryPatch(REGISTRY_SRC, "delta", "deltaManifest");
    if (!first.ok) throw new Error("expected ok");
    const second = buildRegistryPatch(first.newText, "beta", "betaManifest");
    if (!second.ok) throw new Error("expected ok");
    // delta was appended first, beta second — insertion order preserved.
    expect(second.newText.indexOf("deltaManifest,")).toBeLessThan(second.newText.indexOf("betaManifest,"));
  });

  it("refuses an empty/unreadable registry", () => {
    expect(buildRegistryPatch("", "beta", "betaManifest").ok).toBe(false);
  });
  it("refuses when ALL_MANIFESTS array is absent", () => {
    const r = buildRegistryPatch('import { alphaManifest } from "./alpha/manifest";', "beta", "betaManifest");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toMatch(/ALL_MANIFESTS/);
  });
  it("refuses when there is no manifest-import anchor", () => {
    const r = buildRegistryPatch("const ALL_MANIFESTS: readonly ProviderManifest[] = [\n];\n", "beta", "betaManifest");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toMatch(/import/);
  });
});

describe("app validate — registry warning", () => {
  const withRegistry = (registry: string): FsDeps =>
    fakeFs({ "integrations/alpha/manifest.ts": manifestSrc("alpha"), [REGISTRY_PATH]: registry });

  it("registered provider → no MANIFEST_NOT_REGISTERED warning", () => {
    const r = validateProvider("alpha", withRegistry(REGISTRY_SRC));
    expect(r.findings.some((f) => f.code === "MANIFEST_NOT_REGISTERED")).toBe(false);
  });

  it("unregistered provider → WARNING (not error; provider still ok)", () => {
    // beta exists but is not in REGISTRY_SRC.
    const fs = fakeFs({ "integrations/beta/manifest.ts": manifestSrc("beta"), [REGISTRY_PATH]: REGISTRY_SRC });
    const r = validateProvider("beta", fs);
    const warn = r.findings.find((f) => f.code === "MANIFEST_NOT_REGISTERED");
    expect(warn?.level).toBe("warning");
    expect(r.ok).toBe(true); // warnings never fail
    expect(verdictOf(r)).toBe("WARN");
  });

  it("registry absent (unknown) → no warning (don't assert what we can't read)", () => {
    const r = validateProvider("alpha", fakeFs({ "integrations/alpha/manifest.ts": manifestSrc("alpha") }));
    expect(r.findings.some((f) => f.code === "MANIFEST_NOT_REGISTERED")).toBe(false);
  });
});

describe("app list — registered column", () => {
  const fs = fakeFs({
    "integrations/alpha/manifest.ts": manifestSrc("alpha"),
    "integrations/beta/manifest.ts": manifestSrc("beta"),
    [REGISTRY_PATH]: REGISTRY_SRC, // registers alpha only
  });

  it("inventories a registered field per provider", () => {
    const infos = listProviders(fs);
    expect(infos.find((i) => i.id === "alpha")!.registered).toBe("registered");
    expect(infos.find((i) => i.id === "beta")!.registered).toBe("unregistered");
    // no registry file → unknown
    expect(listProviders(fakeFs({ "integrations/alpha/manifest.ts": manifestSrc("alpha") }))[0]!.registered).toBe("unknown");
  });

  it("renders a deterministic registered column (yes/no)", () => {
    const out = renderProviderList(listProviders(fs));
    expect(out).toContain("registered");
    expect(out).toMatch(/alpha\s+Alpha\s+yes\s+yes/); // enabled yes, registered yes
    expect(out).toMatch(/beta\s+Beta\s+yes\s+no/); // enabled yes, registered no
  });
});

describe("app scaffold --register", () => {
  const registryFs = (): FsDeps => fakeFs({ [REGISTRY_PATH]: REGISTRY_SRC });

  it("dry-run --register writes nothing and reports the planned registry patch", () => {
    const w = fakeWriter();
    const r = runAppScaffold("linear", { dryRun: true, register: true }, registryFs(), w);
    expect(r.code).toBe(0);
    expect(w.files.size).toBe(0);
    expect(w.dirs.length).toBe(0);
    expect(r.output).toContain("Registry patch");
    expect(r.output).toContain('import { linearManifest } from "./linear/manifest";');
    expect(r.output).toContain("would write: integrations/_registry.ts");
    // overlay includes the patched registry → no not-registered warning
    expect(r.output).not.toContain("MANIFEST_NOT_REGISTERED");
  });

  it("real --register creates the manifest AND patches the registry", () => {
    const w = fakeWriter();
    const r = runAppScaffold("linear", { dryRun: false, register: true }, registryFs(), w);
    expect(r.code).toBe(0);
    expect([...w.files.keys()].sort()).toEqual(["integrations/_registry.ts", "integrations/linear/manifest.ts"]);
    const patched = w.files.get(REGISTRY_PATH)!;
    expect(patched).toContain('import { linearManifest } from "./linear/manifest";');
    expect(detectRegistration(patched, "linear")).toBe("registered");
  });

  it("plain scaffold (no --register) does NOT write the registry", () => {
    const w = fakeWriter();
    const r = runAppScaffold("linear", { dryRun: false }, registryFs(), w);
    expect([...w.files.keys()]).toEqual(["integrations/linear/manifest.ts"]);
    expect(r.output).not.toContain("Registry patch");
  });

  it("--register refuses (exit 2, no writes) when the registry can't be patched safely", () => {
    const w = fakeWriter();
    const badFs = fakeFs({ [REGISTRY_PATH]: 'import { x } from "./x/other";\n// no ALL_MANIFESTS here' });
    const r = runAppScaffold("linear", { dryRun: false, register: true }, badFs, w);
    expect(r.code).toBe(2);
    expect(w.files.size).toBe(0);
    expect(r.output).toMatch(/cannot patch the registry safely/);
    expect(r.output).toMatch(/by hand/);
  });
});

describe("app register", () => {
  const baseFs = (registry: string): FsDeps =>
    fakeFs({ "integrations/beta/manifest.ts": manifestSrc("beta"), [REGISTRY_PATH]: registry });

  it("dry-run prints the patch and writes nothing", () => {
    const w = fakeWriter();
    const r = runAppRegister("beta", { dryRun: true }, baseFs(REGISTRY_SRC), w);
    expect(r.code).toBe(0);
    expect(w.files.size).toBe(0);
    expect(r.output).toContain('+ import { betaManifest } from "./beta/manifest";');
    expect(r.output).toContain("would be applied");
  });

  it("real run patches ONLY the registry file", () => {
    const w = fakeWriter();
    const r = runAppRegister("beta", { dryRun: false }, baseFs(REGISTRY_SRC), w);
    expect(r.code).toBe(0);
    expect([...w.files.keys()]).toEqual([REGISTRY_PATH]);
    expect(detectRegistration(w.files.get(REGISTRY_PATH)!, "beta")).toBe("registered");
  });

  it("no-op (exit 0, no writes) when already registered", () => {
    const w = fakeWriter();
    const fs = fakeFs({ "integrations/alpha/manifest.ts": manifestSrc("alpha"), [REGISTRY_PATH]: REGISTRY_SRC });
    const r = runAppRegister("alpha", { dryRun: false }, fs, w);
    expect(r.code).toBe(0);
    expect(w.files.size).toBe(0);
    expect(r.output).toMatch(/Already registered/);
  });

  it("refuses an unknown provider (no manifest) → exit 2, no writes", () => {
    const w = fakeWriter();
    const r = runAppRegister("ghost", { dryRun: false }, baseFs(REGISTRY_SRC), w);
    expect(r.code).toBe(2);
    expect(w.files.size).toBe(0);
    expect(r.output).toMatch(/does not exist/);
  });

  it("refuses an unsafe registry format → exit 2, no writes, manual instructions", () => {
    const w = fakeWriter();
    const r = runAppRegister("beta", { dryRun: false }, baseFs("// not a registry"), w);
    expect(r.code).toBe(2);
    expect(w.files.size).toBe(0);
    expect(r.output).toMatch(/cannot patch the registry safely/);
  });

  it("uses the manifest's REAL export name (divergent casing)", () => {
    const w = fakeWriter();
    const fs = fakeFs({
      "integrations/microsoft-onenote/manifest.ts":
        "export const microsoftOneNoteManifest: ProviderManifest = ProviderManifestSchema.parse({ id: \"microsoft-onenote\" });",
      [REGISTRY_PATH]: REGISTRY_SRC,
    });
    const r = runAppRegister("microsoft-onenote", { dryRun: true }, fs, w);
    expect(r.output).toContain('import { microsoftOneNoteManifest } from "./microsoft-onenote/manifest";');
  });
});

describe("registry dispatch via run()", () => {
  const rt = { nodeVersion: "v20.0.0", platform: "linux", cwd: "/repo", repoRoot: "/repo" };

  it("`app scaffold <id> --register --dry-run` → exit 0, no writes", () => {
    const w = fakeWriter();
    const out: string[] = [];
    const code = run(["app", "scaffold", "linear", "--register", "--dry-run"], {
      fs: fakeFs({ [REGISTRY_PATH]: REGISTRY_SRC }),
      writer: w,
      runtime: rt,
      log: (l) => out.push(l),
    });
    expect(code).toBe(0);
    expect(w.files.size).toBe(0);
    expect(out.join("\n")).toContain("Registry patch");
  });

  it("`app register <id> --dry-run` → exit 0, no writes", () => {
    const w = fakeWriter();
    const out: string[] = [];
    const code = run(["app", "register", "beta", "--dry-run"], {
      fs: fakeFs({ "integrations/beta/manifest.ts": manifestSrc("beta"), [REGISTRY_PATH]: REGISTRY_SRC }),
      writer: w,
      runtime: rt,
      log: (l) => out.push(l),
    });
    expect(code).toBe(0);
    expect(w.files.size).toBe(0);
    expect(out.join("\n")).toMatch(/app register: beta/);
  });

  it("`app register` with no id → usage, exit 2", () => {
    const out: string[] = [];
    const code = run(["app", "register"], { fs: fakeFs({}), writer: fakeWriter(), runtime: rt, log: (l) => out.push(l) });
    expect(code).toBe(2);
    expect(out.join("\n")).toMatch(/Usage:.*app register/);
  });

  it("unknown `app` subcommand mentions register", () => {
    const out: string[] = [];
    run(["app", "bogus"], { fs: fakeFs({}), writer: fakeWriter(), runtime: rt, log: (l) => out.push(l) });
    expect(out.join("\n")).toMatch(/register/);
  });
});
