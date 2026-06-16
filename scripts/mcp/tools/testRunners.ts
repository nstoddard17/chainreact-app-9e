/**
 * Internal MCP server — bounded local jest runners (Phase B).
 *
 *   run_jest_for_path           → jest <validated path under tests/>
 *   run_route_structure_tests   → jest tests/structure/api-route-authorization.test.ts (fixed)
 *   run_provider_metadata_tests → jest tests/structure/discovery-meta-coverage.test.ts (fixed)
 *
 * Every runner is LOCAL and READ-ONLY (jest executes tests; it mutates no repo
 * state, hits no prod, applies no migration). Safety model:
 *   - `run_jest_for_path` accepts ONLY a path that (a) contains nothing but
 *     [A-Za-z0-9._/-] (no spaces / shell metacharacters), (b) resolves UNDER
 *     `tests/` via the whitelist-first `resolveAllowedPath` (so absolute,
 *     `..`/`.` traversal, percent-encoded sequences, null bytes, and blocked
 *     segments are all refused), and (c) names an existing file.
 *   - The fixed wrappers use compile-time-constant paths from config — no tool
 *     argument reaches the command line.
 *   - jest is launched with `spawnSync(npm, ["test","--",<path>])`, a discrete
 *     argv (no shell string assembled from input); output is redacted + capped;
 *     a wall-clock timeout bounds the run.
 */
import { spawnSync } from "node:child_process";
import { FIXED_TEST_TARGETS, LIMITS, REPO_ROOT } from "../config";
import { existsAllowed } from "../lib/files";
import { PathNotAllowedError, resolveAllowedPath } from "../security/paths";
import { redactSecrets } from "../security/redact";
import { truncateOutput } from "../security/truncate";
import type { ToolDefinition } from "../registry";

const TESTS_ROOT = "tests";
/** Only these characters may appear in a caller-supplied test path. */
const SAFE_PATH = /^[A-Za-z0-9._/-]+$/;

export type JestPathValidation =
  | { ok: true; relPath: string }
  | { ok: false; error: string };

/**
 * Validate a caller-supplied test path (pure; exported for tests). Rejects empty
 * input, shell-metacharacter / space / percent-encoded / null-byte input, any
 * path that does not resolve under `tests/`, and non-existent files.
 */
export function validateJestPath(input: unknown): JestPathValidation {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return { ok: false, error: "'testPath' is required (a file path under tests/)." };
  const norm = raw.split("\\").join("/");
  if (!SAFE_PATH.test(norm)) {
    return {
      ok: false,
      error: `invalid testPath — only [A-Za-z0-9._/-] are allowed (no spaces or shell metacharacters).`,
    };
  }
  try {
    resolveAllowedPath(norm, [TESTS_ROOT]);
  } catch (e) {
    if (e instanceof PathNotAllowedError) return { ok: false, error: e.message };
    return { ok: false, error: "invalid testPath." };
  }
  if (!existsAllowed(norm, [TESTS_ROOT])) {
    return { ok: false, error: `test file not found under tests/: '${norm}'.` };
  }
  return { ok: true, relPath: norm };
}

/** Extract jest's summary lines from combined output (pure; exported for tests). */
export function parseJestSummary(output: string): { tests: string | null; suites: string | null } {
  const t = output.match(/^Tests:.*$/m);
  const s = output.match(/^Test Suites:.*$/m);
  return { tests: t ? t[0].trim() : null, suites: s ? s[0].trim() : null };
}

function renderResult(check: string, target: string, status: number | null, output: string): string {
  const passed = status === 0;
  const { tests, suites } = parseJestSummary(output);
  const lines: (string | null)[] = [
    `check: ${check}`,
    `target: ${target}`,
    `result: ${passed ? "PASSED" : "FAILED"}  (exit code ${status})`,
    suites,
    tests,
  ];
  if (!passed) {
    lines.push("", "--- output (redacted, capped) ---", truncateOutput(output, LIMITS.commandMaxChars));
  }
  return lines.filter((l): l is string => l !== null).join("\n");
}

/** Run jest against one path (the path is validated/fixed by the caller). */
function runJest(check: string, relPath: string): string {
  const isWin = process.platform === "win32";
  const npmCmd = isWin ? "npm.cmd" : "npm";
  // `npm test -- <path>` forwards <path> to jest as a single positional arg. The
  // path is char-restricted (no shell metacharacters), so even with the win32
  // shell shim there is no injection surface.
  const result = spawnSync(npmCmd, ["test", "--", relPath], {
    cwd: REPO_ROOT,
    timeout: LIMITS.commandTimeoutMs,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    shell: isWin,
  });

  if (result.error) {
    if ((result.error as { code?: string }).code === "ETIMEDOUT") {
      return `check: ${check}\ntarget: ${relPath}\nresult: TIMEOUT after ${LIMITS.commandTimeoutMs}ms`;
    }
    return `check: ${check}\ntarget: ${relPath}\nresult: FAILED TO START — ${result.error.message}`;
  }
  const combined = redactSecrets(`${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim());
  return renderResult(check, relPath, result.status, combined);
}

function runJestForPath(args: Record<string, unknown>): string {
  const v = validateJestPath(args.testPath);
  if (!v.ok) return `Error: ${v.error}`;
  return runJest("run_jest_for_path", v.relPath);
}

export const testRunnerTools: ToolDefinition[] = [
  {
    name: "run_jest_for_path",
    description:
      "Run jest for ONE test file under tests/ (e.g. 'tests/unit/mcp/docs-tools.test.ts'). Path is validated (must be under tests/, no traversal/absolute/shell chars, must exist). Local, read-only; bounded + redacted output; wall-clock timeout.",
    inputSchema: {
      type: "object",
      properties: {
        testPath: {
          type: "string",
          description: "Repo-relative test file path under tests/, e.g. 'tests/structure/api-route-authorization.test.ts'.",
        },
      },
      required: ["testPath"],
      additionalProperties: false,
    },
    handler: runJestForPath,
  },
  {
    name: "run_route_structure_tests",
    description:
      "Run the API route authorization structure test (fixed target tests/structure/api-route-authorization.test.ts). Local, read-only. Great after touching app/api routes.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: () => runJest("run_route_structure_tests", FIXED_TEST_TARGETS.routeStructure),
  },
  {
    name: "run_provider_metadata_tests",
    description:
      "Run the discovery/provider metadata coverage structure test (fixed target tests/structure/discovery-meta-coverage.test.ts). Local, read-only. Great after touching provider metadata.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: () => runJest("run_provider_metadata_tests", FIXED_TEST_TARGETS.providerMetadata),
  },
];
