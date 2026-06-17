/**
 * Internal ChainReact CLI — `verify` command.
 *
 * Prints the verification batch a developer/agent should run before push/deploy,
 * and (only with `--run`) executes the SAFE subset. It reuses EXISTING package.json
 * scripts — it invents no new verification standard and duplicates no logic.
 *
 * Conservative by default:
 *   - no flags        → dry-run: print the plan, run nothing.
 *   - --run           → run the safe subset (lint:structure, typecheck, lint).
 *   - --run --with-tests → also run the full jest suite (heavy; opt-in).
 *
 * Execution is funneled through the injectable `CommandRunner` so tests assert the
 * planned commands without running anything expensive.
 */
import type { ChangedFilesResult } from "../git";
import { type CommandExecutor, type CommandRunner, type ExecCommand, validateExecCommand } from "../runner";

export interface VerifyStep {
  readonly name: string;
  /** The package.json script this step runs (reused, never reinvented). */
  readonly npmScript: string;
  /** Heavy steps (full test suite) only run with --with-tests. */
  readonly heavy: boolean;
  readonly why: string;
}

/** The standard pre-push/pre-deploy batch, ordered cheap → expensive. */
export const VERIFY_STEPS: readonly VerifyStep[] = [
  { name: "structure", npmScript: "lint:structure", heavy: false, why: "leaf-folder file-count cap (cheap, always safe)" },
  { name: "typecheck", npmScript: "typecheck", heavy: false, why: "tsc --noEmit across the repo" },
  { name: "lint", npmScript: "lint", heavy: false, why: "eslint . (repo-wide)" },
  { name: "test", npmScript: "test", heavy: true, why: "full jest suite (heavy — prefer targeted runs; opt-in via --with-tests)" },
];

export interface VerifyFlags {
  readonly run: boolean;
  readonly withTests: boolean;
}

export interface PlannedStep extends VerifyStep {
  readonly willRun: boolean;
  readonly note: string;
}

export interface VerifyPlan {
  readonly mode: "dry-run" | "run";
  readonly steps: readonly PlannedStep[];
}

/** Decide which steps would run for the given flags. Pure. */
export function buildVerifyPlan(flags: VerifyFlags): VerifyPlan {
  const mode: VerifyPlan["mode"] = flags.run ? "run" : "dry-run";
  const steps = VERIFY_STEPS.map<PlannedStep>((step) => {
    if (!flags.run) return { ...step, willRun: false, note: "recommended (dry-run — pass --run to execute)" };
    if (step.heavy && !flags.withTests) return { ...step, willRun: false, note: "skipped (heavy — pass --with-tests to include)" };
    return { ...step, willRun: true, note: "will run" };
  });
  return { mode, steps };
}

export interface StepResult {
  readonly name: string;
  readonly npmScript: string;
  readonly status: number | null;
  readonly passed: boolean;
}

export interface VerifyOutcome {
  readonly results: readonly StepResult[];
  readonly allPassed: boolean;
  readonly skippedMissing: readonly string[];
}

/**
 * Execute the steps marked `willRun`, in order, via the injected runner. Stops at
 * the first failure (fail-fast) so a developer sees the first blocker. A planned
 * script that is not in `availableScripts` is reported as skipped, not run.
 */
export function executeVerify(
  plan: VerifyPlan,
  runner: CommandRunner,
  availableScripts: ReadonlySet<string>,
): VerifyOutcome {
  const results: StepResult[] = [];
  const skippedMissing: string[] = [];
  for (const step of plan.steps) {
    if (!step.willRun) continue;
    if (!availableScripts.has(step.npmScript)) {
      skippedMissing.push(step.npmScript);
      continue;
    }
    const r = runner(step.npmScript);
    const passed = r.status === 0;
    results.push({ name: step.name, npmScript: step.npmScript, status: r.status, passed });
    if (!passed) break; // fail-fast
  }
  const allPassed = results.length > 0 && results.every((r) => r.passed) && skippedMissing.length === 0;
  return { results, allPassed, skippedMissing };
}

/** Render the plan (and optional execution outcome). Pure. */
export function renderVerify(plan: VerifyPlan, outcome: VerifyOutcome | null): string {
  const lines: string[] = [
    `ChainReact — verify (${plan.mode})`,
    "Reuses existing package.json scripts. Run these before push/deploy:",
    "",
  ];
  for (const step of plan.steps) {
    lines.push(`  - ${step.name.padEnd(10)} npm run ${step.npmScript.padEnd(16)} — ${step.note}`);
    lines.push(`    why: ${step.why}`);
  }
  if (plan.mode === "dry-run") {
    lines.push(
      "",
      "Dry-run: nothing was executed. Re-run with --run to execute the safe subset,",
      "or --run --with-tests to also run the full jest suite.",
    );
    return lines.join("\n");
  }

  lines.push("", "Execution:");
  if (outcome) {
    for (const r of outcome.results) {
      lines.push(`  [${r.passed ? "PASS" : "FAIL"}] npm run ${r.npmScript} (exit ${r.status})`);
    }
    for (const missing of outcome.skippedMissing) {
      lines.push(`  [SKIP] npm run ${missing} — script not found in package.json`);
    }
    lines.push("", outcome.allPassed ? "All executed checks passed." : "One or more checks failed (stopped at first failure).");
  }
  return lines.join("\n");
}

// ─────────────────────── verify --changed (diff-aware) ───────────────────────

/**
 * One recommended check. `exec` is the STRUCTURED form (npm-script / chainreact /
 * jest) the executor can run safely under `--run`; it is set for every
 * auto-runnable check. A recommendation with no `exec` (or whose `exec` the
 * allow-list rejects at run time) is manual-only — printed for the human/agent to
 * run, never auto-executed.
 */
export interface CheckRecommendation {
  /** Full, copy-pasteable command. Always printed. Matches renderExecCommand(exec). */
  readonly command: string;
  /** Structured, allow-list-checked command when auto-runnable; absent → manual. */
  readonly exec?: ExecCommand;
  /** Heavy (full suite) — only auto-run with --with-tests. */
  readonly heavy: boolean;
  /** Why this check is recommended (grouped in output). */
  readonly reason: string;
}

export interface RecommendationResult {
  readonly changedCount: number;
  readonly recommendations: readonly CheckRecommendation[];
}

/** Match `integrations/<provider>/…` (excluding `_`-prefixed shared/registry dirs). */
const PROVIDER_RE = /^integrations\/([a-z0-9][a-z0-9_-]*)\//;
const TS_RE = /\.(ts|tsx|mts|cts)$/;
/** Source/test trees where adding/moving files can trip the leaf-folder cap. */
const SOURCE_TREE_RE = /^(integrations|services|app|features|components|lib|core|hooks|stores|contracts|scripts|tests)\//;

/**
 * Map changed paths → the smallest sensible verification batch. PURE +
 * deterministic. Reuses existing package.json scripts only; never invents one.
 * Ordered cheap → heavy, deduped by command.
 */
export function recommendChecks(changedPaths: readonly string[]): RecommendationResult {
  const recs: CheckRecommendation[] = [];
  const seen = new Set<string>();
  const add = (r: CheckRecommendation): void => {
    if (seen.has(r.command)) return;
    seen.add(r.command);
    recs.push(r);
  };

  const has = (pred: (p: string) => boolean): boolean => changedPaths.some(pred);
  const cli = has((p) => p.startsWith("scripts/chainreact/"));
  const ts = has((p) => TS_RE.test(p));
  const sourceOrTest = has((p) => SOURCE_TREE_RE.test(p));
  const migrations = has((p) => p.startsWith("supabase/migrations/") && p.endsWith(".sql"));
  const security = has((p) => /(^|\/)(security|rls|policies|admin-auth)/i.test(p) || p.startsWith("tests/integration/security/"));
  const discovery = has(
    (p) =>
      p === "integrations/_registry.ts" ||
      p.startsWith("services/discovery/") ||
      p.startsWith("services/execution/handlers/"),
  );
  const cliValidation = has(
    (p) =>
      p.startsWith("scripts/chainreact/commands/appValidate") ||
      p === "scripts/chainreact/actionRegistry.ts" ||
      p === "scripts/chainreact/registry.ts" ||
      p === "scripts/chainreact/providers.ts",
  );
  const builder = has((p) => p.startsWith("features/workflow-builder/") || p.startsWith("services/execution/") || p.startsWith("lib/triggers/") || p.startsWith("services/triggers/"));
  const config = has((p) => /^(package\.json|package-lock\.json|tsconfig.*\.json|eslint\.config\.mjs|jest\.config\.(js|ts|mjs|cjs))$/.test(p));
  const providers = [...new Set(changedPaths.map((p) => PROVIDER_RE.exec(p)?.[1]).filter((x): x is string => Boolean(x)))].sort();

  const npmScript = (script: string): ExecCommand => ({ kind: "npm-script", script });
  const jest = (...paths: string[]): ExecCommand => ({ kind: "jest", paths });
  const chainreact = (...args: string[]): ExecCommand => ({ kind: "chainreact", args });

  // ── cheap bare scripts (cheap → ...) ──
  if (sourceOrTest) {
    add({ command: "npm run lint:structure", exec: npmScript("lint:structure"), heavy: false, reason: "source/test files changed — leaf-folder file-count cap (cheap, always safe)" });
  }
  if (ts) {
    add({ command: "npm run typecheck", exec: npmScript("typecheck"), heavy: false, reason: "TypeScript changed — tsc --noEmit across the repo" });
  }
  if (cli) {
    add({ command: "npm run chainreact:build", exec: npmScript("chainreact:build"), heavy: false, reason: "scripts/chainreact changed — compile the operator CLI" });
  }
  if (migrations) {
    add({ command: "npm run lint:migrations", exec: npmScript("lint:migrations"), heavy: false, reason: "migration changed — RLS/grant migration lint (no DB write)" });
  }
  if (config) {
    add({ command: "npm run lint", exec: npmScript("lint"), heavy: false, reason: "package/config changed — eslint . (repo-wide)" });
  }

  // ── targeted (now auto-runnable via the structured executor + allow-list) ──
  if (cli) {
    add({ command: "npx jest tests/unit/chainreact", exec: jest("tests/unit/chainreact"), heavy: false, reason: "scripts/chainreact changed — operator-CLI unit suite" });
  }
  for (const provider of providers) {
    add({ command: `npm run chainreact -- app validate ${provider}`, exec: chainreact("app", "validate", provider), heavy: false, reason: `integrations/${provider}/ changed — validate that provider's metadata` });
  }
  if (discovery || cliValidation) {
    add({ command: "npm run chainreact -- app validate --all", exec: chainreact("app", "validate", "--all"), heavy: false, reason: "registry/discovery (or CLI validation code) changed — validate every provider" });
  }
  if (builder) {
    add({ command: "npx jest tests/unit/features/workflow-builder", exec: jest("tests/unit/features/workflow-builder"), heavy: false, reason: "workflow-builder/execution changed — builder unit suite" });
  }
  if (security || migrations) {
    add({ command: "npx jest tests/integration/security", exec: jest("tests/integration/security"), heavy: false, reason: "security/RLS/migration changed — security integration suite (no DB write / no secrets)" });
    add({ command: "npx jest tests/structure", exec: jest("tests/structure"), heavy: false, reason: "security/RLS/migration changed — structural guards (grants, coverage)" });
  }

  // ── heavy (only auto-run with --with-tests) ──
  if (config) {
    add({ command: "npm run test", exec: npmScript("test"), heavy: true, reason: "package/config changed — full jest suite advisable (heavy; opt-in via --with-tests)" });
  }

  return { changedCount: changedPaths.length, recommendations: recs };
}

export interface ChangedVerifyPlan {
  readonly mode: "dry-run" | "run";
  readonly ok: boolean;
  /** git-discovery error (graceful) when `ok` is false. */
  readonly error?: string;
  readonly changedFiles: readonly string[];
  readonly result: RecommendationResult | null;
  readonly withTests: boolean;
}

export interface ChangedVerifyFlags {
  readonly run: boolean;
  readonly withTests: boolean;
}

/** Build the changed-aware plan from a (possibly failed) git read. Pure. */
export function buildChangedVerifyPlan(changed: ChangedFilesResult, flags: ChangedVerifyFlags): ChangedVerifyPlan {
  const mode: ChangedVerifyPlan["mode"] = flags.run ? "run" : "dry-run";
  if (!changed.ok) {
    return { mode, ok: false, error: changed.error, changedFiles: [], result: null, withTests: flags.withTests };
  }
  return { mode, ok: true, changedFiles: changed.files, result: recommendChecks(changed.files), withTests: flags.withTests };
}

/**
 * Disposition of a recommendation for the current flags + available scripts:
 *   - `auto`    — safe + runnable now (executed under --run).
 *   - `heavy`   — full suite; runs only with --with-tests (shown as HEAVY).
 *   - `manual`  — no structured form, or allow-list rejected → print, don't run.
 *   - `missing` — references an npm script not in package.json → skip gracefully.
 */
export type RecTier = "auto" | "heavy" | "manual" | "missing";

export interface ClassifiedRec {
  readonly rec: CheckRecommendation;
  readonly tier: RecTier;
}

/** Classify one recommendation. Pure (no execution). */
export function classifyRec(rec: CheckRecommendation, withTests: boolean, availableScripts: ReadonlySet<string>): RecTier {
  if (!rec.exec) return "manual";
  const v = validateExecCommand(rec.exec, availableScripts);
  if (!v.ok) return v.reason === "missing-script" ? "missing" : "manual";
  if (rec.heavy && !withTests) return "heavy";
  return "auto";
}

/** Classify every recommendation in the plan. Pure. */
export function classifyRecommendations(plan: ChangedVerifyPlan, availableScripts: ReadonlySet<string>): ClassifiedRec[] {
  return (plan.result?.recommendations ?? []).map((rec) => ({ rec, tier: classifyRec(rec, plan.withTests, availableScripts) }));
}

export interface ExecResult {
  /** Display command that was executed. */
  readonly command: string;
  readonly status: number | null;
  readonly passed: boolean;
}

export interface ChangedVerifyOutcome {
  readonly executed: readonly ExecResult[];
  /** Display commands skipped because their npm script is absent. */
  readonly skippedMissing: readonly string[];
  readonly allPassed: boolean;
}

/**
 * Execute the `auto`-tier recommendations, in order, fail-fast, via the injected
 * structured executor. `heavy`/`manual` recs are never executed; `missing` recs
 * are reported (and make the run non-passing so the gap is visible).
 */
export function executeChangedVerify(classified: readonly ClassifiedRec[], executor: CommandExecutor): ChangedVerifyOutcome {
  const executed: ExecResult[] = [];
  const skippedMissing = classified.filter((c) => c.tier === "missing").map((c) => c.rec.command);
  for (const { rec, tier } of classified) {
    if (tier !== "auto") continue;
    const r = executor(rec.exec as ExecCommand);
    const passed = r.status === 0;
    executed.push({ command: rec.command, status: r.status, passed });
    if (!passed) break; // fail-fast
  }
  const allPassed = executed.every((e) => e.passed) && skippedMissing.length === 0;
  return { executed, skippedMissing, allPassed };
}

const TIER_LABEL: Record<RecTier, string> = { auto: "auto ", heavy: "HEAVY", manual: "manual", missing: "missng" };

/** Render the changed-aware plan + classification (and optional execution outcome). Pure. */
export function renderChangedVerify(
  plan: ChangedVerifyPlan,
  classified: readonly ClassifiedRec[],
  outcome: ChangedVerifyOutcome | null,
): string {
  const lines: string[] = [`ChainReact — verify --changed (${plan.mode})`];

  if (!plan.ok) {
    lines.push(
      "",
      `Could not determine changed files: ${plan.error ?? "unknown error"}.`,
      "Fall back to the standard batch: `npm run chainreact -- verify` (add --run to execute).",
    );
    return lines.join("\n");
  }

  lines.push(`  changed files: ${plan.changedFiles.length}`, "");

  if (plan.changedFiles.length === 0) {
    lines.push(
      "No changed files in the working tree, staged area, or untracked set.",
      "Nothing to verify for this diff. (Run `npm run chainreact -- verify` for the standard pre-push batch.)",
    );
    return lines.join("\n");
  }

  if (classified.length === 0) {
    lines.push(
      "Changed files don't match any targeted check rule.",
      "Run the standard batch: `npm run chainreact -- verify`.",
    );
    return lines.join("\n");
  }

  // Group reasons (deduped, in first-seen order).
  const reasons: string[] = [];
  const seenReason = new Set<string>();
  for (const { rec } of classified) {
    if (!seenReason.has(rec.reason)) {
      seenReason.add(rec.reason);
      reasons.push(rec.reason);
    }
  }
  lines.push("Why (grouped):");
  for (const reason of reasons) lines.push(`  - ${reason}`);
  lines.push("");

  lines.push("Recommended commands (cheap → heavy, in order):");
  for (const { rec, tier } of classified) {
    lines.push(`  [${TIER_LABEL[tier]}] ${rec.command}`);
  }
  lines.push(
    "",
    "Legend: [auto ] runnable now via --run · [HEAVY] full suite, opt-in via --with-tests · [manual] run yourself · [missng] npm script absent.",
  );

  if (plan.mode === "dry-run") {
    lines.push(
      "",
      "Dry-run: nothing was executed. Re-run with --run to execute the [auto ] checks",
      "(add --with-tests to also run [HEAVY]). [manual] checks are always run by you.",
    );
    return lines.join("\n");
  }

  lines.push("", "Execution (auto checks):");
  if (outcome) {
    if (outcome.executed.length === 0) {
      lines.push("  (no auto-runnable checks for this diff)");
    }
    for (const r of outcome.executed) {
      lines.push(`  [${r.passed ? "PASS" : "FAIL"}] ${r.command} (exit ${r.status})`);
    }
    for (const missing of outcome.skippedMissing) {
      lines.push(`  [SKIP] ${missing} — npm script not found in package.json`);
    }
    const notRun = classified.filter((c) => c.tier === "heavy" || c.tier === "manual");
    if (notRun.length > 0) {
      lines.push("", "Still recommended (NOT executed — run these yourself):");
      for (const { rec, tier } of notRun) {
        lines.push(`  - ${rec.command}${tier === "heavy" ? "  (heavy — add --with-tests)" : ""}`);
      }
    }
    lines.push("", outcome.allPassed ? "All executed auto checks passed." : "One or more checks failed (stopped at first failure).");
  }
  return lines.join("\n");
}
