/**
 * Internal MCP server — smoke-artifact diagnostics tools (Stage 2A, CS-1).
 *
 *   list_recent_smoke_failures   → the failed/timed-out entries from the latest
 *                                  sanitized smoke artifact.
 *   read_smoke_failure_context   → the sanitized record for one test by title.
 *
 * Both read ONLY the single sanitized JSON at SMOKE_ARTIFACT_FILE through the
 * shared `readAllowedFile` seam (path whitelist + byte cap + redaction). The
 * artifact is produced by tests/smoke/mcpSmokeArtifactReporter.ts and is
 * already sanitized at write time. `test-results/` and `playwright-report/`
 * are blocked segments and are never reachable from here.
 *
 * Local-artifact-only: no network, no DB, no live data. Node built-ins +
 * relative MCP modules only.
 */
import { SMOKE_ARTIFACT_DIR, SMOKE_ARTIFACT_FILE } from "../config";
import { readAllowedFile } from "../lib/files";
import type { ToolDefinition } from "../registry";

interface SanitizedSmokeRecord {
  category: string;
  title: string;
  status: string;
  durationMs: number;
  errorClass: string | null;
  stepLabel: string | null;
  attachmentBasenames: string[];
}

interface SmokeArtifact {
  schema?: string;
  suite?: string;
  generatedAt?: string;
  totals?: { passed: number; failed: number; skipped: number; other: number };
  records?: SanitizedSmokeRecord[];
}

const NOT_FOUND_MSG =
  `No smoke artifact found at ${SMOKE_ARTIFACT_FILE}. ` +
  "Run `npm run smoke:prod` to generate it (it is gitignored and produced per-run).";

/** Read + parse the artifact, or return a typed failure string. */
function loadArtifact(): { ok: true; data: SmokeArtifact } | { ok: false; message: string } {
  let text: string;
  try {
    text = readAllowedFile(SMOKE_ARTIFACT_FILE, [SMOKE_ARTIFACT_DIR]).text;
  } catch {
    return { ok: false, message: NOT_FOUND_MSG };
  }
  let data: SmokeArtifact;
  try {
    data = JSON.parse(text) as SmokeArtifact;
  } catch {
    return {
      ok: false,
      message: `Smoke artifact at ${SMOKE_ARTIFACT_FILE} is not valid JSON. Re-run \`npm run smoke:prod\`.`,
    };
  }
  if (!data || !Array.isArray(data.records)) {
    return {
      ok: false,
      message: `Smoke artifact at ${SMOKE_ARTIFACT_FILE} has no \`records\` array (unexpected shape).`,
    };
  }
  return { ok: true, data };
}

function isFailure(status: string): boolean {
  return status === "failed" || status === "timedOut" || status === "interrupted";
}

function listRecentSmokeFailures(): string {
  const loaded = loadArtifact();
  if (!loaded.ok) return loaded.message;
  const { data } = loaded;
  const records = data.records ?? [];
  const failures = records.filter((r) => isFailure(r.status));

  const header = [
    `Smoke artifact: ${SMOKE_ARTIFACT_FILE}`,
    `generatedAt: ${data.generatedAt ?? "(unknown)"}`,
    data.totals
      ? `totals: ${data.totals.passed} passed, ${data.totals.failed} failed, ${data.totals.skipped} skipped, ${data.totals.other} other`
      : `records: ${records.length}`,
  ].join("\n");

  if (failures.length === 0) {
    return `${header}\n\nNo failed/timed-out smoke tests in the latest run.`;
  }
  const lines = failures.map(
    (r) =>
      `- [${r.category}] "${r.title}" — ${r.status}` +
      (r.errorClass ? ` (${r.errorClass})` : "") +
      ` — ${r.durationMs}ms`,
  );
  return `${header}\n\n${failures.length} failing smoke test(s):\n${lines.join("\n")}\n\nUse read_smoke_failure_context with a title for the sanitized detail.`;
}

function readSmokeFailureContext(args: Record<string, unknown>): string {
  const raw = typeof args.title === "string" ? args.title.trim() : "";
  if (!raw) return "Error: 'title' is required (a smoke test title, exact or substring).";

  const loaded = loadArtifact();
  if (!loaded.ok) return loaded.message;
  const records = loaded.data.records ?? [];

  const needle = raw.toLowerCase();
  const exact = records.find((r) => r.title.toLowerCase() === needle);
  const match = exact ?? records.find((r) => r.title.toLowerCase().includes(needle));
  if (!match) {
    return `No smoke record matching "${raw}". Use list_recent_smoke_failures to see titles.`;
  }

  return [
    `category: ${match.category}`,
    `title: ${match.title}`,
    `status: ${match.status}`,
    `durationMs: ${match.durationMs}`,
    `errorClass: ${match.errorClass ?? "(none)"}`,
    `stepLabel: ${match.stepLabel ?? "(none)"}`,
    `attachments (basenames only): ${
      match.attachmentBasenames.length ? match.attachmentBasenames.join(", ") : "(none)"
    }`,
    "",
    "Note: this is sanitized context — raw error messages, URLs, paths, screenshots,",
    "and traces are intentionally excluded. Open the local Playwright HTML report",
    "(playwright-report/smoke) for full detail; the MCP server cannot read it.",
  ].join("\n");
}

/**
 * Pure summary of the single most recent failure in a sanitized artifact (or a
 * safe "nothing to report" message). Exported for tests. The artifact is already
 * sanitized at write time — this returns only category/title/status/errorClass/
 * stepLabel, never raw error text, URLs, or paths.
 */
export function summarizeLastFailure(data: SmokeArtifact | null): string {
  if (!data || !Array.isArray(data.records)) {
    return "No recent failure artifact found. Run `npm run smoke:prod` to generate one (it is gitignored and produced per run).";
  }
  const records = data.records;
  const failures = records.filter((r) => isFailure(r.status));
  const when = data.generatedAt ?? "(unknown time)";
  if (failures.length === 0) {
    return `No failures in the latest artifact (generatedAt: ${when}; ${records.length} record(s)).`;
  }
  const first = failures[0];
  if (!first) {
    return `No failures in the latest artifact (generatedAt: ${when}).`;
  }
  return [
    `Latest test failure (sanitized; generatedAt: ${when}; ${failures.length} failing of ${records.length}):`,
    `- category: ${first.category}`,
    `- title: ${first.title}`,
    `- status: ${first.status}`,
    `- errorClass: ${first.errorClass ?? "(none)"}`,
    `- stepLabel: ${first.stepLabel ?? "(none)"}`,
    failures.length > 1 ? `…and ${failures.length - 1} more — use list_recent_smoke_failures for the full list.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function summarizeLastTestFailure(): string {
  const loaded = loadArtifact();
  if (!loaded.ok) {
    // Missing artifact is a normal state, not an error.
    return "No recent failure artifact found. Run `npm run smoke:prod` to generate one (it is gitignored and produced per run).";
  }
  return summarizeLastFailure(loaded.data);
}

export const smokeTools: ToolDefinition[] = [
  {
    name: "summarize_last_test_failure",
    description:
      "Summarize the most recent failure from the latest sanitized smoke artifact (category/title/status/errorClass/stepLabel only — no raw errors/paths/URLs). Returns a safe message when no artifact exists. Local, read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: summarizeLastTestFailure,
  },
  {
    name: "list_recent_smoke_failures",
    description:
      "List the failed/timed-out tests from the latest sanitized production-smoke artifact (artifacts/mcp/smoke-latest.json). Local, read-only, sanitized — no raw errors/paths/URLs.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: listRecentSmokeFailures,
  },
  {
    name: "read_smoke_failure_context",
    description:
      "Return the sanitized record for one smoke test by title (exact or substring): category, status, errorClass, stepLabel, attachment basenames. No raw error text.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Smoke test title (exact or substring), e.g. 'pick channel by visible name'.",
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
    handler: readSmokeFailureContext,
  },
];
