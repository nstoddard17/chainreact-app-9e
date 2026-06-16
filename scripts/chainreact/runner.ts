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
