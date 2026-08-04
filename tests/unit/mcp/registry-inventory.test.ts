/**
 * @jest-environment node
 *
 * AUTHORITATIVE MCP tool inventory — scripts/mcp/tools/index.ts `buildRegistry()`.
 *
 * TEST-REDUNDANCY-CONSOLIDATION-2A — the per-tool suites each carried an
 * `it("is registered in the MCP registry")` that only proved
 * `list().map(name)` CONTAINED its own tool. Seven of those were removed in
 * favour of this one contract, which is strictly stronger than all of them
 * combined: `toEqual` on the sorted list fails when an expected tool
 * DISAPPEARS (what the old tests caught) and also when an UNAPPROVED tool
 * APPEARS (which none of them could catch).
 *
 * The MCP surface is developer tooling an AI host drives, so an unreviewed
 * tool silently joining the registry is exactly the regression worth failing
 * on: adding one must be a deliberate edit here.
 *
 * This file covers REGISTRATION ONLY. Every behavioural guard — account
 * isolation, path whitelisting, filesystem fencing, output redaction,
 * credential handling, argv validation, malformed input — stays in its own
 * suite and none were touched.
 */
import { buildRegistry } from "@/scripts/mcp/tools";

/**
 * Every tool the curated read-only registry exposes, sorted. Maintained
 * deliberately: adding a tool to scripts/mcp/tools/index.ts without adding it
 * here fails, which is the intended review gate.
 */
const EXPECTED_TOOL_NAMES: ReadonlyArray<string> = [
  "diagnose_integration_connection",
  "diagnose_option_source",
  "diagnose_option_source_live",
  "diagnose_run_failure",
  "diagnose_workflow_connections",
  "diagnose_workflow_graph",
  "diagnose_workflow_readiness",
  "doctor_account_integration",
  "doctor_provider",
  "doctor_workflow",
  "explain_provider_connection_requirements",
  "explain_run_visibility",
  "find_route_handlers",
  "find_tests_for_file",
  "generate_deploy_readiness_report",
  "generate_diagnostic_report",
  "get_claude_instructions_summary",
  "get_file_outline",
  "get_project_memory",
  "get_provider_manifest_summary",
  "list_available_npm_checks",
  "list_builder_metadata_gaps",
  "list_provider_manifests",
  "list_recent_smoke_failures",
  "list_rule_docs",
  "no_leak_scanner",
  "option_source_coverage_check",
  "provider_action_trigger_counts",
  "provider_capability_matrix",
  "provider_metadata_consistency_check",
  "read_rule_doc",
  "read_smoke_failure_context",
  "repo_file_search",
  "run_jest_for_path",
  "run_lint",
  "run_migration_lint",
  "run_provider_metadata_tests",
  "run_route_structure_tests",
  "run_structure_lint",
  "run_typecheck",
  "search_project_docs",
  "suggest_verification_for_changed_files",
  "summarize_last_test_failure",
];

describe("MCP tool registry — authoritative inventory", () => {
  it("registers EXACTLY the expected tools (none missing, none extra)", () => {
    const names = buildRegistry()
      .list()
      .map((t) => t.name)
      .sort();
    expect(names).toEqual([...EXPECTED_TOOL_NAMES]);
  });

  it("is non-empty and free of duplicate tool names", () => {
    const names = buildRegistry()
      .list()
      .map((t) => t.name);
    // Fail-closed floor: an empty registry would make a uniqueness check
    // vacuously true, and would make the toEqual above the only real guard.
    expect(names.length).toBe(EXPECTED_TOOL_NAMES.length);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every registered tool exposes an invocable handler and a description", () => {
    const tools = buildRegistry().list();
    expect(tools.length).toBe(EXPECTED_TOOL_NAMES.length);
    for (const tool of tools) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.handler).toBe("function");
    }
  });
});
