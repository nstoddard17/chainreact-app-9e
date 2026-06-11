/**
 * Internal MCP server — bounded local command wrappers.
 *
 *   run_typecheck      → npm run typecheck   (tsc --noEmit)
 *   run_lint           → npm run lint        (eslint .)
 *   run_structure_lint → npm run lint:structure (leaf-folder counts)
 *
 * Every wrapper is local, read-only, and non-mutating. They run an EXACT
 * allowlisted npm script (config.ALLOWED_NPM_SCRIPTS) — never an arbitrary
 * command — with a wall-clock timeout and truncated output. There is no
 * db:push, migration, deploy, git, or shell passthrough here by design.
 */
import { spawnSync } from "node:child_process";
import { ALLOWED_NPM_SCRIPTS, LIMITS, REPO_ROOT } from "../config";
import { redactSecrets } from "../security/redact";
import { truncateOutput } from "../security/truncate";
import type { ToolDefinition } from "../registry";

function runNpmScript(scriptKey: string): string {
  const script = ALLOWED_NPM_SCRIPTS[scriptKey];
  if (!script) {
    return `Error: '${scriptKey}' is not an allowlisted command.`;
  }
  // `npm run <script>` — npm itself resolves the exact script from package.json.
  // No user-supplied arguments are forwarded.
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCmd, ["run", script], {
    cwd: REPO_ROOT,
    timeout: LIMITS.commandTimeoutMs,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  });

  if (result.error) {
    if ((result.error as { code?: string }).code === "ETIMEDOUT") {
      return `Command 'npm run ${script}' timed out after ${LIMITS.commandTimeoutMs}ms.`;
    }
    return `Command 'npm run ${script}' failed to start: ${result.error.message}`;
  }

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const combined = redactSecrets(`${stdout}\n${stderr}`.trim());
  const body = truncateOutput(combined, LIMITS.commandMaxChars);
  return `exit code: ${result.status}\n\n${body}`;
}

export const commandTools: ToolDefinition[] = [
  {
    name: "run_typecheck",
    description:
      "Run the project's TypeScript typecheck (npm run typecheck → tsc --noEmit). Local, read-only. Returns exit code + output.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: () => runNpmScript("typecheck"),
  },
  {
    name: "run_lint",
    description:
      "Run the project's ESLint (npm run lint → eslint .). Local, read-only. Returns exit code + output.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: () => runNpmScript("lint"),
  },
  {
    name: "run_structure_lint",
    description:
      "Run the leaf-folder structure check (npm run lint:structure). Local, read-only. Returns exit code + output.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: () => runNpmScript("lint:structure"),
  },
];
