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
import {
  buildHandlerInventoryPatch,
  buildMetaInventoryPatch,
  detectHandlerRegistration,
  detectMetaRegistration,
  detectTriggerMetaRegistration,
  HANDLER_INVENTORY_PATH,
  handlerRegistrationStatus,
  looksLikeScaffoldPlaceholder,
  META_INVENTORY_PATH,
  metaBarrelPath,
  metaRegistrationStatus,
  readActionHandlerExportName,
  readActionMetaExportName,
  readMetaRegistryText,
  resolveMetaRegistryTarget,
  triggerMetaRegistrationStatus,
} from "@/scripts/chainreact/actionRegistry";
import { runAppActionRegister } from "@/scripts/chainreact/commands/appActionRegister";
import {
  buildTriggerScaffoldPlan,
  runAppTriggerScaffold,
  triggerMetaExportName,
  triggerMetaPath,
} from "@/scripts/chainreact/commands/appTriggerScaffold";
import {
  actionMetaExportName,
  buildActionScaffoldPlan,
  chooseMetaPath,
  normalizeActionId,
  runAppActionScaffold,
} from "@/scripts/chainreact/commands/appActionScaffold";
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
import {
  buildChangedVerifyPlan,
  buildVerifyPlan,
  classifyRec,
  classifyRecommendations,
  executeChangedVerify,
  executeVerify,
  recommendChecks,
  renderChangedVerify,
} from "@/scripts/chainreact/commands/verify";
import {
  buildChangedReport,
  computeFinalStatus,
  renderChangedReport,
  renderChangedReportJson,
} from "@/scripts/chainreact/commands/verifyReport";
import { type ChangedFilesReader, mergeChangedPaths } from "@/scripts/chainreact/git";
import { helpText } from "@/scripts/chainreact/help";
import type { FsDeps, FsWriter } from "@/scripts/chainreact/repo";
import {
  type CommandExecutor,
  type CommandRunner,
  type ExecCommand,
  isAllowedChainreactArgs,
  isAllowedJestPaths,
  renderExecCommand,
  type RunResult,
  validateExecCommand,
} from "@/scripts/chainreact/runner";

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

// fake structured executor that records the display commands it was asked to run.
// `byCommand` maps a rendered command string → exit status (default 0).
function fakeExecutor(byCommand: Record<string, number> = {}): CommandExecutor & { calls: string[] } {
  const calls: string[] = [];
  const fn = ((cmd: ExecCommand): RunResult => {
    const display = renderExecCommand(cmd);
    calls.push(display);
    const status = display in byCommand ? (byCommand[display] as number) : 0;
    return { status, stdout: "", stderr: "" };
  }) as CommandExecutor & { calls: string[] };
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

  const smokeFs = () =>
    fakeFs({
      "package.json": JSON.stringify({ scripts: {} }),
      "services/execution/handlers/_handlerInventory.ts":
        'export const ALL_HANDLERS = [\n' +
        '  { provider: "slack", type: "list_channels", handler: a },\n' +
        '  { provider: "native", type: "format_transformer", handler: b },\n];',
      "tests/fixtures/action-smoke/native/format_transformer.ts": 'export default defineActionSmokeFixture({\n  risk: "read",\n});',
    });
  const noChanged: ChangedFilesReader = () => ({ ok: true, files: [] });

  it("smoke actions → renders inventory and returns 0", () => {
    const out: string[] = [];
    const code = run(["smoke", "actions"], { fs: smokeFs(), runtime: baseRuntime, changedFiles: noChanged, log: (l) => out.push(l) });
    expect(code).toBe(0);
    expect(out.join("\n")).toContain("FIXTURE native:format_transformer");
    expect(out.join("\n")).toContain("MISSING slack:list_channels");
  });

  it("smoke actions --provider native --json → JSON only, scoped to native", () => {
    const out: string[] = [];
    const code = run(["smoke", "actions", "--provider", "native", "--json"], {
      fs: smokeFs(),
      runtime: baseRuntime,
      changedFiles: noChanged,
      log: (l) => out.push(l),
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join("\n"));
    expect(parsed.mode).toBe("inventory");
    expect(parsed.rows.every((r: { provider: string }) => r.provider === "native")).toBe(true);
  });

  it("smoke with a bad subcommand → exit 2", () => {
    const code = run(["smoke", "explode"], { fs: baseFs(), runtime: baseRuntime, log: () => {} });
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

// ── action scaffolding ───────────────────────────────────────────────────────
describe("app action scaffold — id normalization (pure)", () => {
  it("derives snake/camel/Pascal/Title forms from a kebab id (case-insensitive)", () => {
    expect(normalizeActionId("Send-Test-Message")).toEqual({
      ok: true,
      type: "send_test_message",
      base: "sendTestMessage",
      pascal: "SendTestMessage",
      display: "Send Test Message",
    });
  });
  it("treats - and _ identically", () => {
    expect(normalizeActionId("send_test_message").type).toBe("send_test_message");
    expect(normalizeActionId("send_test_message").base).toBe("sendTestMessage");
  });
  it("rejects invalid ids (leading digit, symbols, double/trailing separators, empty)", () => {
    expect(normalizeActionId("1foo").ok).toBe(false);
    expect(normalizeActionId("bad id!").ok).toBe(false);
    expect(normalizeActionId("send--test").ok).toBe(false);
    expect(normalizeActionId("send-").ok).toBe(false);
    expect(normalizeActionId("").ok).toBe(false);
  });
  it("export-const name follows <provider><Action>Meta with provider camelCase", () => {
    const a = normalizeActionId("foo-bar");
    expect(actionMetaExportName("slack", a)).toBe("slackFooBarMeta");
    expect(actionMetaExportName("google-analytics", a)).toBe("googleAnalyticsFooBarMeta");
  });
});

describe("app action scaffold — layout choice (pure)", () => {
  it("defaults to the sibling triad layout", () => {
    const fs = fakeFs({ "integrations/slack/manifest.ts": manifestSrc("slack") });
    expect(chooseMetaPath(fs, "slack", "sendTestMessage")).toBe("integrations/slack/actions/sendTestMessage.meta.ts");
  });
  it("respects an existing actions/meta/ subfolder convention (hubspot-style)", () => {
    const fs = fakeFs({
      "integrations/hubspot/manifest.ts": manifestSrc("hubspot"),
      "integrations/hubspot/actions/meta/createContact.meta.ts": actionMetaSrc("hubspot", "create_contact"),
    });
    expect(chooseMetaPath(fs, "hubspot", "createDeal")).toBe("integrations/hubspot/actions/meta/createDeal.meta.ts");
    const plan = buildActionScaffoldPlan(fs, "hubspot", normalizeActionId("create-deal"));
    expect(plan.files.map((f) => f.path)).toEqual([
      "integrations/hubspot/actions/createDeal.ts",
      "integrations/hubspot/actions/createDeal.schema.ts",
      "integrations/hubspot/actions/meta/createDeal.meta.ts",
    ]);
  });
});

describe("app action scaffold — runAppActionScaffold", () => {
  // Provider exists + is registered (alpha is in REGISTRY_SRC).
  const providerFs = (): FsDeps =>
    fakeFs({ "integrations/alpha/manifest.ts": manifestSrc("alpha"), [REGISTRY_PATH]: REGISTRY_SRC });

  it("dry-run writes nothing and predicts a passing validation (exit 0)", () => {
    const w = fakeWriter();
    const r = runAppActionScaffold("alpha", "send-test-message", { dryRun: true }, providerFs(), w);
    expect(r.code).toBe(0);
    expect(w.files.size).toBe(0);
    expect(w.dirs.length).toBe(0);
    expect(r.output).toContain("would write: integrations/alpha/actions/sendTestMessage.ts");
    expect(r.output).toContain("Action key: alpha:send_test_message");
    expect(r.output).toContain("PASS");
  });

  it("creates exactly the three triad files (exit 0)", () => {
    const w = fakeWriter();
    const r = runAppActionScaffold("alpha", "send-test-message", { dryRun: false }, providerFs(), w);
    expect(r.code).toBe(0);
    expect([...w.files.keys()].sort()).toEqual([
      "integrations/alpha/actions/sendTestMessage.meta.ts",
      "integrations/alpha/actions/sendTestMessage.schema.ts",
      "integrations/alpha/actions/sendTestMessage.ts",
    ]);
  });

  it("generated meta has the correct key + provider + export const", () => {
    const w = fakeWriter();
    runAppActionScaffold("alpha", "send-test-message", { dryRun: false }, providerFs(), w);
    const meta = w.files.get("integrations/alpha/actions/sendTestMessage.meta.ts")!;
    expect(meta).toContain('key: "alpha:send_test_message"');
    expect(meta).toContain('provider: "alpha"');
    expect(meta).toContain('type: "send_test_message"');
    expect(meta).toContain("export const alphaSendTestMessageMeta: ActionMeta");
    expect(meta).toContain('category: "other"');
    // handler is a placeholder that throws — never fake success
    const handler = w.files.get("integrations/alpha/actions/sendTestMessage.ts")!;
    expect(handler).toMatch(/throw new Error\(/);
    expect(handler).toMatch(/not implemented yet/);
  });

  it("generated triad validates clean in the overlay", () => {
    const w = fakeWriter();
    const r = runAppActionScaffold("alpha", "send-test-message", { dryRun: true }, providerFs(), w);
    expect(r.output).toContain("PASS — no structural issues detected");
    expect(r.output).not.toContain("[ERROR]");
  });

  it("refuses an unknown provider (exit 2, no writes)", () => {
    const w = fakeWriter();
    const r = runAppActionScaffold("ghostprovider", "do-thing", { dryRun: false }, providerFs(), w);
    expect(r.code).toBe(2);
    expect(w.files.size).toBe(0);
    expect(r.output).toMatch(/unknown provider/);
  });

  it("refuses an invalid action id (exit 2, no writes)", () => {
    const w = fakeWriter();
    const r = runAppActionScaffold("alpha", "Bad Action!", { dryRun: false }, providerFs(), w);
    expect(r.code).toBe(2);
    expect(w.files.size).toBe(0);
    expect(r.output).toMatch(/Invalid action id/);
  });

  it("refuses a collision with an existing action unit (exit 2, no writes)", () => {
    const w = fakeWriter();
    const fs = fakeFs({
      "integrations/alpha/manifest.ts": manifestSrc("alpha"),
      "integrations/alpha/actions/sendTestMessage.ts": "", // existing handler basename
      [REGISTRY_PATH]: REGISTRY_SRC,
    });
    const r = runAppActionScaffold("alpha", "send-test-message", { dryRun: false }, fs, w);
    expect(r.code).toBe(2);
    expect(w.files.size).toBe(0);
    expect(r.output).toMatch(/already has|refusing to overwrite/);
  });

  it("unregistered provider → warning but still succeeds (exit 0, files created)", () => {
    const w = fakeWriter();
    // beta exists but is NOT in REGISTRY_SRC.
    const fs = fakeFs({ "integrations/beta/manifest.ts": manifestSrc("beta"), [REGISTRY_PATH]: REGISTRY_SRC });
    const r = runAppActionScaffold("beta", "send-test-message", { dryRun: false }, fs, w);
    expect(r.code).toBe(0);
    expect(w.files.size).toBe(3);
    expect(r.output).toMatch(/not registered in integrations\/_registry\.ts/);
    expect(r.output).toMatch(/will NOT load/);
  });

  it("places the meta in actions/meta/ for a provider using that layout", () => {
    const w = fakeWriter();
    const fs = fakeFs({
      "integrations/hubspot/manifest.ts": manifestSrc("hubspot"),
      "integrations/hubspot/actions/meta/createContact.meta.ts": actionMetaSrc("hubspot", "create_contact"),
      [REGISTRY_PATH]: REGISTRY_SRC,
    });
    runAppActionScaffold("hubspot", "create-deal", { dryRun: false }, fs, w);
    expect(w.files.has("integrations/hubspot/actions/meta/createDeal.meta.ts")).toBe(true);
    expect(w.files.has("integrations/hubspot/actions/createDeal.ts")).toBe(true);
  });
});

describe("app action scaffold — dispatch via run()", () => {
  const rt = { nodeVersion: "v20.0.0", platform: "linux", cwd: "/repo", repoRoot: "/repo" };
  const providerFs = (): FsDeps =>
    fakeFs({ "integrations/alpha/manifest.ts": manifestSrc("alpha"), [REGISTRY_PATH]: REGISTRY_SRC });

  it("`app action scaffold <p> <a> --dry-run` → exit 0, no writes", () => {
    const w = fakeWriter();
    const out: string[] = [];
    const code = run(["app", "action", "scaffold", "alpha", "send-test-message", "--dry-run"], {
      fs: providerFs(),
      writer: w,
      runtime: rt,
      log: (l) => out.push(l),
    });
    expect(code).toBe(0);
    expect(w.files.size).toBe(0);
    expect(out.join("\n")).toContain("app action scaffold: alpha:send_test_message");
  });

  it("`app action scaffold <p> <a>` → exit 0 and writes the triad", () => {
    const w = fakeWriter();
    const code = run(["app", "action", "scaffold", "alpha", "send-test-message"], {
      fs: providerFs(),
      writer: w,
      runtime: rt,
      log: () => {},
    });
    expect(code).toBe(0);
    expect(w.files.size).toBe(3);
  });

  it("`app action scaffold` with missing args → usage, exit 2", () => {
    const out: string[] = [];
    const code = run(["app", "action", "scaffold", "alpha"], { fs: providerFs(), writer: fakeWriter(), runtime: rt, log: (l) => out.push(l) });
    expect(code).toBe(2);
    expect(out.join("\n")).toMatch(/Usage:.*app action scaffold/);
  });

  it("unknown `app action` subcommand → exit 2", () => {
    const out: string[] = [];
    const code = run(["app", "action", "bogus", "alpha", "x"], { fs: providerFs(), writer: fakeWriter(), runtime: rt, log: (l) => out.push(l) });
    expect(code).toBe(2);
    expect(out.join("\n")).toMatch(/app action scaffold/);
  });

  it("unknown `app` subcommand mentions action scaffold", () => {
    const out: string[] = [];
    run(["app", "bogus"], { fs: fakeFs({}), writer: fakeWriter(), runtime: rt, log: (l) => out.push(l) });
    expect(out.join("\n")).toMatch(/action scaffold/);
  });

  it("scaffold output points to `app action register` for the next step", () => {
    const w = fakeWriter();
    const r = runAppActionScaffold("alpha", "send-test-message", { dryRun: true }, providerFs(), w);
    expect(r.output).toMatch(/app action register alpha send_test_message/);
  });
});

// ── action registry awareness ────────────────────────────────────────────────
// Handler inventory: single file, all-direct imports + ALL_HANDLERS entries.
const HANDLER_INV = [
  'import type { ActionHandler } from "./types";',
  'import { sendChannelMessage as slackSendChannelMessage } from "@/integrations/slack/actions/sendChannelMessage";',
  'import { addReaction as slackAddReaction } from "@/integrations/slack/actions/addReaction";',
  "",
  "export const ALL_HANDLERS = [",
  '  { provider: "slack", type: "send_channel_message", handler: slackSendChannelMessage },',
  '  { provider: "slack", type: "add_reaction", handler: slackAddReaction },',
  "];",
  "",
].join("\n");
// Central meta inventory: slack direct + airtable via barrel spread.
const META_INV = [
  'import { slackSendChannelMessageMeta } from "@/integrations/slack/actions/sendChannelMessage.meta";',
  'import { AIRTABLE_ACTION_METAS } from "./providers/airtable";',
  "",
  "export const ALL_ACTION_META = [",
  "  slackSendChannelMessageMeta,",
  "  ...AIRTABLE_ACTION_METAS,",
  "];",
  "export const ALL_TRIGGER_META = [];",
  "",
].join("\n");
// Airtable discovery barrel (the @/integrations meta import lives HERE, not centrally).
const AIRTABLE_BARREL = [
  'import type { ActionMeta } from "@/contracts/actionMeta";',
  'import { airtableCreateRecordMeta } from "@/integrations/airtable/actions/createRecord.meta";',
  "",
  "export const AIRTABLE_ACTION_METAS: ReadonlyArray<ActionMeta> = [",
  "  airtableCreateRecordMeta,",
  "];",
  "",
].join("\n");
const AIRTABLE_BARREL_PATH = metaBarrelPath("airtable");
// Real (implemented) vs scaffold-placeholder handler text.
const realHandlerSrc = (base: string): string =>
  `import type { ActionHandler } from "@/services/execution/handlers/types";\nexport const ${base}: ActionHandler = async (input) => { return { output: {} }; };`;
const placeholderHandlerSrc = (provider: string, type: string): string =>
  `import type { ActionHandler } from "@/services/execution/handlers/types";\nexport const x: ActionHandler = async (input) => { throw new Error("${provider}:${type} is not implemented yet (scaffolded placeholder — see the TODOs in this file)."); };`;
const metaFileSrc = (provider: string, type: string, exportName: string): string =>
  `import type { ActionMeta } from "@/contracts/actionMeta";\nexport const ${exportName}: ActionMeta = { key: "${provider}:${type}", provider: "${provider}", type: "${type}", displayName: "X", description: "x", category: "messaging", requiresIntegration: true, fields: [] };`;

describe("action registry detection (pure)", () => {
  it("handler: registered when imported + referenced by an ALL_HANDLERS entry", () => {
    expect(detectHandlerRegistration(HANDLER_INV, "slack", "sendChannelMessage")).toBe("registered");
    expect(detectHandlerRegistration(HANDLER_INV, "slack", "addReaction")).toBe("registered");
  });
  it("handler: unregistered when absent; unknown when inventory empty", () => {
    expect(detectHandlerRegistration(HANDLER_INV, "slack", "newThing")).toBe("unregistered");
    expect(detectHandlerRegistration("", "slack", "sendChannelMessage")).toBe("unknown");
  });
  it("meta: registered via DIRECT central import", () => {
    expect(detectMetaRegistration(META_INV, "slack", "sendChannelMessage")).toBe("registered");
  });
  it("meta: barrel-backed provider needs the barrel text (false-negative on central alone)", () => {
    expect(detectMetaRegistration(META_INV, "airtable", "createRecord")).toBe("unregistered");
    expect(detectMetaRegistration(`${META_INV}\n${AIRTABLE_BARREL}`, "airtable", "createRecord")).toBe("registered");
  });
  it("meta: unknown when inventory empty", () => {
    expect(detectMetaRegistration("", "slack", "sendChannelMessage")).toBe("unknown");
  });
  it("placeholder detection matches the scaffold marker only", () => {
    expect(looksLikeScaffoldPlaceholder(placeholderHandlerSrc("slack", "send_test_message"))).toBe(true);
    expect(looksLikeScaffoldPlaceholder(realHandlerSrc("sendTestMessage"))).toBe(false);
  });
  it("reads the exported meta/handler symbols", () => {
    expect(readActionMetaExportName(metaFileSrc("slack", "x", "slackXMeta"))).toBe("slackXMeta");
    expect(readActionHandlerExportName(realHandlerSrc("sendThing"))).toBe("sendThing");
    expect(readActionMetaExportName("// nothing")).toBeNull();
  });
});

describe("action registry detection — via fs (combines central + barrel)", () => {
  const fs = fakeFs({ [HANDLER_INVENTORY_PATH]: HANDLER_INV, [META_INVENTORY_PATH]: META_INV, [AIRTABLE_BARREL_PATH]: AIRTABLE_BARREL });
  it("metaRegistrationStatus reads central + provider barrel", () => {
    expect(metaRegistrationStatus(fs, "slack", "sendChannelMessage")).toBe("registered");
    expect(metaRegistrationStatus(fs, "airtable", "createRecord")).toBe("registered");
    expect(metaRegistrationStatus(fs, "slack", "ghost")).toBe("unregistered");
  });
  it("handlerRegistrationStatus reads the handler inventory", () => {
    expect(handlerRegistrationStatus(fs, "slack", "addReaction")).toBe("registered");
    expect(handlerRegistrationStatus(fs, "slack", "ghost")).toBe("unregistered");
  });
  it("readMetaRegistryText appends the barrel only when present", () => {
    expect(readMetaRegistryText(fs, "airtable")).toContain("AIRTABLE_ACTION_METAS");
    expect(readMetaRegistryText(fs, "slack")).not.toContain("airtableCreateRecordMeta");
  });
});

describe("resolveMetaRegistryTarget", () => {
  it("targets the barrel + its array when one exists", () => {
    const fs = fakeFs({ [META_INVENTORY_PATH]: META_INV, [AIRTABLE_BARREL_PATH]: AIRTABLE_BARREL });
    expect(resolveMetaRegistryTarget(fs, "airtable")).toEqual({ path: AIRTABLE_BARREL_PATH, arrayDecl: "AIRTABLE_ACTION_METAS" });
  });
  it("targets central ALL_ACTION_META for a direct provider", () => {
    const fs = fakeFs({ [META_INVENTORY_PATH]: META_INV });
    expect(resolveMetaRegistryTarget(fs, "slack")).toEqual({ path: META_INVENTORY_PATH, arrayDecl: "ALL_ACTION_META" });
  });
});

describe("action registry patch (pure)", () => {
  it("handler patch appends import + ALL_HANDLERS entry; result detects registered", () => {
    const p = buildHandlerInventoryPatch(HANDLER_INV, { provider: "slack", type: "new_thing", exportName: "newThing", handlerImportPath: "slack/actions/newThing" });
    if (!p.ok) throw new Error("expected ok");
    expect(p.importLine).toBe('import { newThing as slackNewThing } from "@/integrations/slack/actions/newThing";');
    expect(p.arrayEntry).toBe('{ provider: "slack", type: "new_thing", handler: slackNewThing },');
    expect(detectHandlerRegistration(p.newText, "slack", "newThing")).toBe("registered");
  });
  it("meta patch (central) appends to ALL_ACTION_META", () => {
    const p = buildMetaInventoryPatch(META_INV, { metaExport: "slackNewThingMeta", metaImportPath: "slack/actions/newThing.meta", arrayDecl: "ALL_ACTION_META", label: META_INVENTORY_PATH });
    if (!p.ok) throw new Error("expected ok");
    expect(p.newText).toMatch(/import \{ slackNewThingMeta \} from "@\/integrations\/slack\/actions\/newThing\.meta";/);
    expect(p.newText).toMatch(/\.\.\.AIRTABLE_ACTION_METAS,\n {2}slackNewThingMeta,\n\];/);
  });
  it("meta patch (barrel) appends to the barrel array", () => {
    const p = buildMetaInventoryPatch(AIRTABLE_BARREL, { metaExport: "airtableNewMeta", metaImportPath: "airtable/actions/new.meta", arrayDecl: "AIRTABLE_ACTION_METAS", label: AIRTABLE_BARREL_PATH });
    if (!p.ok) throw new Error("expected ok");
    expect(p.newText).toMatch(/airtableCreateRecordMeta,\n {2}airtableNewMeta,\n\];/);
  });
  it("refuses empty / no-array / no-import-anchor", () => {
    expect(buildHandlerInventoryPatch("", { provider: "p", type: "t", exportName: "e", handlerImportPath: "p/actions/e" }).ok).toBe(false);
    expect(buildMetaInventoryPatch("export const ALL_ACTION_META = [\n];", { metaExport: "m", metaImportPath: "p/actions/m.meta", arrayDecl: "ALL_ACTION_META", label: "x" }).ok).toBe(false); // no import anchor
    expect(buildMetaInventoryPatch('import { x } from "@/integrations/p/actions/x.meta";', { metaExport: "m", metaImportPath: "p/actions/m.meta", arrayDecl: "ALL_ACTION_META", label: "x" }).ok).toBe(false); // no array
  });
});

// fakeFs with a provider manifest + one action triad + the action inventories.
const actionFs = (opts: {
  base: string;
  type: string;
  handler: string;
  registeredHandler: string;
  registeredMeta: string;
  metaExport?: string;
}): FsDeps =>
  fakeFs({
    "integrations/slack/manifest.ts": manifestSrc("slack"),
    [`integrations/slack/actions/${opts.base}.ts`]: opts.handler,
    [`integrations/slack/actions/${opts.base}.schema.ts`]: "",
    [`integrations/slack/actions/${opts.base}.meta.ts`]: metaFileSrc("slack", opts.type, opts.metaExport ?? "slackThingMeta"),
    [HANDLER_INVENTORY_PATH]: opts.registeredHandler,
    [META_INVENTORY_PATH]: opts.registeredMeta,
  });

describe("app validate — action registry warnings", () => {
  it("registered triad → no ACTION_*_NOT_REGISTERED warnings", () => {
    const fs = actionFs({
      base: "sendChannelMessage",
      type: "send_channel_message",
      handler: realHandlerSrc("sendChannelMessage"),
      registeredHandler: HANDLER_INV,
      registeredMeta: META_INV,
    });
    const r = validateProvider("slack", fs);
    expect(r.findings.some((f) => f.code.startsWith("ACTION_") && f.code.endsWith("NOT_REGISTERED"))).toBe(false);
  });

  it("unregistered complete triad → both warnings, still ok (WARN)", () => {
    const fs = actionFs({
      base: "newThing",
      type: "new_thing",
      handler: realHandlerSrc("newThing"),
      registeredHandler: HANDLER_INV, // does not include newThing
      registeredMeta: META_INV,
    });
    const r = validateProvider("slack", fs);
    const codes = r.findings.map((f) => f.code);
    expect(codes).toContain("ACTION_META_NOT_REGISTERED");
    expect(codes).toContain("ACTION_HANDLER_NOT_REGISTERED");
    expect(r.findings.every((f) => f.level === "warning")).toBe(true);
    expect(r.ok).toBe(true);
    expect(verdictOf(r)).toBe("WARN");
  });

  it("placeholder (unregistered) triad warns, never errors", () => {
    const fs = actionFs({
      base: "newThing",
      type: "new_thing",
      handler: placeholderHandlerSrc("slack", "new_thing"),
      registeredHandler: HANDLER_INV,
      registeredMeta: META_INV,
    });
    const r = validateProvider("slack", fs);
    expect(r.ok).toBe(true);
    expect(r.findings.some((f) => f.code === "ACTION_HANDLER_NOT_REGISTERED")).toBe(true);
  });

  it("inventories absent (unknown) → no false-negative warnings", () => {
    const fs = fakeFs({
      "integrations/slack/manifest.ts": manifestSrc("slack"),
      "integrations/slack/actions/newThing.ts": realHandlerSrc("newThing"),
      "integrations/slack/actions/newThing.schema.ts": "",
      "integrations/slack/actions/newThing.meta.ts": metaFileSrc("slack", "new_thing", "slackNewThingMeta"),
    });
    const r = validateProvider("slack", fs);
    expect(r.findings.some((f) => f.code.endsWith("NOT_REGISTERED"))).toBe(false);
  });

  it("incomplete triad (handler+schema, no meta) → no registry warnings (only ACTION_META_GAP)", () => {
    const fs = fakeFs({
      "integrations/slack/manifest.ts": manifestSrc("slack"),
      "integrations/slack/actions/partial.ts": realHandlerSrc("partial"),
      "integrations/slack/actions/partial.schema.ts": "",
      [HANDLER_INVENTORY_PATH]: HANDLER_INV,
      [META_INVENTORY_PATH]: META_INV,
    });
    const r = validateProvider("slack", fs);
    expect(r.findings.some((f) => f.code === "ACTION_META_GAP")).toBe(true);
    expect(r.findings.some((f) => f.code.endsWith("NOT_REGISTERED"))).toBe(false);
  });
});

describe("app action register — runAppActionRegister", () => {
  // Implemented, UNregistered action 'newThing' under slack (central meta target).
  const unregisteredFs = (): FsDeps =>
    fakeFs({
      "integrations/slack/manifest.ts": manifestSrc("slack"),
      "integrations/slack/actions/newThing.ts": realHandlerSrc("newThing"),
      "integrations/slack/actions/newThing.schema.ts": "",
      "integrations/slack/actions/newThing.meta.ts": metaFileSrc("slack", "new_thing", "slackNewThingMeta"),
      [HANDLER_INVENTORY_PATH]: HANDLER_INV,
      [META_INVENTORY_PATH]: META_INV,
    });

  it("dry-run prints planned edits and writes nothing", () => {
    const w = fakeWriter();
    const r = runAppActionRegister("slack", "new-thing", { dryRun: true }, unregisteredFs(), w);
    expect(r.code).toBe(0);
    expect(w.files.size).toBe(0);
    expect(r.output).toContain(`${HANDLER_INVENTORY_PATH} (handler)`);
    expect(r.output).toContain('import { newThing as slackNewThing }');
    expect(r.output).toContain("import { slackNewThingMeta }");
  });

  it("real run patches BOTH inventories", () => {
    const w = fakeWriter();
    const r = runAppActionRegister("slack", "new-thing", { dryRun: false }, unregisteredFs(), w);
    expect(r.code).toBe(0);
    expect([...w.files.keys()].sort()).toEqual([META_INVENTORY_PATH, HANDLER_INVENTORY_PATH].sort());
    expect(detectHandlerRegistration(w.files.get(HANDLER_INVENTORY_PATH)!, "slack", "newThing")).toBe("registered");
    expect(detectMetaRegistration(w.files.get(META_INVENTORY_PATH)!, "slack", "newThing")).toBe("registered");
  });

  it("refuses a scaffold placeholder handler (exit 2, no writes)", () => {
    const w = fakeWriter();
    const fs = fakeFs({
      "integrations/slack/manifest.ts": manifestSrc("slack"),
      "integrations/slack/actions/newThing.ts": placeholderHandlerSrc("slack", "new_thing"),
      "integrations/slack/actions/newThing.schema.ts": "",
      "integrations/slack/actions/newThing.meta.ts": metaFileSrc("slack", "new_thing", "slackNewThingMeta"),
      [HANDLER_INVENTORY_PATH]: HANDLER_INV,
      [META_INVENTORY_PATH]: META_INV,
    });
    const r = runAppActionRegister("slack", "new-thing", { dryRun: false }, fs, w);
    expect(r.code).toBe(2);
    expect(w.files.size).toBe(0);
    expect(r.output).toMatch(/still a scaffold placeholder/);
  });

  it("no-ops when already registered (exit 0, no writes)", () => {
    const w = fakeWriter();
    const fs = fakeFs({
      "integrations/slack/manifest.ts": manifestSrc("slack"),
      "integrations/slack/actions/sendChannelMessage.ts": realHandlerSrc("sendChannelMessage"),
      "integrations/slack/actions/sendChannelMessage.schema.ts": "",
      "integrations/slack/actions/sendChannelMessage.meta.ts": metaFileSrc("slack", "send_channel_message", "slackSendChannelMessageMeta"),
      [HANDLER_INVENTORY_PATH]: HANDLER_INV,
      [META_INVENTORY_PATH]: META_INV,
    });
    const r = runAppActionRegister("slack", "send-channel-message", { dryRun: false }, fs, w);
    expect(r.code).toBe(0);
    expect(w.files.size).toBe(0);
    expect(r.output).toMatch(/Already registered/);
  });

  it("refuses an unknown provider (exit 2)", () => {
    const w = fakeWriter();
    const r = runAppActionRegister("ghost", "do-thing", { dryRun: false }, unregisteredFs(), w);
    expect(r.code).toBe(2);
    expect(w.files.size).toBe(0);
    expect(r.output).toMatch(/unknown provider/);
  });

  it("refuses an incomplete triad (exit 2)", () => {
    const w = fakeWriter();
    const fs = fakeFs({
      "integrations/slack/manifest.ts": manifestSrc("slack"),
      "integrations/slack/actions/halfThing.ts": realHandlerSrc("halfThing"), // no schema/meta
      [HANDLER_INVENTORY_PATH]: HANDLER_INV,
      [META_INVENTORY_PATH]: META_INV,
    });
    const r = runAppActionRegister("slack", "half-thing", { dryRun: false }, fs, w);
    expect(r.code).toBe(2);
    expect(w.files.size).toBe(0);
    expect(r.output).toMatch(/incomplete|missing/);
  });

  it("refuses an unsafe registry format (exit 2, no writes, manual instructions)", () => {
    const w = fakeWriter();
    const fs = fakeFs({
      "integrations/slack/manifest.ts": manifestSrc("slack"),
      "integrations/slack/actions/newThing.ts": realHandlerSrc("newThing"),
      "integrations/slack/actions/newThing.schema.ts": "",
      "integrations/slack/actions/newThing.meta.ts": metaFileSrc("slack", "new_thing", "slackNewThingMeta"),
      [HANDLER_INVENTORY_PATH]: "// no array, no anchors here",
      [META_INVENTORY_PATH]: "// likewise unsafe",
    });
    const r = runAppActionRegister("slack", "new-thing", { dryRun: false }, fs, w);
    expect(r.code).toBe(2);
    expect(w.files.size).toBe(0);
    expect(r.output).toMatch(/cannot patch the registries safely/);
    expect(r.output).toMatch(/by hand/);
  });

  it("targets the provider's barrel for a barrel-backed provider", () => {
    const w = fakeWriter();
    const fs = fakeFs({
      "integrations/airtable/manifest.ts": manifestSrc("airtable"),
      "integrations/airtable/actions/newThing.ts": realHandlerSrc("newThing"),
      "integrations/airtable/actions/newThing.schema.ts": "",
      "integrations/airtable/actions/newThing.meta.ts": metaFileSrc("airtable", "new_thing", "airtableNewThingMeta"),
      [HANDLER_INVENTORY_PATH]: HANDLER_INV,
      [META_INVENTORY_PATH]: META_INV,
      [AIRTABLE_BARREL_PATH]: AIRTABLE_BARREL,
    });
    const r = runAppActionRegister("airtable", "new-thing", { dryRun: false }, fs, w);
    expect(r.code).toBe(0);
    expect(w.files.has(AIRTABLE_BARREL_PATH)).toBe(true); // meta went to the barrel
    expect(w.files.has(META_INVENTORY_PATH)).toBe(false); // not central
    expect(detectMetaRegistration(`${META_INV}\n${w.files.get(AIRTABLE_BARREL_PATH)!}`, "airtable", "newThing")).toBe("registered");
  });
});

describe("app action register — dispatch via run()", () => {
  const rt = { nodeVersion: "v20.0.0", platform: "linux", cwd: "/repo", repoRoot: "/repo" };
  const fsWith = (): FsDeps =>
    fakeFs({
      "integrations/slack/manifest.ts": manifestSrc("slack"),
      "integrations/slack/actions/sendChannelMessage.ts": realHandlerSrc("sendChannelMessage"),
      "integrations/slack/actions/sendChannelMessage.schema.ts": "",
      "integrations/slack/actions/sendChannelMessage.meta.ts": metaFileSrc("slack", "send_channel_message", "slackSendChannelMessageMeta"),
      [HANDLER_INVENTORY_PATH]: HANDLER_INV,
      [META_INVENTORY_PATH]: META_INV,
    });

  it("`app action register <p> <a> --dry-run` (already registered) → exit 0, no writes", () => {
    const w = fakeWriter();
    const out: string[] = [];
    const code = run(["app", "action", "register", "slack", "send-channel-message", "--dry-run"], { fs: fsWith(), writer: w, runtime: rt, log: (l) => out.push(l) });
    expect(code).toBe(0);
    expect(w.files.size).toBe(0);
    expect(out.join("\n")).toMatch(/app action register: slack:send_channel_message/);
  });

  it("`app action register` with missing args → usage, exit 2", () => {
    const out: string[] = [];
    const code = run(["app", "action", "register", "slack"], { fs: fsWith(), writer: fakeWriter(), runtime: rt, log: (l) => out.push(l) });
    expect(code).toBe(2);
    expect(out.join("\n")).toMatch(/Usage:.*app action register/);
  });

  it("unknown `app action` subcommand mentions register", () => {
    const out: string[] = [];
    run(["app", "action", "bogus", "x", "y"], { fs: fsWith(), writer: fakeWriter(), runtime: rt, log: (l) => out.push(l) });
    expect(out.join("\n")).toMatch(/register/);
  });
});

// ── trigger scaffolding + trigger registry detection ─────────────────────────
// Discovery trigger inventory: slack direct + airtable via barrel.
const TRIGGER_META_INV = [
  'import { reactionAddedTriggerMeta } from "@/integrations/slack/triggers/reactionAdded/reactionAdded.meta";',
  'import { AIRTABLE_TRIGGER_METAS } from "./providers/airtable";',
  "",
  "export const ALL_TRIGGER_META = [",
  "  reactionAddedTriggerMeta,",
  "  ...AIRTABLE_TRIGGER_METAS,",
  "];",
  "",
].join("\n");
const AIRTABLE_TRIGGER_BARREL = [
  'import type { TriggerMeta } from "@/contracts/triggerMeta";',
  'import { airtableRecordChangedTriggerMeta } from "@/integrations/airtable/triggers/recordChanged/recordChanged.meta";',
  "",
  "export const AIRTABLE_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [",
  "  airtableRecordChangedTriggerMeta,",
  "];",
  "",
].join("\n");
const AIRTABLE_TRIG_BARREL_PATH = metaBarrelPath("airtable");

describe("trigger meta export naming + path (pure)", () => {
  it("derives a provider-prefixed TriggerMeta export name", () => {
    expect(triggerMetaExportName("slack", normalizeActionId("message-posted"))).toBe("slackMessagePostedTriggerMeta");
    expect(triggerMetaExportName("google-analytics", normalizeActionId("report-ready"))).toBe("googleAnalyticsReportReadyTriggerMeta");
  });
  it("uses the folder-per-trigger layout", () => {
    expect(triggerMetaPath("slack", "messagePosted")).toBe("integrations/slack/triggers/messagePosted/messagePosted.meta.ts");
    const plan = buildTriggerScaffoldPlan("slack", normalizeActionId("message-posted"));
    expect(plan.files.map((f) => f.path)).toEqual(["integrations/slack/triggers/messagePosted/messagePosted.meta.ts"]);
    expect(plan.files[0]!.content).toContain('activation: "manual"');
    expect(plan.files[0]!.content).toContain('key: "slack:message_posted"');
  });
});

describe("trigger meta registry detection (pure + fs)", () => {
  it("registered via DIRECT central import", () => {
    expect(detectTriggerMetaRegistration(TRIGGER_META_INV, "slack", "reactionAdded")).toBe("registered");
  });
  it("barrel-backed provider needs the barrel text", () => {
    expect(detectTriggerMetaRegistration(TRIGGER_META_INV, "airtable", "recordChanged")).toBe("unregistered");
    expect(detectTriggerMetaRegistration(`${TRIGGER_META_INV}\n${AIRTABLE_TRIGGER_BARREL}`, "airtable", "recordChanged")).toBe("registered");
  });
  it("unregistered when absent; unknown when inventory empty", () => {
    expect(detectTriggerMetaRegistration(TRIGGER_META_INV, "slack", "ghost")).toBe("unregistered");
    expect(detectTriggerMetaRegistration("", "slack", "reactionAdded")).toBe("unknown");
  });
  it("triggerMetaRegistrationStatus combines central + provider barrel via fs", () => {
    const fs = fakeFs({ [META_INVENTORY_PATH]: TRIGGER_META_INV, [AIRTABLE_TRIG_BARREL_PATH]: AIRTABLE_TRIGGER_BARREL });
    expect(triggerMetaRegistrationStatus(fs, "slack", "reactionAdded")).toBe("registered");
    expect(triggerMetaRegistrationStatus(fs, "airtable", "recordChanged")).toBe("registered");
    expect(triggerMetaRegistrationStatus(fs, "slack", "ghost")).toBe("unregistered");
  });
});

describe("app validate — trigger registry warning", () => {
  it("registered trigger meta → no TRIGGER_META_NOT_REGISTERED warning", () => {
    const fs = fakeFs({
      "integrations/slack/manifest.ts": manifestSrc("slack"),
      "integrations/slack/triggers/reactionAdded/reactionAdded.meta.ts": triggerMetaSrc("slack", "reaction_added"),
      [META_INVENTORY_PATH]: TRIGGER_META_INV,
    });
    const r = validateProvider("slack", fs);
    expect(r.findings.some((f) => f.code === "TRIGGER_META_NOT_REGISTERED")).toBe(false);
  });
  it("unregistered trigger meta → WARNING, still ok (WARN)", () => {
    const fs = fakeFs({
      "integrations/slack/manifest.ts": manifestSrc("slack"),
      "integrations/slack/triggers/ghostTrigger/ghostTrigger.meta.ts": triggerMetaSrc("slack", "ghost_trigger"),
      [META_INVENTORY_PATH]: TRIGGER_META_INV,
    });
    const r = validateProvider("slack", fs);
    const warn = r.findings.find((f) => f.code === "TRIGGER_META_NOT_REGISTERED");
    expect(warn?.level).toBe("warning");
    expect(r.ok).toBe(true);
    expect(verdictOf(r)).toBe("WARN");
  });
  it("inventory absent (unknown) → no false-negative trigger warning", () => {
    const fs = fakeFs({
      "integrations/slack/manifest.ts": manifestSrc("slack"),
      "integrations/slack/triggers/ghostTrigger/ghostTrigger.meta.ts": triggerMetaSrc("slack", "ghost_trigger"),
    });
    const r = validateProvider("slack", fs);
    expect(r.findings.some((f) => f.code === "TRIGGER_META_NOT_REGISTERED")).toBe(false);
  });
});

describe("app trigger scaffold — runAppTriggerScaffold", () => {
  const providerFs = (): FsDeps => fakeFs({ "integrations/slack/manifest.ts": manifestSrc("slack"), [REGISTRY_PATH]: REGISTRY_SRC });

  it("dry-run writes nothing and predicts a passing validation (exit 0)", () => {
    const w = fakeWriter();
    const r = runAppTriggerScaffold("slack", "message-posted", { dryRun: true }, providerFs(), w);
    expect(r.code).toBe(0);
    expect(w.files.size).toBe(0);
    expect(w.dirs.length).toBe(0);
    expect(r.output).toContain("would write: integrations/slack/triggers/messagePosted/messagePosted.meta.ts");
    expect(r.output).toContain("Trigger key: slack:message_posted");
    expect(r.output).toContain("PASS");
  });

  it("creates exactly the one meta file in folder layout (exit 0)", () => {
    const w = fakeWriter();
    const r = runAppTriggerScaffold("slack", "message-posted", { dryRun: false }, providerFs(), w);
    expect(r.code).toBe(0);
    expect([...w.files.keys()]).toEqual(["integrations/slack/triggers/messagePosted/messagePosted.meta.ts"]);
  });

  it("generated meta has the correct key/provider/type/export and inert activation", () => {
    const w = fakeWriter();
    runAppTriggerScaffold("slack", "message-posted", { dryRun: false }, providerFs(), w);
    const meta = w.files.get("integrations/slack/triggers/messagePosted/messagePosted.meta.ts")!;
    expect(meta).toContain('key: "slack:message_posted"');
    expect(meta).toContain('provider: "slack"');
    expect(meta).toContain('type: "message_posted"');
    expect(meta).toContain("export const slackMessagePostedTriggerMeta: TriggerMeta");
    expect(meta).toContain('activation: "manual"');
    expect(meta).toContain("payloadShape: []");
    expect(meta).toContain("displayOrder: null");
  });

  it("generated trigger validates clean in the overlay (no inventory → no false warning)", () => {
    const fs = fakeFs({ "integrations/slack/manifest.ts": manifestSrc("slack") });
    const r = runAppTriggerScaffold("slack", "message-posted", { dryRun: true }, fs, fakeWriter());
    expect(r.output).toContain("PASS — no structural issues detected");
    expect(r.output).not.toContain("[ERROR]");
  });

  it("refuses an unknown provider (exit 2, no writes)", () => {
    const w = fakeWriter();
    const r = runAppTriggerScaffold("ghostprovider", "do-thing", { dryRun: false }, providerFs(), w);
    expect(r.code).toBe(2);
    expect(w.files.size).toBe(0);
    expect(r.output).toMatch(/unknown provider/);
  });

  it("refuses an invalid trigger id (exit 2, no writes)", () => {
    const w = fakeWriter();
    const r = runAppTriggerScaffold("slack", "Bad Trigger!", { dryRun: false }, providerFs(), w);
    expect(r.code).toBe(2);
    expect(w.files.size).toBe(0);
    expect(r.output).toMatch(/Invalid action id|Invalid trigger id/);
  });

  it("refuses a collision with an existing trigger (exit 2, no writes)", () => {
    const w = fakeWriter();
    const fs = fakeFs({
      "integrations/slack/manifest.ts": manifestSrc("slack"),
      "integrations/slack/triggers/messagePosted/messagePosted.meta.ts": triggerMetaSrc("slack", "message_posted"),
      [REGISTRY_PATH]: REGISTRY_SRC,
    });
    const r = runAppTriggerScaffold("slack", "message-posted", { dryRun: false }, fs, w);
    expect(r.code).toBe(2);
    expect(w.files.size).toBe(0);
    expect(r.output).toMatch(/already has a trigger|refusing to overwrite/);
  });

  it("unregistered provider → warning but still succeeds (exit 0, file created)", () => {
    const w = fakeWriter();
    const fs = fakeFs({ "integrations/beta/manifest.ts": manifestSrc("beta"), [REGISTRY_PATH]: REGISTRY_SRC });
    const r = runAppTriggerScaffold("beta", "thing-happened", { dryRun: false }, fs, w);
    expect(r.code).toBe(0);
    expect(w.files.size).toBe(1);
    expect(r.output).toMatch(/not registered in integrations\/_registry\.ts/);
    expect(r.output).toMatch(/will NOT load/);
  });
});

describe("app trigger scaffold — dispatch via run()", () => {
  const rt = { nodeVersion: "v20.0.0", platform: "linux", cwd: "/repo", repoRoot: "/repo" };
  const providerFs = (): FsDeps => fakeFs({ "integrations/slack/manifest.ts": manifestSrc("slack") });

  it("`app trigger scaffold <p> <t> --dry-run` → exit 0, no writes", () => {
    const w = fakeWriter();
    const out: string[] = [];
    const code = run(["app", "trigger", "scaffold", "slack", "message-posted", "--dry-run"], { fs: providerFs(), writer: w, runtime: rt, log: (l) => out.push(l) });
    expect(code).toBe(0);
    expect(w.files.size).toBe(0);
    expect(out.join("\n")).toContain("app trigger scaffold: slack:message_posted");
  });

  it("`app trigger scaffold <p> <t>` → exit 0 and writes the meta", () => {
    const w = fakeWriter();
    const code = run(["app", "trigger", "scaffold", "slack", "message-posted"], { fs: providerFs(), writer: w, runtime: rt, log: () => {} });
    expect(code).toBe(0);
    expect(w.files.size).toBe(1);
  });

  it("`app trigger scaffold` with missing args → usage, exit 2", () => {
    const out: string[] = [];
    const code = run(["app", "trigger", "scaffold", "slack"], { fs: providerFs(), writer: fakeWriter(), runtime: rt, log: (l) => out.push(l) });
    expect(code).toBe(2);
    expect(out.join("\n")).toMatch(/Usage:.*app trigger scaffold/);
  });

  it("unknown `app trigger` subcommand → exit 2", () => {
    const out: string[] = [];
    const code = run(["app", "trigger", "bogus", "slack", "x"], { fs: providerFs(), writer: fakeWriter(), runtime: rt, log: (l) => out.push(l) });
    expect(code).toBe(2);
    expect(out.join("\n")).toMatch(/app trigger scaffold/);
  });

  it("unknown `app` subcommand mentions trigger scaffold", () => {
    const out: string[] = [];
    run(["app", "bogus"], { fs: fakeFs({}), writer: fakeWriter(), runtime: rt, log: (l) => out.push(l) });
    expect(out.join("\n")).toMatch(/trigger scaffold/);
  });
});

// ── verify --changed (diff-aware) ────────────────────────────────────────────
const fakeChanged = (files: string[], ok = true, error?: string): ChangedFilesReader => () => ({ ok, files, error });
const commandsOf = (paths: string[]): string[] => recommendChecks(paths).recommendations.map((r) => r.command);

describe("mergeChangedPaths (pure)", () => {
  it("dedupes across staged/unstaged/untracked and sorts deterministically", () => {
    expect(
      mergeChangedPaths([
        ["b.ts", "a.ts"], // unstaged
        ["a.ts", "c.ts"], // staged (a.ts dup)
        ["  ", "z.ts", "a.ts"], // untracked (blank trimmed, a.ts dup)
      ]),
    ).toEqual(["a.ts", "b.ts", "c.ts", "z.ts"]);
  });
  it("empty lists → empty", () => {
    expect(mergeChangedPaths([[], [], []])).toEqual([]);
  });
});

describe("recommendChecks (pure mapping)", () => {
  it("no changes → no recommendations", () => {
    const r = recommendChecks([]);
    expect(r.changedCount).toBe(0);
    expect(r.recommendations).toEqual([]);
  });

  it("CLI change → chainreact:build + chainreact jest + structure + typecheck", () => {
    const cmds = commandsOf(["scripts/chainreact/cli.ts"]);
    expect(cmds).toContain("npm run chainreact:build");
    expect(cmds).toContain("npx jest tests/unit/chainreact");
    expect(cmds).toContain("npm run typecheck");
    expect(cmds).toContain("npm run lint:structure");
  });

  it("CLI VALIDATION code change → app validate --all", () => {
    expect(commandsOf(["scripts/chainreact/actionRegistry.ts"])).toContain("npm run chainreact -- app validate --all");
    expect(commandsOf(["scripts/chainreact/commands/appValidate.ts"])).toContain("npm run chainreact -- app validate --all");
  });

  it("provider change → that provider's validate (not --all unless registry)", () => {
    const cmds = commandsOf(["integrations/slack/actions/sendChannelMessage.ts"]);
    expect(cmds).toContain("npm run chainreact -- app validate slack");
    expect(cmds).not.toContain("npm run chainreact -- app validate --all");
  });

  it("multiple providers → one validate each, sorted; excludes _-prefixed dirs", () => {
    const cmds = commandsOf([
      "integrations/stripe/actions/x.ts",
      "integrations/airtable/actions/y.ts",
      "integrations/_shared/util.ts", // not a provider
    ]);
    expect(cmds).toContain("npm run chainreact -- app validate airtable");
    expect(cmds).toContain("npm run chainreact -- app validate stripe");
    expect(cmds.indexOf("npm run chainreact -- app validate airtable")).toBeLessThan(
      cmds.indexOf("npm run chainreact -- app validate stripe"),
    );
    expect(cmds.some((c) => c.includes("_shared"))).toBe(false);
  });

  it("registry/discovery change → app validate --all", () => {
    expect(commandsOf(["integrations/_registry.ts"])).toContain("npm run chainreact -- app validate --all");
    expect(commandsOf(["services/discovery/_metaInventory.ts"])).toContain("npm run chainreact -- app validate --all");
    expect(commandsOf(["services/execution/handlers/_handlerInventory.ts"])).toContain("npm run chainreact -- app validate --all");
  });

  it("TypeScript source change → typecheck", () => {
    expect(commandsOf(["lib/foo.ts"])).toContain("npm run typecheck");
    expect(commandsOf(["app/page.tsx"])).toContain("npm run typecheck");
  });

  it("migration change → lint:migrations + security/structure suites (no DB write)", () => {
    const cmds = commandsOf(["supabase/migrations/20260101_add.sql"]);
    expect(cmds).toContain("npm run lint:migrations");
    expect(cmds).toContain("npx jest tests/integration/security");
    expect(cmds).toContain("npx jest tests/structure");
  });

  it("security/RLS change → security integration suite", () => {
    expect(commandsOf(["tests/integration/security/integrations-rls.test.ts"])).toContain("npx jest tests/integration/security");
    expect(commandsOf(["lib/security/policies.ts"])).toContain("npx jest tests/integration/security");
  });

  it("workflow-builder change → builder jest suite + typecheck", () => {
    const cmds = commandsOf(["features/workflow-builder/canvas/WorkflowCanvas.tsx"]);
    expect(cmds).toContain("npx jest tests/unit/features/workflow-builder");
    expect(cmds).toContain("npm run typecheck");
  });

  it("package/config change → lint + heavy full suite (heavy flagged)", () => {
    const r = recommendChecks(["package.json"]);
    const cmds = r.recommendations.map((x) => x.command);
    expect(cmds).toContain("npm run lint");
    const heavy = r.recommendations.find((x) => x.command === "npm run test");
    expect(heavy?.heavy).toBe(true);
  });

  it("orders cheap bare-scripts before targeted jest/app-validate checks", () => {
    const r = recommendChecks(["scripts/chainreact/cli.ts"]);
    const cmds = r.recommendations.map((x) => x.command);
    expect(cmds.indexOf("npm run typecheck")).toBeLessThan(cmds.indexOf("npx jest tests/unit/chainreact"));
  });

  it("every recommendation carries a structured exec (none print-only by default)", () => {
    const r = recommendChecks(["scripts/chainreact/commands/appValidate.ts", "integrations/slack/x.ts", "supabase/migrations/x.sql"]);
    for (const rec of r.recommendations) {
      expect(rec.exec).toBeDefined();
      expect(renderExecCommand(rec.exec!)).toBe(rec.command); // display matches structured form
    }
  });

  it("maps to the right structured exec kinds", () => {
    const byCmd = new Map(recommendChecks(["scripts/chainreact/commands/appValidate.ts", "integrations/slack/x.ts"]).recommendations.map((r) => [r.command, r.exec]));
    expect(byCmd.get("npm run typecheck")).toEqual({ kind: "npm-script", script: "typecheck" });
    expect(byCmd.get("npx jest tests/unit/chainreact")).toEqual({ kind: "jest", paths: ["tests/unit/chainreact"] });
    expect(byCmd.get("npm run chainreact -- app validate --all")).toEqual({ kind: "chainreact", args: ["app", "validate", "--all"] });
    expect(byCmd.get("npm run chainreact -- app validate slack")).toEqual({ kind: "chainreact", args: ["app", "validate", "slack"] });
  });
});

describe("structured command rendering + allow-list (pure)", () => {
  it("renders each ExecCommand kind to its canonical string", () => {
    expect(renderExecCommand({ kind: "npm-script", script: "typecheck" })).toBe("npm run typecheck");
    expect(renderExecCommand({ kind: "chainreact", args: ["app", "validate", "--all"] })).toBe("npm run chainreact -- app validate --all");
    expect(renderExecCommand({ kind: "jest", paths: ["tests/unit/chainreact"] })).toBe("npx jest tests/unit/chainreact");
  });

  it("allow-list ACCEPTS the expected safe commands", () => {
    const scripts = new Set(["typecheck", "chainreact", "lint:migrations"]);
    expect(validateExecCommand({ kind: "npm-script", script: "typecheck" }, scripts).ok).toBe(true);
    expect(validateExecCommand({ kind: "npm-script", script: "lint:migrations" }, scripts).ok).toBe(true);
    expect(validateExecCommand({ kind: "chainreact", args: ["app", "validate", "--all"] }, scripts).ok).toBe(true);
    expect(validateExecCommand({ kind: "chainreact", args: ["app", "validate", "slack"] }, scripts).ok).toBe(true);
    expect(validateExecCommand({ kind: "chainreact", args: ["app", "list"] }, scripts).ok).toBe(true);
    expect(validateExecCommand({ kind: "jest", paths: ["tests/unit/chainreact"] }, scripts).ok).toBe(true);
    expect(isAllowedChainreactArgs(["app", "validate", "--all", "--verbose"])).toBe(true);
  });

  it("allow-list REJECTS write/dangerous/arbitrary commands", () => {
    const scripts = new Set(["typecheck", "chainreact", "db:push", "deploy:prod", "build"]);
    // side-effecting npm scripts
    expect(validateExecCommand({ kind: "npm-script", script: "db:push" }, scripts)).toEqual({ ok: false, reason: "rejected" });
    expect(validateExecCommand({ kind: "npm-script", script: "deploy:prod" }, scripts)).toEqual({ ok: false, reason: "rejected" });
    expect(validateExecCommand({ kind: "npm-script", script: "build" }, scripts)).toEqual({ ok: false, reason: "rejected" });
    // missing script (not in package.json)
    expect(validateExecCommand({ kind: "npm-script", script: "nope" }, scripts)).toEqual({ ok: false, reason: "missing-script" });
    // chainreact WRITE commands are not auto-runnable
    expect(isAllowedChainreactArgs(["app", "scaffold", "linear"])).toBe(false);
    expect(isAllowedChainreactArgs(["app", "register", "linear"])).toBe(false);
    expect(isAllowedChainreactArgs(["app", "action", "scaffold", "slack", "x"])).toBe(false);
    expect(isAllowedChainreactArgs(["app", "validate", "Bad Id!"])).toBe(false);
    expect(validateExecCommand({ kind: "chainreact", args: ["app", "scaffold", "x"] }, scripts)).toEqual({ ok: false, reason: "rejected" });
    // jest: bare/full-suite + traversal + non-tests paths
    expect(isAllowedJestPaths([])).toBe(false);
    expect(isAllowedJestPaths(["tests/../secrets"])).toBe(false);
    expect(isAllowedJestPaths(["src/whatever"])).toBe(false);
    expect(isAllowedJestPaths(["tests/unit/chainreact"])).toBe(true);
  });

  it("classifyRec: missing chainreact script → missing; rejected exec → manual", () => {
    const rec = { command: "x", exec: { kind: "chainreact" as const, args: ["app", "validate", "--all"] }, heavy: false, reason: "r" };
    expect(classifyRec(rec, false, new Set())).toBe("missing"); // no "chainreact" script
    const writeRec = { command: "y", exec: { kind: "chainreact" as const, args: ["app", "scaffold", "x"] }, heavy: false, reason: "r" };
    expect(classifyRec(writeRec, false, new Set(["chainreact"]))).toBe("manual"); // rejected by allow-list
    const manualRec = { command: "z", heavy: false, reason: "r" }; // no exec
    expect(classifyRec(manualRec, false, new Set())).toBe("manual");
  });
});

// Scripts available in the fake repo (chainreact present so chainreact-exec is allowed).
const EXEC_SCRIPTS = new Set(["lint:structure", "typecheck", "lint", "lint:migrations", "chainreact:build", "chainreact", "test"]);
const runChanged = (
  files: string[],
  flags: { run: boolean; withTests: boolean },
  executor: CommandExecutor & { calls: string[] },
  scripts: ReadonlySet<string> = EXEC_SCRIPTS,
) => {
  const plan = buildChangedVerifyPlan({ ok: true, files }, flags);
  const classified = classifyRecommendations(plan, scripts);
  const outcome = executeChangedVerify(classified, executor);
  return { plan, classified, outcome };
};

describe("buildChangedVerifyPlan / executeChangedVerify (structured)", () => {
  it("git failure → ok:false + error, no recommendations", () => {
    const plan = buildChangedVerifyPlan({ ok: false, files: [], error: "not a git repository" }, { run: true, withTests: false });
    expect(plan.ok).toBe(false);
    expect(plan.error).toMatch(/not a git repository/);
    expect(plan.result).toBeNull();
  });

  it("--run executes auto bare-scripts AND structured targeted checks, in order; not heavy", () => {
    const exec = fakeExecutor();
    const { outcome } = runChanged(["scripts/chainreact/cli.ts", "lib/x.ts"], { run: true, withTests: false }, exec);
    expect(exec.calls).toEqual(["npm run lint:structure", "npm run typecheck", "npm run chainreact:build", "npx jest tests/unit/chainreact"]);
    expect(exec.calls.some((c) => c === "npm run test")).toBe(false);
    expect(outcome.allPassed).toBe(true);
  });

  it("executes `app validate --all` (chainreact) when validation code changed", () => {
    const exec = fakeExecutor();
    runChanged(["scripts/chainreact/commands/appValidate.ts"], { run: true, withTests: false }, exec);
    expect(exec.calls).toContain("npm run chainreact -- app validate --all");
  });

  it("executes provider-specific `app validate <provider>`", () => {
    const exec = fakeExecutor();
    runChanged(["integrations/slack/actions/sendChannelMessage.ts"], { run: true, withTests: false }, exec);
    expect(exec.calls).toContain("npm run chainreact -- app validate slack");
  });

  it("executes a targeted jest path", () => {
    const exec = fakeExecutor();
    runChanged(["features/workflow-builder/canvas/x.tsx"], { run: true, withTests: false }, exec);
    expect(exec.calls).toContain("npx jest tests/unit/features/workflow-builder");
  });

  it("heavy full-suite runs only with --with-tests", () => {
    const noTests = fakeExecutor();
    runChanged(["package.json"], { run: true, withTests: false }, noTests);
    expect(noTests.calls).not.toContain("npm run test");

    const withTests = fakeExecutor();
    runChanged(["package.json"], { run: true, withTests: true }, withTests);
    expect(withTests.calls).toContain("npm run test");
  });

  it("manual-only (allow-list-rejected exec) is NOT executed", () => {
    // Inject a plan whose rec is a WRITE chainreact command → classified manual.
    const plan = buildChangedVerifyPlan({ ok: true, files: ["x"] }, { run: true, withTests: false });
    const classified = [
      { rec: { command: "npm run chainreact -- app scaffold linear", exec: { kind: "chainreact" as const, args: ["app", "scaffold", "linear"] }, heavy: false, reason: "r" }, tier: "manual" as const },
    ];
    const exec = fakeExecutor();
    const outcome = executeChangedVerify(classified, exec);
    expect(exec.calls).toEqual([]);
    expect(outcome.executed).toEqual([]);
    void plan;
  });

  it("fail-fast: stops at the first failing auto check", () => {
    const exec = fakeExecutor({ "npm run typecheck": 1 });
    const { outcome } = runChanged(["scripts/chainreact/cli.ts"], { run: true, withTests: false }, exec);
    expect(exec.calls).toEqual(["npm run lint:structure", "npm run typecheck"]); // stops; build/jest not reached
    expect(outcome.allPassed).toBe(false);
  });

  it("a recommended npm script missing from package.json is skipped, not run", () => {
    const exec = fakeExecutor();
    const { outcome } = runChanged(["supabase/migrations/x.sql"], { run: true, withTests: false }, exec, new Set(["chainreact"])); // no lint:migrations
    expect(exec.calls).not.toContain("npm run lint:migrations");
    expect(outcome.skippedMissing).toContain("npm run lint:migrations");
    expect(outcome.allPassed).toBe(false); // surfaced as non-passing
  });

  it("renderChangedVerify shows graceful git-failure fallback", () => {
    const plan = buildChangedVerifyPlan({ ok: false, files: [], error: "git not found on PATH" }, { run: false, withTests: false });
    const out = renderChangedVerify(plan, [], null);
    expect(out).toMatch(/Could not determine changed files/);
    expect(out).toMatch(/chainreact -- verify/);
  });

  it("renderChangedVerify reports no changed files", () => {
    const plan = buildChangedVerifyPlan({ ok: true, files: [] }, { run: false, withTests: false });
    expect(renderChangedVerify(plan, [], null)).toMatch(/No changed files/);
  });

  it("renderChangedVerify lists not-executed heavy/manual under --run", () => {
    const exec = fakeExecutor();
    const { plan, classified, outcome } = runChanged(["package.json"], { run: true, withTests: false }, exec);
    const out = renderChangedVerify(plan, classified, outcome);
    expect(out).toMatch(/Still recommended \(NOT executed/);
    expect(out).toMatch(/npm run test/);
  });
});

describe("verify --changed — dispatch via run()", () => {
  const rt = { nodeVersion: "v20.0.0", platform: "linux", cwd: "/repo", repoRoot: "/repo" };

  it("dry-run does NOT execute anything (executor untouched), exit 0", () => {
    const executor = fakeExecutor();
    const out: string[] = [];
    const code = run(["verify", "--changed"], {
      changedFiles: fakeChanged(["scripts/chainreact/cli.ts"]),
      executor,
      availableScripts: EXEC_SCRIPTS,
      runtime: rt,
      log: (l) => out.push(l),
    });
    expect(code).toBe(0);
    expect(executor.calls).toEqual([]);
    expect(out.join("\n")).toContain("verify --changed (dry-run)");
    expect(out.join("\n")).toContain("[auto ] npm run chainreact:build");
    expect(out.join("\n")).toContain("[auto ] npx jest tests/unit/chainreact"); // now auto, not manual
  });

  it("--changed --run executes auto checks (bare scripts + structured) via the executor", () => {
    const executor = fakeExecutor();
    const code = run(["verify", "--changed", "--run"], {
      changedFiles: fakeChanged(["scripts/chainreact/commands/appValidate.ts", "integrations/slack/x.ts"]),
      executor,
      availableScripts: EXEC_SCRIPTS,
      runtime: rt,
      log: () => {},
    });
    expect(code).toBe(0);
    expect(executor.calls).toContain("npm run typecheck");
    expect(executor.calls).toContain("npx jest tests/unit/chainreact");
    expect(executor.calls).toContain("npm run chainreact -- app validate --all");
    expect(executor.calls).toContain("npm run chainreact -- app validate slack");
    expect(executor.calls).not.toContain("npm run test"); // heavy gated
  });

  it("git failure → exit 1, graceful message, executor untouched", () => {
    const executor = fakeExecutor();
    const out: string[] = [];
    const code = run(["verify", "--changed", "--run"], {
      changedFiles: fakeChanged([], false, "not a git repository (or git unavailable)"),
      executor,
      availableScripts: EXEC_SCRIPTS,
      runtime: rt,
      log: (l) => out.push(l),
    });
    expect(code).toBe(1);
    expect(executor.calls).toEqual([]);
    expect(out.join("\n")).toMatch(/Could not determine changed files/);
  });

  it("no changed files → exit 0, nothing run", () => {
    const executor = fakeExecutor();
    const out: string[] = [];
    const code = run(["verify", "--changed", "--run"], {
      changedFiles: fakeChanged([]),
      executor,
      availableScripts: EXEC_SCRIPTS,
      runtime: rt,
      log: (l) => out.push(l),
    });
    expect(code).toBe(0);
    expect(executor.calls).toEqual([]);
    expect(out.join("\n")).toMatch(/No changed files/);
  });

  it("existing `verify` (no --changed) is unchanged: dry-run, runner untouched", () => {
    const runner = fakeRunner();
    const out: string[] = [];
    const code = run(["verify"], { runner, availableScripts: EXEC_SCRIPTS, runtime: rt, log: (l) => out.push(l) });
    expect(code).toBe(0);
    expect(runner.calls).toEqual([]);
    expect(out.join("\n")).toContain("ChainReact — verify (dry-run)");
  });

  it("existing `verify --run` is unchanged: runs the fixed safe subset via the npm-script runner", () => {
    const runner = fakeRunner();
    const executor = fakeExecutor();
    const code = run(["verify", "--run"], { runner, executor, availableScripts: EXEC_SCRIPTS, runtime: rt, log: () => {} });
    expect(code).toBe(0);
    expect(runner.calls).toEqual(["lint:structure", "typecheck", "lint"]); // plain verify still uses CommandRunner
    expect(executor.calls).toEqual([]); // structured executor untouched by plain verify
  });
});

// ── verify --changed --report (closeout) ─────────────────────────────────────
// Build a report for a given diff + flags, mirroring the CLI: execute ONLY in
// run mode (dry-run → outcome null), exactly like cli.ts does.
const reportFor = (files: string[], flags: { run: boolean; withTests: boolean }, byCommand: Record<string, number> = {}) => {
  const plan = buildChangedVerifyPlan({ ok: true, files }, flags);
  const classified = classifyRecommendations(plan, EXEC_SCRIPTS);
  const outcome = flags.run ? executeChangedVerify(classified, fakeExecutor(byCommand)) : null;
  return buildChangedReport(plan, classified, outcome);
};

describe("computeFinalStatus", () => {
  it("ERROR on git failure", () => {
    expect(computeFinalStatus(buildChangedVerifyPlan({ ok: false, files: [], error: "x" }, { run: true, withTests: false }), null)).toBe("ERROR");
  });
  it("NO-CHANGES when no files", () => {
    expect(computeFinalStatus(buildChangedVerifyPlan({ ok: true, files: [] }, { run: true, withTests: false }), null)).toBe("NO-CHANGES");
  });
  it("DRY-RUN when not run", () => {
    expect(computeFinalStatus(buildChangedVerifyPlan({ ok: true, files: ["lib/a.ts"] }, { run: false, withTests: false }), null)).toBe("DRY-RUN");
  });
  it("PASS / FAIL in run mode", () => {
    const plan = buildChangedVerifyPlan({ ok: true, files: ["lib/a.ts"] }, { run: true, withTests: false });
    expect(computeFinalStatus(plan, { executed: [{ command: "npm run typecheck", status: 0, passed: true }], skippedMissing: [], allPassed: true })).toBe("PASS");
    expect(computeFinalStatus(plan, { executed: [{ command: "npm run typecheck", status: 1, passed: false }], skippedMissing: [], allPassed: false })).toBe("FAIL");
  });
});

describe("buildChangedReport + next commands", () => {
  it("dry-run: DRY-RUN status, suggests --run (and --with-tests when heavy present)", () => {
    const r = reportFor(["scripts/chainreact/cli.ts"], { run: false, withTests: false });
    expect(r.finalStatus).toBe("DRY-RUN");
    expect(r.executed).toEqual([]);
    expect(r.nextCommands).toContain("npm run chainreact -- verify --changed --run");

    const heavy = reportFor(["package.json"], { run: false, withTests: false });
    expect(heavy.nextCommands).toContain("npm run chainreact -- verify --changed --run --with-tests");
  });

  it("dry-run with provider validation recommended → suggests app validate --all", () => {
    const r = reportFor(["integrations/slack/actions/x.ts"], { run: false, withTests: false });
    expect(r.nextCommands).toContain("npm run chainreact -- app validate --all");
  });

  it("run pass: PASS status; suggests --with-tests only when heavy gated", () => {
    const r = reportFor(["lib/a.ts"], { run: true, withTests: false }); // typecheck + lint:structure only
    expect(r.finalStatus).toBe("PASS");
    expect(r.executed.every((e) => e.passed)).toBe(true);
    expect(r.nextCommands).not.toContain("npm run chainreact -- verify --changed --run"); // no noisy re-run advice

    const heavy = reportFor(["package.json"], { run: true, withTests: false });
    expect(heavy.finalStatus).toBe("PASS");
    expect(heavy.nextCommands).toContain("npm run chainreact -- verify --changed --run --with-tests");
  });

  it("run fail: FAIL status, failed command + fail-fast not-run captured", () => {
    // CLI change → lint:structure, typecheck, chainreact:build, jest chainreact (auto, in order).
    const r = reportFor(["scripts/chainreact/cli.ts"], { run: true, withTests: false }, { "npm run typecheck": 1 });
    expect(r.finalStatus).toBe("FAIL");
    expect(r.failedCommand).toEqual({ command: "npm run typecheck", status: 1 });
    // everything after typecheck didn't run (fail-fast)
    expect(r.notRunDueToFailFast).toContain("npm run chainreact:build");
    expect(r.notRunDueToFailFast).toContain("npx jest tests/unit/chainreact");
    expect(r.nextCommands.some((c) => c.startsWith("npm run typecheck") && c.includes("# fix"))).toBe(true);
  });

  it("run fail before app-validate → still suggests app validate --all", () => {
    // validation-code change → includes app validate --all (auto, after the cheap scripts).
    const r = reportFor(["scripts/chainreact/commands/appValidate.ts"], { run: true, withTests: false }, { "npm run lint:structure": 1 });
    expect(r.finalStatus).toBe("FAIL");
    expect(r.nextCommands).toContain("npm run chainreact -- app validate --all");
  });

  it("no-changes report", () => {
    const r = reportFor([], { run: true, withTests: false });
    expect(r.finalStatus).toBe("NO-CHANGES");
    expect(r.nextCommands).toContain("npm run chainreact -- verify");
  });

  it("git-failure report", () => {
    const plan = buildChangedVerifyPlan({ ok: false, files: [], error: "not a git repository" }, { run: true, withTests: false });
    const r = buildChangedReport(plan, [], null);
    expect(r.finalStatus).toBe("ERROR");
    expect(r.error).toMatch(/not a git repository/);
    expect(r.nextCommands).toContain("npm run chainreact -- verify");
  });
});

describe("renderChangedReport + JSON", () => {
  it("renders a compact summary with status/changed/next", () => {
    const out = renderChangedReport(reportFor(["scripts/chainreact/cli.ts"], { run: false, withTests: false }));
    expect(out).toContain("── verify --changed summary ──");
    expect(out).toContain("status: DRY-RUN");
    expect(out).toContain("changed files: 1");
    expect(out).toContain("next:");
  });

  it("run-fail render shows failed command + fail-fast line", () => {
    const out = renderChangedReport(reportFor(["scripts/chainreact/cli.ts"], { run: true, withTests: false }, { "npm run typecheck": 1 }));
    expect(out).toContain("status: FAIL");
    expect(out).toMatch(/failed command: npm run typecheck \(exit 1\)/);
    expect(out).toMatch(/not run \(fail-fast/);
  });

  it("report output contains no shell-injection metacharacters", () => {
    const out = renderChangedReport(reportFor(["scripts/chainreact/commands/appValidate.ts", "integrations/slack/x.ts", "supabase/migrations/x.sql"], { run: true, withTests: true }, { "npm run lint:structure": 1 }));
    for (const bad of [";", "&&", "||", "|", "`", "$(", ">", "<"]) {
      expect(out.includes(bad)).toBe(false);
    }
  });

  it("JSON mode is deterministic and parses with the documented shape", () => {
    const json = renderChangedReportJson(reportFor(["scripts/chainreact/cli.ts"], { run: false, withTests: false }));
    expect(json).toBe(renderChangedReportJson(reportFor(["scripts/chainreact/cli.ts"], { run: false, withTests: false }))); // deterministic
    const parsed = JSON.parse(json);
    expect(parsed.finalStatus).toBe("DRY-RUN");
    expect(parsed.changedFiles).toBe(1);
    expect(Array.isArray(parsed.recommendations)).toBe(true);
    expect(Array.isArray(parsed.executed)).toBe(true);
    expect(parsed.nextCommands).toContain("npm run chainreact -- verify --changed --run");
  });
});

describe("verify --changed --report / --json — dispatch via run()", () => {
  const rt = { nodeVersion: "v20.0.0", platform: "linux", cwd: "/repo", repoRoot: "/repo" };

  it("--report appends the summary block after normal output (exit 0)", () => {
    const out: string[] = [];
    const code = run(["verify", "--changed", "--report"], {
      changedFiles: fakeChanged(["scripts/chainreact/cli.ts"]),
      executor: fakeExecutor(),
      availableScripts: EXEC_SCRIPTS,
      runtime: rt,
      log: (l) => out.push(l),
    });
    expect(code).toBe(0);
    const joined = out.join("\n");
    expect(joined).toContain("Recommended commands"); // normal output still present
    expect(joined).toContain("── verify --changed summary ──"); // + report block
    expect(joined).toContain("status: DRY-RUN");
  });

  it("--json emits ONLY JSON (no human output)", () => {
    const out: string[] = [];
    run(["verify", "--changed", "--json"], {
      changedFiles: fakeChanged(["scripts/chainreact/cli.ts"]),
      executor: fakeExecutor(),
      availableScripts: EXEC_SCRIPTS,
      runtime: rt,
      log: (l) => out.push(l),
    });
    const joined = out.join("\n");
    expect(joined).not.toContain("Recommended commands");
    expect(joined).not.toContain("── verify --changed summary ──");
    expect(() => JSON.parse(joined)).not.toThrow();
    expect(JSON.parse(joined).finalStatus).toBe("DRY-RUN");
  });

  it("--run --report: executes + reports; exit reflects pass/fail", () => {
    const out: string[] = [];
    const code = run(["verify", "--changed", "--run", "--report"], {
      changedFiles: fakeChanged(["scripts/chainreact/cli.ts"]),
      executor: fakeExecutor({ "npm run typecheck": 1 }),
      availableScripts: EXEC_SCRIPTS,
      runtime: rt,
      log: (l) => out.push(l),
    });
    expect(code).toBe(1);
    expect(out.join("\n")).toContain("status: FAIL");
  });

  it("--json on git failure exits 1 and emits ERROR json", () => {
    const out: string[] = [];
    const code = run(["verify", "--changed", "--json"], {
      changedFiles: fakeChanged([], false, "not a git repository"),
      executor: fakeExecutor(),
      availableScripts: EXEC_SCRIPTS,
      runtime: rt,
      log: (l) => out.push(l),
    });
    expect(code).toBe(1);
    expect(JSON.parse(out.join("\n")).finalStatus).toBe("ERROR");
  });
});
