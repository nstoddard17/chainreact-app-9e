import {
  validateMcpScopes,
  hasMcpScope,
  KNOWN_MCP_SCOPES,
  LAUNCH_ENABLED_MCP_SCOPES,
  MCP_SCOPE_WORKFLOWS_READ,
  MCP_SCOPE_RUNS_READ,
} from "@/core/mcp/scopes";

/**
 * MCP scope model tests (Slice 4.PUBLIC-MCP-1). All launch scopes are read-only.
 */

describe("core/mcp/scopes", () => {
  it("every launch-enabled scope is known and read-only", () => {
    for (const scope of LAUNCH_ENABLED_MCP_SCOPES) {
      expect(KNOWN_MCP_SCOPES).toContain(scope);
      expect(scope.endsWith(":read")).toBe(true);
    }
  });

  it("validates a good scope list and de-duplicates", () => {
    const r = validateMcpScopes([MCP_SCOPE_WORKFLOWS_READ, MCP_SCOPE_WORKFLOWS_READ, MCP_SCOPE_RUNS_READ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.scopes).toEqual([MCP_SCOPE_WORKFLOWS_READ, MCP_SCOPE_RUNS_READ]);
  });

  it("rejects empty and unknown scopes", () => {
    expect(validateMcpScopes([])).toEqual({ ok: false, reason: "empty" });
    expect(validateMcpScopes(["workflows:trigger"])).toEqual({ ok: false, reason: "unknown_scope" });
    expect(validateMcpScopes(["accounts:write"])).toEqual({ ok: false, reason: "unknown_scope" });
  });

  it("hasMcpScope checks membership", () => {
    expect(hasMcpScope([MCP_SCOPE_WORKFLOWS_READ], MCP_SCOPE_WORKFLOWS_READ)).toBe(true);
    expect(hasMcpScope([MCP_SCOPE_RUNS_READ], MCP_SCOPE_WORKFLOWS_READ)).toBe(false);
    expect(hasMcpScope([], MCP_SCOPE_WORKFLOWS_READ)).toBe(false);
  });
});
