import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  Reporter,
  TestCase,
  TestResult,
  TestStep,
} from "@playwright/test/reporter";
import {
  buildSmokeArtifact,
  type RawSmokeInput,
  type SmokeStatus,
} from "./helpers/sanitizeSmokeArtifact";

/**
 * MCP smoke-artifact reporter (CS-1, Stage 2A).
 *
 * Writes a SANITIZED JSON summary of the production smoke run to
 * `artifacts/mcp/smoke-latest.json` (gitignored), which the internal MCP
 * diagnostics tools read. It collects per-test results, then maps each through
 * the pure `sanitizeSmokeArtifact` helper — the reporter itself never writes a
 * raw error message, URL, absolute path, trace/screenshot byte, or token.
 *
 * Runs alongside the console summary reporter; it adds an output file but does
 * not change console behavior. It reuses no Playwright artifact dir — it only
 * records basenames of attachments, never their paths or contents.
 */

const OUTPUT_REL = path.join("artifacts", "mcp", "smoke-latest.json");

function categoryFor(test: TestCase): string {
  const file = path.basename(test.location.file).toLowerCase();
  const title = test.title.toLowerCase();
  if (file.includes("auth.setup")) return "Auth setup";
  if (file.includes("public")) return "Public smoke";
  if (file.includes("authenticated-shell")) return "Authenticated shell smoke";
  if (file.includes("slack-action")) return "Slack action smoke";
  if (file.includes("builder")) {
    if (title.includes("cleanup")) return "Cleanup smoke";
    if (title.includes("manual run")) return "Manual run smoke";
    return "Workflow builder smoke";
  }
  return "Other";
}

function toSmokeStatus(status: TestResult["status"]): SmokeStatus {
  switch (status) {
    case "passed":
      return "passed";
    case "skipped":
      return "skipped";
    case "timedOut":
      return "timedOut";
    case "interrupted":
      return "interrupted";
    default:
      return "failed";
  }
}

/** Find the title of the last step that carried an error (shallow + nested). */
function lastFailedStepTitle(steps: readonly TestStep[]): string | null {
  let found: string | null = null;
  const visit = (list: readonly TestStep[]): void => {
    for (const s of list) {
      if (s.error && s.title) found = s.title;
      if (s.steps && s.steps.length) visit(s.steps);
    }
  };
  visit(steps);
  return found;
}

export default class McpSmokeArtifactReporter implements Reporter {
  private readonly raws: RawSmokeInput[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    this.raws.push({
      category: categoryFor(test),
      // Test titles are author-controlled smoke titles; scrubbed defensively
      // by the sanitizer regardless.
      title: test.title,
      status: toSmokeStatus(result.status),
      durationMs: result.duration,
      // Playwright's TestError carries no class name — let the sanitizer derive
      // a coarse, message-free class label from the message instead.
      errorName: null,
      errorMessage: result.error?.message ?? null,
      stepLabel: lastFailedStepTitle(result.steps ?? []),
      attachmentPaths: (result.attachments ?? [])
        .map((a) => a.path)
        .filter((p): p is string => typeof p === "string"),
    });
  }

  onEnd(): void {
    const generatedAt = new Date().toISOString();
    const artifact = buildSmokeArtifact(this.raws, generatedAt);
    const outAbs = path.resolve(process.cwd(), OUTPUT_REL);
    try {
      mkdirSync(path.dirname(outAbs), { recursive: true });
      writeFileSync(outAbs, JSON.stringify(artifact, null, 2) + "\n", "utf8");
      process.stdout.write(`\n  MCP smoke artifact written: ${OUTPUT_REL}\n`);
    } catch (err) {
      // Non-fatal: the artifact is a diagnostic convenience, not a gate.
      process.stderr.write(
        `\n  WARN: failed to write MCP smoke artifact: ${
          err instanceof Error ? err.message : String(err)
        }\n`,
      );
    }
  }
}
