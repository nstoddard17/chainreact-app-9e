/**
 * Internal ChainReact CLI — `mcp smoke` command.
 *
 * Thin wrapper around the EXISTING `mcp:smoke` package script (build + drive the
 * internal MCP server's stdio smoke). It adds no MCP permissions and no tools — it
 * only shells out to a script that already exists. If the script is missing it
 * fails gracefully with a helpful message. Execution goes through the injectable
 * runner so tests assert the planned command without building/spawning anything.
 */
import type { CommandRunner } from "../runner";

export const MCP_SMOKE_SCRIPT = "mcp:smoke";

export interface McpSmokeResult {
  readonly ran: boolean;
  readonly status: number | null;
  readonly message: string;
}

/**
 * Run (or, with dryRun, just describe) the MCP smoke. `availableScripts` is the
 * set of package.json script names; if `mcp:smoke` is absent we never call the
 * runner and return a helpful message.
 */
export function runMcpSmoke(
  opts: { readonly dryRun: boolean },
  runner: CommandRunner,
  availableScripts: ReadonlySet<string>,
): McpSmokeResult {
  if (!availableScripts.has(MCP_SMOKE_SCRIPT)) {
    return {
      ran: false,
      status: 1,
      message:
        `Cannot run MCP smoke: package.json has no "${MCP_SMOKE_SCRIPT}" script. ` +
        "The internal MCP server lives under scripts/mcp/ — see docs/runbooks/internal-mcp-server.md.",
    };
  }
  if (opts.dryRun) {
    return { ran: false, status: 0, message: `Dry-run: would run \`npm run ${MCP_SMOKE_SCRIPT}\` (builds + drives the MCP server). No tools or permissions are added.` };
  }
  const r = runner(MCP_SMOKE_SCRIPT);
  const passed = r.status === 0;
  return {
    ran: true,
    status: r.status,
    message: passed ? `MCP smoke passed (npm run ${MCP_SMOKE_SCRIPT}, exit 0).` : `MCP smoke FAILED (npm run ${MCP_SMOKE_SCRIPT}, exit ${r.status}).`,
  };
}

/** Render the result. Pure. */
export function renderMcpSmoke(result: McpSmokeResult): string {
  return ["ChainReact — mcp smoke", `  ${result.message}`].join("\n");
}
