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
import type { CommandRunner } from "../runner";

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
