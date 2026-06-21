/**
 * MCP token scope model (Slice 4.PUBLIC-MCP-1).
 *
 * The public MCP server is READ-ONLY at v1. Every scope grants visibility into one
 * resource family and NOTHING else — no scope can mutate state, trigger a workflow,
 * or expose secrets. Scopes are least-privilege: a token created for one read
 * family cannot reach another.
 *
 * Pure data + validators — no DB, no I/O (core/ may only import contracts/).
 *
 *   - KNOWN scopes — every value the system recognizes. The DB CHECK on
 *     `account_mcp_tokens.scopes` mirrors this set, so the column stays valid as
 *     more scopes are added WITHOUT a migration.
 *   - LAUNCH-ENABLED scopes — the subset a token may be CREATED with today. All
 *     four read scopes ship enabled at launch.
 */

export const MCP_SCOPE_ACCOUNTS_READ = "accounts:read" as const;
export const MCP_SCOPE_WORKFLOWS_READ = "workflows:read" as const;
export const MCP_SCOPE_RUNS_READ = "runs:read" as const;
export const MCP_SCOPE_INTEGRATIONS_READ = "integrations:read" as const;

/** Every recognized scope value. Mirrors the DB CHECK set exactly. */
export const KNOWN_MCP_SCOPES = [
  MCP_SCOPE_ACCOUNTS_READ,
  MCP_SCOPE_WORKFLOWS_READ,
  MCP_SCOPE_RUNS_READ,
  MCP_SCOPE_INTEGRATIONS_READ,
] as const;

export type McpScope = (typeof KNOWN_MCP_SCOPES)[number];

/** Scopes a token may be created with at launch — all four read scopes. */
export const LAUNCH_ENABLED_MCP_SCOPES: readonly McpScope[] = [...KNOWN_MCP_SCOPES];

export function isKnownMcpScope(scope: string): scope is McpScope {
  return (KNOWN_MCP_SCOPES as readonly string[]).includes(scope);
}

export function isLaunchEnabledMcpScope(scope: string): boolean {
  return (LAUNCH_ENABLED_MCP_SCOPES as readonly string[]).includes(scope);
}

/** Does a token's granted scope list include the required scope? (verify path.) */
export function hasMcpScope(scopes: readonly string[], required: McpScope): boolean {
  return scopes.includes(required);
}

export type ValidateMcpScopesResult =
  | { ok: true; scopes: McpScope[] }
  | { ok: false; reason: "empty" | "unknown_scope" | "scope_not_enabled" };

/**
 * Validate a create-time scope list: non-empty, every value KNOWN and currently
 * LAUNCH-ENABLED, de-duplicated. The management service calls this before insert so
 * a caller can never mint a token with a reserved/unknown scope.
 */
export function validateMcpScopes(scopes: readonly string[]): ValidateMcpScopesResult {
  if (!scopes || scopes.length === 0) return { ok: false, reason: "empty" };
  const out: McpScope[] = [];
  for (const scope of scopes) {
    if (!isKnownMcpScope(scope)) return { ok: false, reason: "unknown_scope" };
    if (!isLaunchEnabledMcpScope(scope)) return { ok: false, reason: "scope_not_enabled" };
    if (!out.includes(scope)) out.push(scope);
  }
  return { ok: true, scopes: out };
}
