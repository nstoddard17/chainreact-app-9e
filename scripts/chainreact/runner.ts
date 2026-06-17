/**
 * Internal ChainReact CLI — injectable command runner.
 *
 * Verify / mcp-smoke wrappers shell out to EXISTING npm scripts. All execution
 * goes through this single seam so tests can inject a fake runner and assert the
 * PLANNED commands without actually running anything expensive. The default
 * implementation runs `npm run <script>` with a discrete argv (no shell string
 * assembled from user input). The script name always comes from a compile-time
 * constant in the command modules — never from raw user argv — so there is no
 * argument-injection surface (mirrors scripts/mcp/tools/commands.ts).
 */
import { spawnSync } from "node:child_process";

export interface RunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Run an npm script by name (e.g. "typecheck"). Injectable for tests. */
export type CommandRunner = (npmScript: string) => RunResult;

/**
 * Structured command for `verify --changed --run`. Each variant maps to a FIXED
 * argv (no shell string assembled from input) so there is no command-injection
 * surface — the executor only ever launches `npm run …` / `npx jest …` with
 * allow-list-checked tokens. Represented as a typed union, never a raw string.
 */
export type ExecCommand =
  | { readonly kind: "npm-script"; readonly script: string }
  | { readonly kind: "chainreact"; readonly args: readonly string[] }
  | { readonly kind: "jest"; readonly paths: readonly string[] };

/** Execute a structured command. Injectable so tests never spawn a process. */
export type CommandExecutor = (cmd: ExecCommand) => RunResult;

/** Human/agent-readable form of a structured command (matches recommendChecks display). */
export function renderExecCommand(cmd: ExecCommand): string {
  switch (cmd.kind) {
    case "npm-script":
      return `npm run ${cmd.script}`;
    case "chainreact":
      return `npm run chainreact -- ${cmd.args.join(" ")}`;
    case "jest":
      return `npx jest ${cmd.paths.join(" ")}`;
  }
}

// ── safety allow-list (validate BEFORE executing) ────────────────────────────

/** npm scripts the verify runner refuses to auto-run (side-effecting / deploy / DB). */
const NPM_SCRIPT_DENY = new Set(["db:push", "build", "dev", "start", "check:db-target"]);
const NPM_SCRIPT_DENY_PREFIX = /^(db:|deploy|sweep:)/;

/** `npm run chainreact -- <args>` is allowed only for READ-ONLY app commands. */
export function isAllowedChainreactArgs(args: readonly string[]): boolean {
  if (args[0] !== "app") return false;
  if (args[1] === "list") return args.length === 2;
  if (args[1] === "validate") {
    const rest = args.slice(2);
    if (rest[0] === "--all") return rest.slice(1).every((a) => a === "--verbose");
    return rest.length === 1 && /^[a-z0-9][a-z0-9_-]*$/.test(rest[0] ?? "");
  }
  // scaffold / register / action / trigger WRITE files — never auto-run.
  return false;
}

/** Bounded test paths under `tests/` only — no traversal, no full-suite bare run. */
export function isAllowedJestPaths(paths: readonly string[]): boolean {
  if (paths.length === 0) return false; // bare `jest` = full suite — not allowed here
  return paths.every((p) => /^tests\/[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(p) && !p.includes("..") && !p.endsWith("/"));
}

export type ExecValidation = { readonly ok: true } | { readonly ok: false; readonly reason: "missing-script" | "rejected" };

/**
 * Validate a structured command against the safety allow-list. `missing-script`
 * → recommended npm script is absent from package.json (skip gracefully);
 * `rejected` → not a safe auto-runnable command (keep printing as manual).
 */
export function validateExecCommand(cmd: ExecCommand, availableScripts: ReadonlySet<string>): ExecValidation {
  switch (cmd.kind) {
    case "npm-script": {
      if (NPM_SCRIPT_DENY.has(cmd.script) || NPM_SCRIPT_DENY_PREFIX.test(cmd.script)) return { ok: false, reason: "rejected" };
      if (!availableScripts.has(cmd.script)) return { ok: false, reason: "missing-script" };
      return { ok: true };
    }
    case "chainreact": {
      if (!isAllowedChainreactArgs(cmd.args)) return { ok: false, reason: "rejected" };
      if (!availableScripts.has("chainreact")) return { ok: false, reason: "missing-script" };
      return { ok: true };
    }
    case "jest":
      return isAllowedJestPaths(cmd.paths) ? { ok: true } : { ok: false, reason: "rejected" };
  }
}

const COMMAND_TIMEOUT_MS = 300_000;

/** Default runner — `npm run <script>` via spawnSync, no shell string from input. */
export const defaultRunner: CommandRunner = (npmScript: string): RunResult => {
  // Windows needs a shell to launch the npm.cmd shim; on POSIX keep shell:false.
  // Either way the argv tokens are constants chosen by the command modules.
  const isWin = process.platform === "win32";
  const npm = isWin ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["run", npmScript], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
    shell: isWin,
  });
  if (result.error) {
    const code = (result.error as { code?: string }).code;
    const reason = code === "ETIMEDOUT" ? `timed out after ${COMMAND_TIMEOUT_MS}ms` : result.error.message;
    return { status: 1, stdout: result.stdout ?? "", stderr: `failed to run 'npm run ${npmScript}': ${reason}` };
  }
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
};

/** Map a validated structured command to its fixed (program, argv). No shell string. */
function execArgv(cmd: ExecCommand): { program: string; args: string[] } {
  switch (cmd.kind) {
    case "npm-script":
      return { program: "npm", args: ["run", cmd.script] };
    case "chainreact":
      return { program: "npm", args: ["run", "chainreact", "--", ...cmd.args] };
    case "jest":
      return { program: "npx", args: ["jest", ...cmd.paths] };
  }
}

/**
 * Default structured executor. Launches `npm`/`npx` via spawnSync with a discrete
 * argv (tokens come from the typed `ExecCommand` + allow-list, never a raw user
 * string). `shell` is enabled only on Windows to launch the `.cmd` shims — the
 * argv tokens are still allow-list-checked constants/ids, so there is no
 * injection surface (mirrors `defaultRunner`).
 */
export const defaultExecutor: CommandExecutor = (cmd: ExecCommand): RunResult => {
  const isWin = process.platform === "win32";
  const { program, args } = execArgv(cmd);
  const bin = isWin && (program === "npm" || program === "npx") ? `${program}.cmd` : program;
  const result = spawnSync(bin, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
    shell: isWin,
  });
  const display = renderExecCommand(cmd);
  if (result.error) {
    const code = (result.error as { code?: string }).code;
    const reason = code === "ETIMEDOUT" ? `timed out after ${COMMAND_TIMEOUT_MS}ms` : result.error.message;
    return { status: 1, stdout: result.stdout ?? "", stderr: `failed to run '${display}': ${reason}` };
  }
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
};
