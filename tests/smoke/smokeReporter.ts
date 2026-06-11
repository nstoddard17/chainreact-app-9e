import path from "node:path";
import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

/**
 * Minimal console-summary reporter for the production smoke suite.
 *
 * Prints a single, scannable block at the end mapping each smoke category to
 * passed / failed / skipped counts, plus an overall verdict — satisfying the
 * suite's "clear console summary" requirement (public / authenticated /
 * builder / cleanup). Runs alongside the standard `list` + `html` reporters.
 */

interface Counts {
  passed: number;
  failed: number;
  skipped: number;
}

const ORDER = [
  "Auth setup",
  "Public smoke",
  "Authenticated shell smoke",
  "Workflow builder smoke",
  "Manual run smoke",
  "Cleanup smoke",
  "Other",
] as const;

function categoryFor(test: TestCase): string {
  const file = path.basename(test.location.file).toLowerCase();
  const title = test.title.toLowerCase();
  if (file.includes("auth.setup")) return "Auth setup";
  if (file.includes("public")) return "Public smoke";
  if (file.includes("authenticated-shell")) return "Authenticated shell smoke";
  if (file.includes("builder")) {
    if (title.includes("cleanup")) return "Cleanup smoke";
    if (title.includes("manual run")) return "Manual run smoke";
    return "Workflow builder smoke";
  }
  return "Other";
}

export default class SmokeReporter implements Reporter {
  private readonly counts = new Map<string, Counts>();

  private bump(category: string, key: keyof Counts): void {
    const c = this.counts.get(category) ?? { passed: 0, failed: 0, skipped: 0 };
    c[key] += 1;
    this.counts.set(category, c);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const category = categoryFor(test);
    if (result.status === "passed") this.bump(category, "passed");
    else if (result.status === "skipped") this.bump(category, "skipped");
    else this.bump(category, "failed"); // failed | timedOut | interrupted
  }

  onEnd(result: FullResult): void {
    const lines: string[] = [];
    lines.push("");
    lines.push("═══════════════════════════════════════════════");
    lines.push("  PRODUCTION SMOKE SUMMARY");
    lines.push("═══════════════════════════════════════════════");

    const present = ORDER.filter((c) => this.counts.has(c));
    if (present.length === 0) {
      lines.push("  (no tests ran)");
    }
    for (const category of present) {
      const c = this.counts.get(category)!;
      const verdict =
        c.failed > 0
          ? "FAILED"
          : c.passed === 0 && c.skipped > 0
            ? "SKIPPED"
            : "PASSED";
      const detail =
        `${c.passed} passed, ${c.failed} failed, ${c.skipped} skipped`;
      lines.push(`  ${category.padEnd(28)} ${verdict.padEnd(8)} (${detail})`);
    }

    lines.push("───────────────────────────────────────────────");
    lines.push(`  OVERALL: ${result.status.toUpperCase()}`);
    lines.push("═══════════════════════════════════════════════");
    lines.push("");

    process.stdout.write(lines.join("\n") + "\n");
  }
}
