/**
 * Internal ChainReact CLI — `verify --changed` closeout report.
 *
 * Pure builders + renderers that turn a changed-verify plan + classification +
 * execution outcome into a compact, copy-pasteable summary (for human/agent
 * deliverable reports) and a deterministic `--json` form. Split out of
 * `verify.ts` to keep that file under the max-lines budget; all logic is pure
 * (no execution, no I/O) → fully unit-testable.
 */
import type {
  ChangedVerifyOutcome,
  ChangedVerifyPlan,
  ClassifiedRec,
  ExecResult,
  RecTier,
} from "./verify";

/**
 * Final status for a closeout report:
 *   - `ERROR`      git discovery failed.
 *   - `NO-CHANGES` no changed files.
 *   - `DRY-RUN`    recommend-only (no --run).
 *   - `PASS`       --run: every executed check passed, none skipped-missing.
 *   - `FAIL`       --run: an executed check failed (or a recommended script was missing).
 */
export type FinalStatus = "PASS" | "FAIL" | "DRY-RUN" | "NO-CHANGES" | "ERROR";

export function computeFinalStatus(plan: ChangedVerifyPlan, outcome: ChangedVerifyOutcome | null): FinalStatus {
  if (!plan.ok) return "ERROR";
  if (plan.changedFiles.length === 0) return "NO-CHANGES";
  if (plan.mode === "dry-run") return "DRY-RUN";
  return outcome && outcome.allPassed ? "PASS" : "FAIL";
}

export interface ChangedReport {
  readonly finalStatus: FinalStatus;
  readonly mode: "dry-run" | "run";
  readonly withTests: boolean;
  readonly changedCount: number;
  readonly error?: string;
  readonly recommendations: readonly { readonly command: string; readonly tier: RecTier }[];
  readonly executed: readonly ExecResult[];
  readonly skippedMissing: readonly string[];
  readonly notRunHeavy: readonly string[];
  readonly notRunManual: readonly string[];
  readonly notRunDueToFailFast: readonly string[];
  readonly failedCommand?: { readonly command: string; readonly status: number | null };
  readonly nextCommands: readonly string[];
}

const APP_VALIDATE_ALL = "npm run chainreact -- app validate --all";

function buildNextCommands(
  plan: ChangedVerifyPlan,
  classified: readonly ClassifiedRec[],
  outcome: ChangedVerifyOutcome | null,
  status: FinalStatus,
): string[] {
  const next: string[] = [];
  const push = (c: string): void => {
    if (!next.includes(c)) next.push(c);
  };

  if (status === "ERROR" || status === "NO-CHANGES") {
    push("npm run chainreact -- verify");
    return next;
  }

  const hasHeavy = classified.some((c) => c.tier === "heavy");
  if (status === "DRY-RUN") {
    push("npm run chainreact -- verify --changed --run");
    if (hasHeavy) push("npm run chainreact -- verify --changed --run --with-tests");
  } else if (status === "FAIL") {
    const failed = (outcome?.executed ?? []).find((e) => !e.passed);
    if (failed) push(`${failed.command}   # fix, then re-run this`);
  } else if (status === "PASS" && hasHeavy && !plan.withTests) {
    push("npm run chainreact -- verify --changed --run --with-tests");
  }

  // Always include `app validate --all` when provider/integration validation was
  // recommended but NOT successfully executed (dry-run, or fail-fast before it).
  const passed = new Set((outcome?.executed ?? []).filter((e) => e.passed).map((e) => e.command));
  const appValidateRecs = classified.filter((c) => c.rec.command.includes("app validate"));
  if (appValidateRecs.length > 0 && appValidateRecs.some((c) => !passed.has(c.rec.command))) {
    if (!next.some((c) => c.startsWith(APP_VALIDATE_ALL))) push(APP_VALIDATE_ALL);
  }
  return next;
}

/** Build the closeout report data. Pure (no execution). */
export function buildChangedReport(
  plan: ChangedVerifyPlan,
  classified: readonly ClassifiedRec[],
  outcome: ChangedVerifyOutcome | null,
): ChangedReport {
  const finalStatus = computeFinalStatus(plan, outcome);
  const executed = outcome?.executed ?? [];
  const executedCommands = new Set(executed.map((e) => e.command));
  const failed = executed.find((e) => !e.passed);
  const autoCommands = classified.filter((c) => c.tier === "auto").map((c) => c.rec.command);

  return {
    finalStatus,
    mode: plan.mode,
    withTests: plan.withTests,
    changedCount: plan.changedFiles.length,
    error: plan.error,
    recommendations: classified.map((c) => ({ command: c.rec.command, tier: c.tier })),
    executed,
    skippedMissing: outcome?.skippedMissing ?? [],
    notRunHeavy: classified.filter((c) => c.tier === "heavy").map((c) => c.rec.command),
    notRunManual: classified.filter((c) => c.tier === "manual").map((c) => c.rec.command),
    // Fail-fast: auto checks that never ran because an earlier one failed.
    notRunDueToFailFast: failed ? autoCommands.filter((c) => !executedCommands.has(c)) : [],
    failedCommand: failed ? { command: failed.command, status: failed.status } : undefined,
    nextCommands: buildNextCommands(plan, classified, outcome, finalStatus),
  };
}

const NONE = "(none)";
const listOr = (items: readonly string[]): string => (items.length ? items.join(", ") : NONE);

/** Render the compact, copy-pasteable closeout summary block. Pure. */
export function renderChangedReport(report: ChangedReport): string {
  const lines: string[] = ["── verify --changed summary ──", `status: ${report.finalStatus}`];

  if (report.finalStatus === "ERROR") {
    lines.push(`error: ${report.error ?? "git discovery failed"}`);
  } else {
    lines.push(`changed files: ${report.changedCount}`);
  }

  if (report.finalStatus === "DRY-RUN") {
    const counts = (tier: RecTier): number => report.recommendations.filter((r) => r.tier === tier).length;
    lines.push(
      "mode: dry-run",
      `recommended: ${report.recommendations.length} (auto ${counts("auto")}, heavy ${counts("heavy")}, manual ${counts("manual")}, missing ${counts("missing")})`,
    );
  } else if (report.finalStatus === "PASS" || report.finalStatus === "FAIL") {
    const passedN = report.executed.filter((e) => e.passed).length;
    const failedN = report.executed.length - passedN;
    lines.push(`mode: run (with-tests: ${report.withTests ? "yes" : "no"})`, `executed: ${passedN} passed, ${failedN} failed`);
    for (const e of report.executed) lines.push(`  ${e.passed ? "PASS" : "FAIL"} ${e.command}${e.passed ? "" : ` (exit ${e.status})`}`);
    if (report.skippedMissing.length) lines.push(`skipped (missing script): ${listOr(report.skippedMissing)}`);
    if (report.failedCommand) {
      lines.push(`failed command: ${report.failedCommand.command} (exit ${report.failedCommand.status})`);
      lines.push(`not run (fail-fast stopped the rest): ${listOr(report.notRunDueToFailFast)}`);
    }
    if (report.notRunHeavy.length) lines.push(`not run (heavy — --with-tests): ${listOr(report.notRunHeavy)}`);
    if (report.notRunManual.length) lines.push(`not run (manual): ${listOr(report.notRunManual)}`);
  }

  lines.push("next:");
  if (report.nextCommands.length === 0) lines.push(`  ${NONE}`);
  for (const c of report.nextCommands) lines.push(`  - ${c}`);
  return lines.join("\n");
}

/**
 * Deterministic machine-readable report (no deps). Fixed key order + ordered
 * arrays → stable output. Emitted alone under `--json`.
 */
export function renderChangedReportJson(report: ChangedReport): string {
  return JSON.stringify(
    {
      finalStatus: report.finalStatus,
      mode: report.mode,
      withTests: report.withTests,
      changedFiles: report.changedCount,
      error: report.error ?? null,
      recommendations: report.recommendations.map((r) => ({ command: r.command, tier: r.tier })),
      executed: report.executed.map((e) => ({ command: e.command, status: e.status, passed: e.passed })),
      skippedMissing: [...report.skippedMissing],
      notRunHeavy: [...report.notRunHeavy],
      notRunManual: [...report.notRunManual],
      notRunDueToFailFast: [...report.notRunDueToFailFast],
      failedCommand: report.failedCommand ?? null,
      nextCommands: [...report.nextCommands],
    },
    null,
    2,
  );
}
