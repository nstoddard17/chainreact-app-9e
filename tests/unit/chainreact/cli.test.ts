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
import {
  renderValidation,
  renderValidationSummary,
  summarizeValidation,
  validateAllProviders,
  validateProvider,
  verdictOf,
} from "@/scripts/chainreact/commands/appValidate";
import { inventoryAllProviders, listKnownProviders } from "@/scripts/chainreact/providers";
import { checkManifestContent, checkMetaContent, hasTopLevelKey } from "@/scripts/chainreact/commands/metaChecks";
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
});
