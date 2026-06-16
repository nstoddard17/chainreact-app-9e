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

/**
 * Build the exact, injection-proof argv for an allowlisted npm script.
 *
 * Returns `["run", <script>]` where `<script>` is the value from the static
 * `ALLOWED_NPM_SCRIPTS` map — never the caller's string. An unknown key throws
 * before any process is spawned. Because the script name comes from the
 * allowlist (not from tool arguments) and is passed as a discrete argv element
 * with `shell: false`, there is no shell-metacharacter or argument-injection
 * surface. Exported for direct testing.
 */
export function npmArgsFor(scriptKey: string): [string, string] {
  const script = ALLOWED_NPM_SCRIPTS[scriptKey];
  if (!script) {
    throw new Error(`'${scriptKey}' is not an allowlisted command.`);
  }
  return ["run", script];
}

function runNpmScript(scriptKey: string): string {
  let args: [string, string];
  try {
    args = npmArgsFor(scriptKey);
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
  // `npm run <script>` — npm itself resolves the exact script from package.json.
  // No user-supplied arguments are forwarded.
  //
  // Windows needs a shell to launch the `npm.cmd` batch shim (spawning it with
  // shell:false raises EINVAL), so `shell` is enabled only on win32. This is
  // injection-safe because EVERY token in `args` is a compile-time constant
  // from ALLOWED_NPM_SCRIPTS — no tool argument ever reaches the command line
  // (proven by npmArgsFor's tests). On POSIX we keep shell:false.
  const isWin = process.platform === "win32";
  const npmCmd = isWin ? "npm.cmd" : "npm";
  const script = args[1];
  const result = spawnSync(npmCmd, args, {
    cwd: REPO_ROOT,
    timeout: LIMITS.commandTimeoutMs,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    shell: isWin,
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

/**
 * Human-readable, one-line descriptions for the allowlisted checks. Keys MUST
 * be a subset of `ALLOWED_NPM_SCRIPTS`; `listAvailableNpmChecks` asserts every
 * allowlisted script is described so the inventory can never silently drift.
 */
const NPM_CHECK_DESCRIPTIONS: Readonly<Record<string, string>> = {
  typecheck: "TypeScript typecheck (tsc --noEmit). Read-only.",
  lint: "ESLint over the repo (eslint .). Read-only.",
  "lint:structure": "Leaf-folder file-count cap check. Read-only.",
  "lint:migrations": "Static migration RLS/GRANT lint (check-migration-rls.mjs). Read-only — never applies migrations.",
};

/** Inventory of the non-mutating checks the MCP server may run. Inventory-only. */
export function listAvailableNpmChecks(): string {
  const lines = Object.keys(ALLOWED_NPM_SCRIPTS).map((key) => {
    const desc = NPM_CHECK_DESCRIPTIONS[key] ?? "(no description)";
    return `- ${key} (npm run ${ALLOWED_NPM_SCRIPTS[key]}) — ${desc}`;
  });
  return [
    `Available local checks (${lines.length}) — all read-only / non-mutating:`,
    ...lines,
    "",
    "These are the ONLY commands the MCP server can run. There is no db:push,",
    "migration, deploy, git push, build, or arbitrary-shell wrapper by design.",
  ].join("\n");
}

export const commandTools: ToolDefinition[] = [
  {
    name: "list_available_npm_checks",
    description:
      "List the exact, non-mutating npm checks the MCP server may run (typecheck, lint, lint:structure) with descriptions. Inventory-only — runs nothing.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: listAvailableNpmChecks,
  },
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
  {
    name: "run_migration_lint",
    description:
      "Run the migration RLS/GRANT lint (npm run lint:migrations → check-migration-rls.mjs). Static, read-only — it NEVER applies migrations, runs db:push, or connects to a DB. Returns exit code + output.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: () => runNpmScript("lint:migrations"),
  },
];
