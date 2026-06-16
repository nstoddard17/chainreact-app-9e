/**
 * Internal ChainReact CLI — help text (pure string builder).
 */

export const CLI_NAME = "chainreact";

/** Full --help / usage text. Pure + stable for tests. */
export function helpText(): string {
  return [
    "ChainReact — internal operator CLI (local developer/operator tooling)",
    "",
    "This is NOT a customer-facing product. It performs no auth/login, no workflow",
    "execution, no production network calls, and no database writes. It is for local",
    "repo consistency, verification, and provider/app metadata validation.",
    "",
    "Usage:",
    `  ${CLI_NAME} <command> [options]`,
    "",
    "Commands:",
    "  status                 Print a concise local repo/tooling status (no network, no secrets).",
    "  verify [--run]         Show the verification batch to run before push/deploy.",
    "                         Default: dry-run (prints the plan, runs nothing).",
    "                         --run        Execute the safe subset (structure, typecheck, lint).",
    "                         --with-tests Also run the full jest suite (heavy; opt-in, needs --run).",
    "  mcp smoke [--dry-run]  Thin wrapper around `npm run mcp:smoke` (builds + drives the MCP server).",
    "                         --dry-run    Print the command instead of running it.",
    "  app list               List discovered providers (id, displayName, enabled, action/trigger counts).",
    "  app validate <id>      Validate one provider/app's metadata structure under integrations/<id>/.",
    "  app validate --all     Validate every discovered provider; prints a summary.",
    "                         --verbose    Also list per-provider warnings.",
    "                         Foundation checks only; designed for future deeper validation.",
    "  app scaffold <id>      Create a minimal, contract-valid provider skeleton under",
    "                         integrations/<id>/ (manifest.ts only; TODOs for the rest).",
    "                         --dry-run    Print the plan + predicted validation; write nothing.",
    "                         Refuses to overwrite an existing provider.",
    "",
    "Global options:",
    "  --help, -h             Show this help.",
    "",
    "Examples:",
    `  npm run ${CLI_NAME} -- status`,
    `  npm run ${CLI_NAME} -- verify`,
    `  npm run ${CLI_NAME} -- verify --run`,
    `  npm run ${CLI_NAME} -- mcp smoke`,
    `  npm run ${CLI_NAME} -- app list`,
    `  npm run ${CLI_NAME} -- app validate slack`,
    `  npm run ${CLI_NAME} -- app validate --all`,
    `  npm run ${CLI_NAME} -- app scaffold linear --dry-run`,
    "",
    "Safe by design: no secrets/tokens are printed, no env is dumped, nothing is",
    "pushed/deployed, and no migrations are applied.",
  ].join("\n");
}
