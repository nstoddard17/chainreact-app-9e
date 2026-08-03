/** @jest-environment node */
/**
 * Phase A-1 repo-navigation MCP tools — safety + behavior.
 *
 * Business rule: these orientation tools are READ-ONLY and bounded. They must
 * (a) refuse path traversal / absolute / blocked secret+build paths, (b) stay
 * inside the allow-listed roots, (c) cap output, (d) detect route methods + auth
 * markers, (e) map source→test by convention, and (f) NEVER return a full file
 * body (outline = structure only). A regression here would widen the curated,
 * secret-free read surface or leak code bodies.
 */
import { LIMITS } from "@/scripts/mcp/config";
import {
  detectAuthMarkers,
  detectRouteMethods,
  outlineForFile,
  repoNavTools,
  testCandidatesFor,
} from "@/scripts/mcp/tools/repoNav";
import { buildRegistry } from "@/scripts/mcp/tools";

const tool = (name: string) => {
  const t = repoNavTools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t;
};
const call = (name: string, args: Record<string, unknown> = {}): string =>
  tool(name).handler(args) as string;

const ROUTE = "app/api/internal/diagnostics/run-failure/route.ts";

describe("pure helpers", () => {
  it("detectRouteMethods finds function and const method exports", () => {
    expect(detectRouteMethods("export async function POST(req){}\n")).toEqual(["POST"]);
    expect(detectRouteMethods("export const GET = () => {}; export function PUT(){}")).toEqual([
      "GET",
      "PUT",
    ]);
    expect(detectRouteMethods("function POST(){} // not exported")).toEqual([]);
  });

  it("detectAuthMarkers reports the guard identifiers actually present", () => {
    const src = "const g = applyDiagnosticsGate(req); requireUserWithAccount(); authorizeFolderAccess();";
    expect(detectAuthMarkers(src)).toEqual(
      ["applyDiagnosticsGate", "authorizeFolderAccess", "requireUserWithAccount"].sort(),
    );
    expect(detectAuthMarkers("export function POST(){}")).toEqual([]);
  });

  it("testCandidatesFor mirrors source→test convention incl. flattened routes", () => {
    expect(testCandidatesFor("services/diagnostics/runReport.ts")).toContain(
      "tests/unit/services/diagnostics/runReport.test.ts",
    );
    expect(testCandidatesFor("app/api/internal/diagnostics/run-failure/route.ts")).toContain(
      "tests/unit/app/api/internal/diagnostics/run-failure-route.test.ts",
    );
  });

  it("outlineForFile returns structure only (headings / exports / methods)", () => {
    expect(outlineForFile("x.md", "# Title\n\nbody prose\n## Sub")).toEqual([
      "# Title",
      "## Sub",
    ]);
    const ts = outlineForFile("svc/x.ts", 'export const SECRET_TOKEN = "abc123";\nexport function foo(){}');
    expect(ts).toContain("export const SECRET_TOKEN");
    expect(ts).toContain("export function foo");
    // NAME only — never the initializer value.
    expect(ts.join("\n")).not.toContain("abc123");
  });
});

describe("repo_file_search", () => {
  it("returns paths for a real file and rejects too-short queries", () => {
    expect(call("repo_file_search", { query: "x" })).toMatch(/at least 2 characters/);
    const out = call("repo_file_search", { query: "scripts/mcp/tools/repoNav" });
    expect(out).toContain("scripts/mcp/tools/repoNav.ts");
  });

  it("stays inside allow-listed roots and caps results", () => {
    const out = call("repo_file_search", { query: "ts" });
    const paths = out
      .split("\n")
      .filter((l) => /\.(ts|tsx|js|jsx|mjs|md|sql)$/.test(l.trim()));
    expect(paths.length).toBeLessThanOrEqual(LIMITS.navMaxResults);
    // every returned path must sit under an allow-listed root
    for (const p of paths) {
      expect(p).toMatch(
        /^(app|components|contracts|core|features|integrations|lib|repositories|services|stores|utils|workflow-engine|scripts\/mcp|tests|docs)\//,
      );
    }
  });
});

describe("find_route_handlers", () => {
  it("detects a gated diagnostics route with its method and auth marker", () => {
    const out = call("find_route_handlers", { pathPrefix: "api/internal/diagnostics" });
    expect(out).toContain(ROUTE);
    expect(out).toContain("POST");
    expect(out).toContain("applyDiagnosticsGate");
  });

  it("pathPrefix filters out unrelated routes", () => {
    const out = call("find_route_handlers", { pathPrefix: "api/internal/diagnostics" });
    expect(out).not.toMatch(/app\/api\/account\//);
  });
});

describe("find_tests_for_file", () => {
  it("finds an existing convention-named test", () => {
    const out = call("find_tests_for_file", { filePath: "services/diagnostics/runReport.ts" });
    expect(out).toContain("tests/unit/services/diagnostics/runReport.test.ts");
    expect(out).toMatch(/Existing test/);
  });

  it("maps a route file to its flattened test path", () => {
    const out = call("find_tests_for_file", { filePath: ROUTE });
    expect(out).toContain("tests/unit/app/api/internal/diagnostics/run-failure-route.test.ts");
  });

  it("rejects traversal and absolute paths", () => {
    expect(call("find_tests_for_file", { filePath: "../../../etc/passwd" })).toMatch(/not allowed/i);
    expect(call("find_tests_for_file", { filePath: "/etc/passwd" })).toMatch(/not allowed/i);
  });
});

describe("get_file_outline", () => {
  it("outlines markdown headings without dumping body prose", () => {
    const out = call("get_file_outline", { filePath: "docs/PROJECT_MEMORY.md" });
    expect(out).toContain("Project Memory");
    expect(out).not.toContain("Compact curated project state");
  });

  it("outlines a route's methods without returning the body", () => {
    const out = call("get_file_outline", { filePath: ROUTE });
    expect(out).toContain("route method: POST");
    expect(out).not.toContain("invalid_input");
  });

  it("allows CLAUDE.md but rejects out-of-whitelist, traversal, and secret paths", () => {
    expect(call("get_file_outline", { filePath: "CLAUDE.md" })).toMatch(/Outline of CLAUDE\.md/);
    // package.json sits at repo root, outside the code-root whitelist.
    expect(call("get_file_outline", { filePath: "package.json" })).toMatch(/not allowed/i);
    expect(call("get_file_outline", { filePath: ".env" })).toMatch(/not allowed/i);
    expect(call("get_file_outline", { filePath: "docs/../package.json" })).toMatch(/not allowed/i);
    expect(call("get_file_outline", { filePath: "app/api/secret-token.ts" })).toMatch(/not allowed/i);
  });
});

describe("registry wiring", () => {
  it("registers the Phase A-1 tools with unique names", () => {
    const names = buildRegistry().list().map((t) => t.name);
    for (const n of [
      "repo_file_search",
      "find_route_handlers",
      "find_tests_for_file",
      "get_file_outline",
      "suggest_verification_for_changed_files",
      "list_available_npm_checks",
    ]) {
      expect(names).toContain(n);
    }
    // no duplicate names (buildRegistry throws on dup; also assert set size)
    expect(new Set(names).size).toBe(names.length);
  });
});
