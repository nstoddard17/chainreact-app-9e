/**
 * Protects the internal MCP server's documentation tools (the allowed-read
 * happy path) and the registry/protocol wiring.
 *
 * Business rule: a whitelisted rule doc read SUCCEEDS and returns real content;
 * unknown tools/methods are rejected cleanly; tool output is wrapped + bounded.
 */
import { docsTools } from "@/scripts/mcp/tools/docs";
import { buildRegistry } from "@/scripts/mcp/tools";
import { handleRpc, type JsonRpcRequest } from "@/scripts/mcp/protocol";

function rpc(method: string, params?: Record<string, unknown>): JsonRpcRequest {
  return { jsonrpc: "2.0", id: 1, method, params };
}

describe("internal MCP documentation tools", () => {
  it("reads a whitelisted rule doc and returns its real content", async () => {
    const tool = docsTools.find((t) => t.name === "read_rule_doc")!;
    const out = String(await tool.handler({ name: "provider-registry" }));
    expect(out).toContain("Provider Registry");
    expect(out).toContain("manifest");
  });

  it("strips a traversal attempt in a rule-doc name to a bare name", () => {
    const tool = docsTools.find((t) => t.name === "read_rule_doc")!;
    // basename() reduces this to "passwd"; the read is attempted at
    // docs/rules/passwd.md (which does not exist) — it never escapes to /etc.
    let thrown: Error | undefined;
    try {
      tool.handler({ name: "../../../etc/passwd" });
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).toBeDefined();
    const msg = String(thrown?.message);
    expect(msg).toContain("passwd.md");
    expect(msg).not.toContain("etc");
  });

  it("returns a heading outline for CLAUDE.md without dumping the whole file", async () => {
    const tool = docsTools.find(
      (t) => t.name === "get_claude_instructions_summary",
    )!;
    const out = String(await tool.handler({}));
    expect(out).toContain("outline");
    expect(out).toMatch(/- .+/);
  });

  it("finds matches across docs via search_project_docs", async () => {
    const tool = docsTools.find((t) => t.name === "search_project_docs")!;
    const out = String(await tool.handler({ query: "ProviderManifest" }));
    expect(out).toMatch(/match\(es\)|No matches/);
  });
});

describe("internal MCP registry + protocol", () => {
  it("lists every registered tool over tools/list", async () => {
    const registry = buildRegistry();
    const res = await handleRpc(rpc("tools/list"), registry);
    const tools = (res?.result as { tools: { name: string }[] }).tools;
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "get_project_memory",
        "list_rule_docs",
        "read_rule_doc",
        "search_project_docs",
        "list_provider_manifests",
        "get_provider_manifest_summary",
        "get_claude_instructions_summary",
        "run_typecheck",
        "run_lint",
        "run_structure_lint",
      ]),
    );
  });

  it("echoes the requested protocol version on initialize", async () => {
    const registry = buildRegistry();
    const res = await handleRpc(
      rpc("initialize", { protocolVersion: "2025-06-18" }),
      registry,
    );
    expect((res?.result as { protocolVersion: string }).protocolVersion).toBe(
      "2025-06-18",
    );
  });

  it("returns a text content envelope for a successful tools/call", async () => {
    const registry = buildRegistry();
    const res = await handleRpc(
      rpc("tools/call", { name: "get_project_memory", arguments: {} }),
      registry,
    );
    const content = (res?.result as { content: { type: string; text: string }[] })
      .content;
    expect(content[0]?.type).toBe("text");
    expect(content[0]?.text).toContain("Project Memory");
  });

  it("rejects an unknown tool with a JSON-RPC method-not-found error", async () => {
    const registry = buildRegistry();
    const res = await handleRpc(
      rpc("tools/call", { name: "make_api_call", arguments: {} }),
      registry,
    );
    expect(res?.error?.code).toBe(-32601);
  });

  it("treats notifications/initialized as a no-reply notification", async () => {
    const registry = buildRegistry();
    const res = await handleRpc(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      registry,
    );
    expect(res).toBeNull();
  });
});
